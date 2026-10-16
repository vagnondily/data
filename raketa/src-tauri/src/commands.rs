//! Commandes Tauri invoquées depuis l'interface React.
//!
//! Chaque commande valide ses entrées (section 5.1) et délègue au moteur ou au
//! stockage. Les secrets éventuels ne transitent jamais par les logs.

use crate::manager::AppState;
use crate::settings::Settings;
use raketa_core::model::{DownloadStatus, DownloadTask, RemoteInfo};
use serde::Serialize;
use tauri::webview::{DownloadEvent, WebviewWindowBuilder};
use tauri::{AppHandle, Manager, State, WebviewUrl};
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
    /// Le fichier final existe-t-il encore sur le disque ? (pertinent si terminé)
    pub file_exists: bool,
}

impl From<raketa_core::DownloadRecord> for DownloadDto {
    fn from(r: raketa_core::DownloadRecord) -> Self {
        // Calculé avant de déplacer r.destination dans la structure.
        let file_exists = r.status != DownloadStatus::Completed
            || std::path::Path::new(&r.destination).is_file();
        Self {
            id: r.id,
            // URL expurgée des secrets pour l'affichage (section 11.1 / 12).
            url: raketa_core::redact_url(&r.url),
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
            // « Fichier manquant » : terminé mais le fichier n'est plus sur le disque.
            file_exists,
        }
    }
}

/// Sonde une URL (métadonnées) sans démarrer le téléchargement.
#[tauri::command]
pub async fn probe_url(state: State<'_, AppState>, url: String) -> Result<RemoteInfo, String> {
    state.engine.probe(&url).await.map_err(|e| e.to_string())
}

/// Prépare une tâche : résout le dossier par défaut, le nom d'affichage et le
/// rangement par catégorie selon les préférences.
async fn prepare_task(
    state: &AppState,
    url: String,
    dest_dir: String,
    filename: Option<String>,
    expected_sha256: Option<String>,
) -> Result<(DownloadTask, String), String> {
    raketa_core::metadata::validate_scheme(&url).map_err(|e| e.to_string())?;

    let settings = state.settings.lock().await.clone();

    // Nom d'affichage : nom imposé, sinon dérivé de l'URL. On NE sonde PAS ici :
    // les liens debrid/seedbox sont souvent à usage unique et chaque requête
    // supplémentaire les « consomme » (→ HTTP 404). Le moteur sondera une seule
    // fois au démarrage du téléchargement.
    let display_name = filename
        .clone()
        .unwrap_or_else(|| raketa_core::filename::from_url(&url));

    // Dossier : celui fourni, sinon le dossier par défaut ; + catégorie si activé.
    let mut dir = if dest_dir.trim().is_empty() {
        settings.default_dir.clone()
    } else {
        dest_dir
    };
    if settings.auto_categorize {
        let cat = raketa_core::categorize(&display_name);
        dir = std::path::Path::new(&dir)
            .join(cat.folder)
            .display()
            .to_string();
    }

    let task = DownloadTask {
        id: Uuid::new_v4().to_string(),
        url,
        dest_dir: dir,
        filename,
        expected_sha256,
    };
    Ok((task, display_name))
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
    let (task, display_name) =
        prepare_task(&state, url, dest_dir, filename, expected_sha256).await?;
    let id = task.id.clone();

    {
        let store = state.store.lock().await;
        store.insert(&task, &display_name).map_err(|e| e.to_string())?;
    }

    state.submit(app, task).await;
    Ok(id)
}

/// Ajoute un téléchargement à partir d'une simple URL (utilisé par le pont
/// navigateur). Dossier et nom déduits des préférences.
pub(crate) async fn add_url(
    app: AppHandle,
    state: &AppState,
    url: String,
) -> Result<String, String> {
    let (task, display_name) = prepare_task(state, url, String::new(), None, None).await?;
    let id = task.id.clone();
    {
        let store = state.store.lock().await;
        store.insert(&task, &display_name).map_err(|e| e.to_string())?;
    }
    state.submit(app, task).await;
    Ok(id)
}

