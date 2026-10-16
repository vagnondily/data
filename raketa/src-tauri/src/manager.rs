//! État applicatif et orchestration des téléchargements côté Tauri.
//!
//! Le moteur (`raketa-core`) reste indépendant de l'UI : ce module fait le pont
//! entre les commandes invoquées depuis React, la base SQLite et les événements
//! de progression typés publiés vers l'interface (section 5.1).

use crate::settings::Settings;
use raketa_core::model::{Control, DownloadStatus, DownloadTask, Outcome, Progress};
use raketa_core::{Engine, ProgressFn, Store};
use raketa_torrent::TorrentManager;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, Notify};

/// Canal d'événement de progression des téléchargements HTTP.
pub const EVENT_PROGRESS: &str = "raketa://progress";
/// Canal d'événement de progression des torrents.
pub const EVENT_TORRENT: &str = "raketa://torrent-progress";
/// Canal d'événement : une URL intéressante a été copiée dans le presse-papiers.
pub const EVENT_CLIPBOARD: &str = "raketa://clipboard-url";

/// État global partagé, injecté dans chaque commande Tauri.
pub struct AppState {
    pub engine: Engine,
    pub store: Arc<Mutex<Store>>,
    /// Jetons de contrôle des transferts en cours (pause/annulation).
    pub controls: Arc<Mutex<HashMap<String, Control>>>,
    /// Moteur BitTorrent (magnets + .torrent).
    pub torrents: Arc<TorrentManager>,
    /// Préférences utilisateur (appliquées au moteur à chaud).
    pub settings: Arc<Mutex<Settings>>,
    /// Nombre de téléchargements HTTP actifs (pour la file d'attente).
    pub active: Arc<AtomicUsize>,
    /// File d'attente des téléchargements en attente d'un créneau.
    pub queue: Arc<Mutex<VecDeque<DownloadTask>>>,
    /// Réveille l'ordonnanceur (nouvel ajout ou créneau libéré).
    notify: Arc<Notify>,
}

impl AppState {
    /// Initialise le moteur HTTP, la base SQLite et le moteur torrent.
    ///
    /// `data_dir` : dossier applicatif (base, état). `download_dir` : destination
    /// par défaut des torrents.
    pub async fn new(data_dir: &PathBuf, download_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let db_path = data_dir.join("raketa.db");
        let store = Store::open(&db_path).map_err(|e| e.to_string())?;
        // Au démarrage, on ramène les tâches « en cours » à l'état pausé (FR-04).
        let recovered = store.recover_interrupted().map_err(|e| e.to_string())?;
        if recovered > 0 {
            eprintln!("[raketa] {recovered} tâche(s) interrompue(s) restaurée(s) en pause");
        }
        let engine = Engine::new().map_err(|e| e.to_string())?;

        // Charge les préférences et les applique au moteur (vitesse, connexions).
        let settings = Settings::load(&store, download_dir.display().to_string());
        settings.apply_to_engine(&engine);

        let torrents = TorrentManager::new(download_dir.clone())
            .await
            .map_err(|e| format!("moteur torrent : {e}"))?;
        Ok(Self {
            engine,
            store: Arc::new(Mutex::new(store)),
            controls: Arc::new(Mutex::new(HashMap::new())),
            torrents: Arc::new(torrents),
            settings: Arc::new(Mutex::new(settings)),
            active: Arc::new(AtomicUsize::new(0)),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            notify: Arc::new(Notify::new()),
        })
    }

    /// Surveille le presse-papiers : si une URL http(s) nouvelle est copiée et
    /// que l'option est active, publie `raketa://clipboard-url` (l'UI propose de
    /// l'ajouter). Capture de liens « façon IDM », sans ajout silencieux.
    pub fn spawn_clipboard_watcher(&self, app: AppHandle) {
        let settings = self.settings.clone();
        tauri::async_runtime::spawn(async move {
            use tauri_plugin_clipboard_manager::ClipboardExt;
            let mut last = String::new();
            let mut ticker = tokio::time::interval(std::time::Duration::from_millis(1200));
            loop {
                ticker.tick().await;
                if !settings.lock().await.clipboard_watch {
                    continue;
                }
                let text = app.clipboard().read_text().unwrap_or_default();
                let trimmed = text.trim().to_string();
                if trimmed != last
                    && (trimmed.starts_with("http://") || trimmed.starts_with("https://"))
                    && !trimmed.contains(char::is_whitespace)
                {
                    last = trimmed.clone();
                    let _ = app.emit(EVENT_CLIPBOARD, &trimmed);
                }
            }
        });
    }

