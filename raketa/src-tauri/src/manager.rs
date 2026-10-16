//! État applicatif et orchestration des téléchargements côté Tauri.
//!
//! Le moteur (`raketa-core`) reste indépendant de l'UI : ce module fait le pont
//! entre les commandes invoquées depuis React, la base SQLite et les événements
//! de progression typés publiés vers l'interface (section 5.1).

use raketa_core::model::{Control, DownloadStatus, DownloadTask, Outcome, Progress};
use raketa_core::{Engine, Store};
use raketa_torrent::TorrentManager;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Canal d'événement de progression des téléchargements HTTP.
pub const EVENT_PROGRESS: &str = "raketa://progress";
/// Canal d'événement de progression des torrents.
pub const EVENT_TORRENT: &str = "raketa://torrent-progress";

/// État global partagé, injecté dans chaque commande Tauri.
pub struct AppState {
    pub engine: Engine,
    pub store: Arc<Mutex<Store>>,
    /// Jetons de contrôle des transferts en cours (pause/annulation).
    pub controls: Arc<Mutex<HashMap<String, Control>>>,
    /// Moteur BitTorrent (magnets + .torrent).
    pub torrents: Arc<TorrentManager>,
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
        let torrents = TorrentManager::new(download_dir.clone())
            .await
            .map_err(|e| format!("moteur torrent : {e}"))?;
        Ok(Self {
            engine,
            store: Arc::new(Mutex::new(store)),
            controls: Arc::new(Mutex::new(HashMap::new())),
            torrents: Arc::new(torrents),
        })
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

    /// Lance un transfert en tâche de fond ; publie la progression et persiste
    /// les états terminaux (terminé / erreur / pause).
    pub async fn start_download(&self, app: AppHandle, task: DownloadTask) {
        let control = Control::new();
        {
            let mut controls = self.controls.lock().await;
            controls.insert(task.id.clone(), control.clone());
        }

        let engine = self.engine.clone();
        let store = self.store.clone();
        let controls = self.controls.clone();
        let app_for_cb = app.clone();

        tokio::spawn(async move {
            // Rappel de progression : publie vers l'UI (throttling fait par le moteur).
            let progress_cb: raketa_core::ProgressFn = {
                let app = app_for_cb.clone();
                Arc::new(move |p: Progress| {
                    let _ = app.emit(EVENT_PROGRESS, &p);
                })
            };

            let result = engine.download(&task, control, progress_cb).await;

            // Persistance de l'état final.
            let store = store.lock().await;
            match result {
                Ok(Outcome::Completed { path, bytes, sha256 }) => {
                    let _ = store.mark_completed(
                        &task.id,
                        sha256.as_deref().unwrap_or(""),
                        &path,
                        bytes,
                    );
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
                    let _ = store.update_progress(
                        &task.id,
                        DownloadStatus::Paused,
                        downloaded,
                        None,
                    );
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

            // Nettoyage du jeton de contrôle.
            controls.lock().await.remove(&task.id);
        });
    }
}
