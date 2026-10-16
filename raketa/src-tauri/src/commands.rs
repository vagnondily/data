//! Commandes Tauri invoquées depuis l'interface React.
//!
//! Chaque commande valide ses entrées (section 5.1) et délègue au moteur ou au
//! stockage. Les secrets éventuels ne transitent jamais par les logs.

use crate::manager::AppState;
use raketa_core::model::{DownloadStatus, DownloadTask, RemoteInfo};
use serde::Serialize;
use tauri::{AppHandle, State};
use uuid::Uuid;

/// Vue d'un téléchargement exposée au front (DTO sérialisable).
#[derive(Debug, Serialize)]
pub struct DownloadDto {
    pub id: String,
    pub url: String,
    pub display_name: String,
    pub destination: String,
    pub status: String,
    pub total_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    pub mime_type: Option<String>,
    pub sha256: Option<String>,
    pub error_code: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<raketa_core::DownloadRecord> for DownloadDto {
    fn from(r: raketa_core::DownloadRecord) -> Self {
        Self {
            id: r.id,
            url: r.url,
            display_name: r.display_name,
            destination: r.destination,
            status: r.status.as_str().to_string(),
            total_bytes: r.total_bytes,
            downloaded_bytes: r.downloaded_bytes,
            mime_type: r.mime_type,
            sha256: r.sha256,
            error_code: r.error_code,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

/// Sonde une URL (métadonnées) sans démarrer le téléchargement.
#[tauri::command]
pub async fn probe_url(state: State<'_, AppState>, url: String) -> Result<RemoteInfo, String> {
    state.engine.probe(&url).await.map_err(|e| e.to_string())
}

/// Ajoute et démarre un téléchargement. Renvoie son identifiant.
#[tauri::command]
pub async fn add_download(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    dest_dir: String,
    filename: Option<String>,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    // Validation de schéma avant toute chose (section 12).
    raketa_core::metadata::validate_scheme(&url).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let task = DownloadTask {
        id: id.clone(),
        url,
        dest_dir,
        filename,
        expected_sha256,
    };

    // Nom d'affichage initial : sonde best-effort, repli sur l'URL.
    let display_name = match state.engine.probe(&task.url).await {
        Ok(info) => info
            .suggested_filename
            .unwrap_or_else(|| raketa_core::filename::from_url(&task.url)),
        Err(_) => raketa_core::filename::from_url(&task.url),
    };

    {
        let store = state.store.lock().await;
        store.insert(&task, &display_name).map_err(|e| e.to_string())?;
    }

    state.start_download(app, task).await;
    Ok(id)
}

/// Liste tous les téléchargements, plus récents d'abord.
#[tauri::command]
pub async fn list_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadDto>, String> {
    let store = state.store.lock().await;
    let records = store.list().map_err(|e| e.to_string())?;
    Ok(records.into_iter().map(DownloadDto::from).collect())
}

/// Met en pause un transfert en cours.
#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(ctrl) = state.controls.lock().await.get(&id) {
        ctrl.pause();
    }
    Ok(())
}

/// Reprend un transfert mis en pause (relance une tâche de fond).
#[tauri::command]
pub async fn resume_download(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let record = {
        let store = state.store.lock().await;
        store.get(&id).map_err(|e| e.to_string())?
    };
    let Some(record) = record else {
        return Err("téléchargement introuvable".into());
    };

    let task = DownloadTask {
        id: record.id.clone(),
        url: record.url,
        dest_dir: record.destination,
        filename: Some(record.display_name),
        expected_sha256: record.sha256,
    };
    {
        let store = state.store.lock().await;
        store
            .update_progress(&id, DownloadStatus::Downloading, record.downloaded_bytes, record.total_bytes)
            .map_err(|e| e.to_string())?;
    }
    state.start_download(app, task).await;
    Ok(())
}

/// Annule un transfert (le fichier partiel est conservé de façon contrôlée).
#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, id: String) -> Result<(), String> {
    if let Some(ctrl) = state.controls.lock().await.get(&id) {
        ctrl.cancel();
    }
    let store = state.store.lock().await;
    store
        .update_progress(&id, DownloadStatus::Cancelled, 0, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}
