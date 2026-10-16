//! Point d'entrée de la bibliothèque applicative RAKETA (Tauri 2).

mod bridge;
mod commands;
mod manager;
mod settings;

use directories::{ProjectDirs, UserDirs};
use manager::AppState;
use std::path::PathBuf;
use tauri::Manager;

/// Dossier de données applicatives (base, état) — hors dépôt, côté utilisateur.
fn data_dir() -> PathBuf {
    ProjectDirs::from("com", "SmartServiceAndroy", "RAKETA")
        .map(|d| d.data_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Dossier de téléchargement par défaut (Téléchargements de l'utilisateur).
fn default_download_dir() -> PathBuf {
    UserDirs::new()
        .and_then(|u| u.download_dir().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| data_dir().join("downloads"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // AppState initialise le moteur torrent (async) : on construit dans le
    // runtime de Tauri avant de démarrer l'application.
    let state = tauri::async_runtime::block_on(AppState::new(
        &data_dir(),
        &default_download_dir(),
    ))
    .expect("initialisation de l'état applicatif");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(state)
        .setup(|app| {
            // Boucles de fond : ordonnanceur de file, progression des torrents,
            // capture du presse-papiers.
            let state = app.state::<AppState>();
            state.spawn_scheduler(app.handle().clone());
            state.spawn_torrent_reporter(app.handle().clone());
            state.spawn_clipboard_watcher(app.handle().clone());
            // Pont navigateur (extension Chrome/Edge/Firefox).
            bridge::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::probe_url,
            commands::add_download,
            commands::add_batch,
            commands::list_downloads,
            commands::download_events,
            commands::pause_download,
            commands::resume_download,
            commands::cancel_download,
            commands::remove_download,
            commands::open_file,
            commands::reveal_in_folder,
            commands::add_torrent,
            commands::add_torrent_file,
            commands::list_torrents,
            commands::pause_torrent,
            commands::resume_torrent,
            commands::remove_torrent,
            commands::get_settings,
            commands::set_settings,
            commands::open_browser,
            commands::open_external_url,
            commands::get_app_version,
            commands::check_update,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application RAKETA");
}