    /// Démarre une boucle de fond qui publie la progression des torrents.
    ///
    /// librqbit ne pousse pas d'événements : on interroge périodiquement l'état
    /// et on l'émet vers l'UI (canal `raketa://torrent-progress`).
    pub fn spawn_torrent_reporter(&self, app: AppHandle) {
        let torrents = self.torrents.clone();
        tauri::async_runtime::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_millis(1000));
            loop {
                ticker.tick().await;
                let list = torrents.list().await;
                if !list.is_empty() {
                    let _ = app.emit(EVENT_TORRENT, &list);
                }
            }
        });
    }

    /// Soumet un téléchargement : il est mis en file et l'ordonnanceur le
    /// démarre dès qu'un créneau est disponible (limite « max simultanés »).
    pub async fn submit(&self, _app: AppHandle, task: DownloadTask) {
        self.queue.lock().await.push_back(task);
        self.notify.notify_one();
    }

    /// Démarre l'ordonnanceur : une tâche de fond qui, à chaque réveil, lance
    /// autant de téléchargements en file que la limite le permet. Réveillé à
    /// chaque ajout (`submit`) et à chaque créneau libéré (fin d'un transfert).
    ///
    /// Conçu sans `State` ni récursion pour rester `Send` (requis par `spawn`).
    pub fn spawn_scheduler(&self, app: AppHandle) {
        let engine = self.engine.clone();
        let store = self.store.clone();
        let controls = self.controls.clone();
        let settings = self.settings.clone();
        let active = self.active.clone();
        let queue = self.queue.clone();
        let notify = self.notify.clone();

        tauri::async_runtime::spawn(async move {
            loop {
                notify.notified().await;
                loop {
                    let max = settings.lock().await.max_simultaneous.max(1);
                    if active.load(Ordering::SeqCst) >= max {
                        break;
                    }
                    let Some(task) = queue.lock().await.pop_front() else {
                        break;
                    };
                    active.fetch_add(1, Ordering::SeqCst);
                    spawn_download(
                        engine.clone(),
                        store.clone(),
                        controls.clone(),
                        active.clone(),
                        notify.clone(),
                        app.clone(),
                        task,
                    );
                }
            }
        });
    }
}

/// Exécute un transfert en tâche de fond : publie la progression, persiste
/// l'état final, libère le créneau et réveille l'ordonnanceur.
///
/// Fonction libre (pas de `&AppState`) pour que le futur reste `Send`.
#[allow(clippy::too_many_arguments)]
fn spawn_download(
    engine: Engine,
    store: Arc<Mutex<Store>>,
    controls: Arc<Mutex<HashMap<String, Control>>>,
    active: Arc<AtomicUsize>,
    notify: Arc<Notify>,
    app: AppHandle,
    task: DownloadTask,
) {
    let control = Control::new();

    tokio::spawn(async move {
        controls
            .lock()
            .await
            .insert(task.id.clone(), control.clone());

        let progress_cb: ProgressFn = {
            let app = app.clone();
            Arc::new(move |p: Progress| {
                let _ = app.emit(EVENT_PROGRESS, &p);
            })
        };

        let result = engine.download(&task, control, progress_cb).await;

        {
            let store = store.lock().await;
            match result {
                Ok(Outcome::Completed { path, bytes, sha256 }) => {
                    let _ =
                        store.mark_completed(&task.id, sha256.as_deref().unwrap_or(""), &path, bytes);
                    let _ = app.emit(
                        EVENT_PROGRESS,
                        &Progress {
                            download_id: task.id.clone(),
                            downloaded: bytes,
                            total: Some(bytes),
                            speed_bps: 0.0,
                            status: DownloadStatus::Completed,
                        },
                    );
                }
                Ok(Outcome::Paused { downloaded }) => {
                    let _ =
                        store.update_progress(&task.id, DownloadStatus::Paused, downloaded, None);
                }
                Err(e) => {
                    let code = format!("{e}");
                    let _ = store.mark_error(&task.id, "engine", &code);
                    let _ = app.emit(
                        EVENT_PROGRESS,
                        &Progress {
                            download_id: task.id.clone(),
                            downloaded: 0,
                            total: None,
                            speed_bps: 0.0,
                            status: DownloadStatus::Error,
                        },
                    );
                }
            }
        }

        controls.lock().await.remove(&task.id);

        // Libère le créneau et réveille l'ordonnanceur pour le suivant.
        active.fetch_sub(1, Ordering::SeqCst);
        notify.notify_one();
    });
}
