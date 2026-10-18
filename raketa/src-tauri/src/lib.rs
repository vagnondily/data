//! Point d'entrée de la bibliothèque applicative RAKETA (Tauri 2).

mod bridge;
mod commands;
mod firewall;
mod logx;
mod manager;
mod media;
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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(state)
        .setup(|app| {
            // Boucles de fond : ordonnanceur de file, progression des torrents,
            // capture du presse-papiers.
            let state = app.state::<AppState>();
            state.spawn_scheduler(app.handle().clone());
            state.spawn_torrent_reporter(app.handle().clone());
            state.spawn_clipboard_watcher(app.handle().clone());
            // Reprise automatique des transferts qui étaient actifs lors du
            // dernier arrêt (ordonnanceur déjà démarré, limite respectée). Les
            // pauses volontaires de l'utilisateur ne sont pas reprises.
            let resume_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                resume_handle
                    .state::<AppState>()
                    .resume_interrupted(resume_handle.clone())
                    .await;
            });
            // Pont navigateur (extension Chrome/Edge/Firefox).
            bridge::start(app.handle().clone());
            logx::log(
                "INFO",
                &format!("RAKETA démarré (build {})", option_env!("RAKETA_BUILD").unwrap_or("dev")),
            );

            // Applique les préférences système (réduction en zone de
            // notification, démarrage automatique). Lecture non bloquante :
            // au démarrage, personne d'autre ne détient le verrou.
            let (tray_on_close, autostart) = match app.state::<AppState>().settings.try_lock() {
                Ok(s) => (s.minimize_to_tray, s.autostart),
                Err(_) => (true, false),
            };
            manager::TRAY_ON_CLOSE.store(tray_on_close, std::sync::atomic::Ordering::SeqCst);
            {
                use tauri_plugin_autostart::ManagerExt;
                let al = app.autolaunch();
                let _ = if autostart { al.enable() } else { al.disable() };
            }

            // Zone de notification (icône + menu Afficher / Quitter), façon IDM.
            if let Some(icon) = app.default_window_icon().cloned() {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
                let show_i = MenuItem::with_id(app, "show", "Afficher RAKETA", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
                let handle = app.handle().clone();
                let _tray = TrayIconBuilder::new()
                    .tooltip("RAKETA — Gestionnaire de téléchargement")
                    .icon(icon)
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(move |_tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(w) = handle.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            // Fermeture de la fenêtre → réduire dans la zone de notification
            // (si l'option est active), sinon fermeture normale.
            if let Some(win) = app.get_webview_window("main") {
                let win_bg = win.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if manager::TRAY_ON_CLOSE.load(std::sync::atomic::Ordering::SeqCst) {
                            api.prevent_close();
                            let _ = win_bg.hide();
                        }
                    }
                });
            }
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
            commands::download_update,
            commands::run_installer,
            commands::install_extension,
            commands::open_browser_extensions,
            commands::media_probe,
            commands::media_download,
            commands::media_cancel,
            commands::media_tools_status,
            commands::install_ffmpeg,
            commands::set_rate_limit_live,
            commands::list_history,
            commands::delete_history_entry,
            commands::clear_history,
            commands::set_always_on_top,
            commands::dock_right,
            commands::restore_window,
            commands::redownload,
            commands::read_log,
            commands::open_log,
            commands::clear_log,
            commands::firewall_status,
            commands::firewall_authorize,
            commands::detect_part_groups,
            commands::join_parts,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application RAKETA");
}