/// Ajoute un lot de téléchargements depuis un motif `[1-100]` ou une liste
/// collée (une URL/motif par ligne). Renvoie le nombre de tâches créées.
#[tauri::command]
pub async fn add_batch(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
    dest_dir: String,
) -> Result<usize, String> {
    let urls = raketa_core::batch::expand_lines(&text);
    let mut created = 0usize;
    for url in urls {
        if raketa_core::metadata::validate_scheme(&url).is_err() {
            continue;
        }
        match prepare_task(&state, url, dest_dir.clone(), None, None).await {
            Ok((task, display_name)) => {
                {
                    let store = state.store.lock().await;
                    if store.insert(&task, &display_name).is_err() {
                        continue;
                    }
                }
                state.submit(app.clone(), task).await;
                created += 1;
            }
            Err(_) => continue,
        }
    }
    Ok(created)
}

/// Liste tous les téléchargements, plus récents d'abord.
#[tauri::command]
pub async fn list_downloads(state: State<'_, AppState>) -> Result<Vec<DownloadDto>, String> {
    let store = state.store.lock().await;
    let records = store.list().map_err(|e| e.to_string())?;
    Ok(records.into_iter().map(DownloadDto::from).collect())
}

/// Entrée d'historique exposée au front.
#[derive(Debug, Serialize)]
pub struct EventDto {
    pub event_type: String,
    pub timestamp: i64,
    pub message: Option<String>,
}

impl From<raketa_core::EventRecord> for EventDto {
    fn from(e: raketa_core::EventRecord) -> Self {
        Self {
            event_type: e.event_type,
            timestamp: e.timestamp,
            message: e.message,
        }
    }
}

