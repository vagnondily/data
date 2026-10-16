//! Point d'entrée de la bibliothèque applicative RAKETA (Tauri 2).

mod commands;
mod manager;

use directories::ProjectDirs;
use manager::AppState;
use std::path::PathBuf;

/// Détermine le dossier de données applicatives (hors dépôt, côté utilisateur).
fn data_dir() -> PathBuf {
    ProjectDirs::from("com", "SmartServiceAndroy", "RAKETA")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::new(&data_dir()).expect("initialisation de l'état applicatif");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::probe_url,
            commands::add_download,
            commands::list_downloads,
            commands::pause_download,
            commands::resume_download,
            commands::cancel_download,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application RAKETA");
}
