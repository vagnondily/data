//! État applicatif et orchestration des téléchargements côté Tauri.
//!
//! Le moteur (`raketa-core`) reste indépendant de l'UI : ce module fait le pont
//! entre les commandes invoquées depuis React, la base SQLite et les événements
//! de progression typés publiés vers l'interface (section 5.1).

use raketa_core::model::{Control, DownloadStatus, DownloadTask, Outcome, Progress};
use raketa_core::{Engine, Store};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Canal d'événement de progression écouté par le front.
pub const EVENT_PROGRESS: &str = "raketa://progress";

/// État global partagé, injecté dans chaque commande Tauri.
pub struct AppState {
    pub engine: Engine,
    pub store: Arc<Mutex<Store>>,
    /// Jetons de contrôle des transferts en cours (pause/annulation).
    pub controls: Arc<Mutex<HashMap<String, Control>>>,
}

impl AppState {
    /// Initialise le moteur et ouvre la base de données applicative.
    pub fn new(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let db_path = data_dir.join("raketa.db");
        let store = Store::open(&db_path).map_err(|e| e.to_string())?;
        // Au démarrage, on ramène les tâches « en cours » à l'état pausé (FR-04).
        let recovered = store.recover_interrupted().map_err(|e| e.to_string())?;
        if recovered > 0 {
            eprintln!("[raketa] {recovered} tâche(s) interrompue(s) restaurée(s) en pause");
        }
        let engine = Engine::new().map_err(|e| e.to_string())?;
        Ok(Self {
            engine,
            store: Arc::new(Mutex::new(store)),
            controls: Arc::new(Mutex::new(HashMap::new())),
        })
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