/// Historique d'un téléchargement (événements : créé, terminé, erreur…).
#[tauri::command]
pub async fn download_events(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<EventDto>, String> {
    let store = state.store.lock().await;
    let evs = store.events(&id, 100).map_err(|e| e.to_string())?;
    Ok(evs.into_iter().map(EventDto::from).collect())
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
    state.submit(app, task).await;
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

// ---------------------------------------------------------------------------
// Torrents (magnets + .torrent) — moteur librqbit via raketa-torrent.
// ---------------------------------------------------------------------------

/// Ajoute un torrent depuis un lien magnet ou une URL `.torrent`.
///
/// `only_files` (optionnel) : indices des fichiers à télécharger (façon uTorrent).
#[tauri::command]
pub async fn add_torrent(
    state: State<'_, AppState>,
    url: String,
    only_files: Option<Vec<usize>>,
) -> Result<usize, String> {
    state
        .torrents
        .add_magnet_or_url(&url, false, only_files)
        .await
        .map_err(|e| e.to_string())
}

/// Ajoute un torrent depuis un fichier `.torrent` local.
#[tauri::command]
pub async fn add_torrent_file(
    state: State<'_, AppState>,
    path: String,
    only_files: Option<Vec<usize>>,
) -> Result<usize, String> {
    state
        .torrents
        .add_file(&path, false, only_files)
        .await
        .map_err(|e| e.to_string())
}

/// Liste l'état de tous les torrents.
#[tauri::command]
pub async fn list_torrents(
    state: State<'_, AppState>,
) -> Result<Vec<raketa_torrent::TorrentProgress>, String> {
    Ok(state.torrents.list().await)
}

/// Met un torrent en pause.
#[tauri::command]
pub async fn pause_torrent(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    state.torrents.pause(id).await.map_err(|e| e.to_string())
}

/// Reprend un torrent en pause.
#[tauri::command]
pub async fn resume_torrent(state: State<'_, AppState>, id: usize) -> Result<(), String> {
    state.torrents.resume(id).await.map_err(|e| e.to_string())
}

/// Supprime un torrent (et, si demandé, ses fichiers).
#[tauri::command]
pub async fn remove_torrent(
    state: State<'_, AppState>,
    id: usize,
    delete_files: bool,
) -> Result<(), String> {
    state
        .torrents
        .remove(id, delete_files)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Paramètres
// ---------------------------------------------------------------------------

/// Lit les préférences courantes.
#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    Ok(state.settings.lock().await.clone())
}

/// Enregistre les préférences, les persiste et les applique au moteur à chaud.
#[tauri::command]
pub async fn set_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    {
        let store = state.store.lock().await;
        settings.save(&store)?;
    }
    settings.apply_to_engine(&state.engine);
    *state.settings.lock().await = settings;
    Ok(())
}

// ---------------------------------------------------------------------------
// Navigateur intégré (intégration « façon IDM », bloqueur de popups)
// ---------------------------------------------------------------------------

/// Barre de navigation injectée (retour / avance / recharger / adresse), en JS
/// pur — fonctionne sur n'importe quelle page sans dépendre de Tauri.
const NAV_JS: &str = r#"(function(){
  if (window.__raketaNav) return; window.__raketaNav = true;

  // --- 1) Navigateur à fenêtre unique : window.open navigue dans la fenêtre
  //        courante. Un lien de téléchargement (Content-Disposition) déclenche
  //        alors le hook on_download et RAKETA capte le fichier, au lieu d'une
  //        popup bloquée par WebView2. Comportement général de navigateur.
  try {
    var _open = window.open;
    window.open = function(u, n, f){
      try {
        if (u) { location.href = new URL(u, location.href).href; return window; }
      } catch (e) { try { return _open.call(window, u, n, f); } catch (e2) {} }
      return window;
    };
  } catch (e) {}

  // --- 2) Réactive le clic droit / la sélection que certaines pages désactivent
  //        (copie de lien, menu contextuel). On neutralise leurs gestionnaires
  //        en phase de capture sans casser les menus légitimes des pages.
  try {
    ['contextmenu','selectstart','copy','dragstart'].forEach(function(evt){
      window.addEventListener(evt, function(e){ e.stopImmediatePropagation(); }, true);
    });
  } catch (e) {}

  // --- 3) Barre de navigation (retour / avance / recharger / adresse).
  function build(){
    if (document.getElementById('__raketa_bar')) return;
    var bar = document.createElement('div');
    bar.id = '__raketa_bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:42px;z-index:2147483647;background:#14161a;border-bottom:1px solid #272b33;display:flex;align-items:center;gap:6px;padding:0 8px;font-family:Segoe UI,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);';
    function btn(t,fn){var b=document.createElement('button');b.textContent=t;b.style.cssText='background:#1c1f25;color:#e8eaed;border:1px solid #272b33;border-radius:6px;height:28px;min-width:32px;cursor:pointer;font-size:15px;';b.onclick=fn;return b;}
    var back=btn('◀',function(){history.back();});
    var fwd=btn('▶',function(){history.forward();});
    var rel=btn('↻',function(){location.reload();});
    var addr=document.createElement('input');
    addr.value=location.href;
    addr.spellcheck=false;
    addr.style.cssText='flex:1;height:28px;background:#0a0b0d;color:#e8eaed;border:1px solid #272b33;border-radius:6px;padding:0 10px;font-size:12px;outline:none;';
    addr.addEventListener('keydown',function(e){if(e.key==='Enter'){var u=addr.value.trim();if(u&&!/^https?:\/\//i.test(u))u='https://'+u;if(u)location.href=u;}});
    bar.appendChild(back);bar.appendChild(fwd);bar.appendChild(rel);bar.appendChild(addr);
    (document.documentElement||document.body).appendChild(bar);
    try{document.body.style.marginTop='42px';}catch(e){}
  }
  if(document.body){build();}else{document.addEventListener('DOMContentLoaded',build);}
})();"#;

/// Ouvre une fenêtre navigateur intégrée sur `url`. Les téléchargements lancés
/// depuis cette fenêtre sont **captés par RAKETA** (envoyés au moteur rapide) ;
/// les popups sont bloqués si l'option est active.
#[tauri::command]
pub async fn open_browser(
    app: AppHandle,
    _state: State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    let parsed: url::Url = url.parse().map_err(|_| "URL invalide".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("seuls http/https sont autorisés".into());
    }

    let label = format!("browser-{}", Uuid::new_v4().simple());
    let app_for_dl = app.clone();

    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("RAKETA — Navigateur")
        .inner_size(1120.0, 800.0)
        .on_navigation(|u| matches!(u.scheme(), "http" | "https" | "about"))
        .on_download(move |_webview, event| {
            if let DownloadEvent::Requested { url, .. } = &event {
                let link = url.to_string();
                let app = app_for_dl.clone();
                // RAKETA prend la main : on route vers le moteur rapide.
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<AppState>();
                    if let Ok((task, name)) =
                        prepare_task(state.inner(), link, String::new(), None, None).await
                    {
                        {
                            let store = state.store.lock().await;
                            let _ = store.insert(&task, &name);
                        }
                        state.submit(app.clone(), task).await;
                    }
                });
                return false; // annule le téléchargement natif du webview
            }
            true
        });

    // Barre de navigation + fenêtre unique (window.open → navigation) + clic
    // droit réactivé. Les téléchargements sont captés par le moteur RAKETA.
    builder = builder.initialization_script(NAV_JS);

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

/// Ouvre une URL dans le navigateur système (Chrome/Edge…), utile pour les
/// sites dont la vérification de sécurité ne fonctionne pas dans le webview.
#[tauri::command]
pub async fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Version installée de RAKETA (version + numéro de build CI).
#[tauri::command]
pub fn get_app_version() -> String {
    let build = option_env!("RAKETA_BUILD").unwrap_or("dev");
    format!("{} (build {})", env!("CARGO_PKG_VERSION"), build)
}

/// Numéro de build installé (0 si inconnu / build local).
fn current_build() -> u64 {
    option_env!("RAKETA_BUILD")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

/// Informations de mise à jour disponible.
#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub build: u64,
    pub tag: String,
    pub url: String,
    pub notes: String,
}

/// Vérifie s'il existe une version plus récente sur le dépôt public
/// `raketa-releases` (lecture seule, sans authentification). Renvoie `None` si
/// l'app est à jour ou si aucune release n'est publiée.
#[tauri::command]
pub async fn check_update() -> Result<Option<UpdateInfo>, String> {
    let current = current_build();
    let client = reqwest::Client::builder()
        .user_agent("RAKETA-Updater")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://api.github.com/repos/vagnondily/raketa-releases/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(None); // pas (encore) de release publiée
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // Le tag est de la forme « bN » : on extrait N.
    let latest: u64 = tag.trim_start_matches(|c: char| !c.is_ascii_digit()).parse().unwrap_or(0);

    if latest > current {
        let url = json
            .get("assets")
            .and_then(|a| a.as_array())
            .and_then(|arr| {
                arr.iter().find(|x| {
                    x.get("name")
                        .and_then(|n| n.as_str())
                        .map(|n| n.ends_with("-setup.exe"))
                        .unwrap_or(false)
                })
            })
            .and_then(|x| x.get("browser_download_url"))
            .and_then(|u| u.as_str())
            .or_else(|| json.get("html_url").and_then(|u| u.as_str()))
            .unwrap_or("")
            .to_string();
        let notes = json
            .get("body")
            .and_then(|b| b.as_str())
            .unwrap_or("")
            .to_string();
        Ok(Some(UpdateInfo { build: latest, tag, url, notes }))
    } else {
        Ok(None)
    }
}

/// Ouvre un fichier (ou dossier) avec l'application par défaut du système.
#[tauri::command]
pub async fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Affiche un fichier dans l'explorateur (dossier ouvert, fichier sélectionné).
#[tauri::command]
pub async fn reveal_in_folder(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(&path)
        // Repli : ouvrir le dossier parent si « reveal » échoue.
        .or_else(|_| {
            let dir = std::path::Path::new(&path)
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or(path.clone());
            app.opener().open_path(dir, None::<&str>)
        })
        .map_err(|e| e.to_string())
}

/// Supprime un téléchargement de la liste (et, si demandé, ses fichiers).
#[tauri::command]
pub async fn remove_download(
    state: State<'_, AppState>,
    id: String,
    delete_file: bool,
) -> Result<(), String> {
    // Annule d'abord s'il est en cours.
    if let Some(ctrl) = state.controls.lock().await.get(&id) {
        ctrl.cancel();
    }

    let record = {
        let store = state.store.lock().await;
        store.get(&id).map_err(|e| e.to_string())?
    };

    if delete_file {
        if let Some(r) = &record {
            let dest = std::path::Path::new(&r.destination);
            if dest.is_file() {
                let _ = std::fs::remove_file(dest);
            }
            // Supprime aussi les fichiers partiels (.rkt-part*) best-effort.
            let dir = if dest.is_dir() {
                dest.to_path_buf()
            } else {
                dest.parent().map(|p| p.to_path_buf()).unwrap_or_default()
            };
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with(&r.display_name) && name.contains(".rkt-part") {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
        }
    }

    {
        let store = state.store.lock().await;
        store.delete_download(&id).map_err(|e| e.to_string())?;
    }
    state.controls.lock().await.remove(&id);
    Ok(())
}
