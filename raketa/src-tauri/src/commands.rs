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
        auth: None,
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
    username: Option<String>,
    password: Option<String>,
) -> Result<String, String> {
    let (mut task, display_name) =
        prepare_task(&state, url, dest_dir, filename, expected_sha256).await?;
    let id = task.id.clone();

    // Identifiants (lien protégé par mot de passe) : appliqués à la tâche et
    // mémorisés pour la reprise / le re-téléchargement dans cette session.
    if let Some(u) = username.filter(|u| !u.is_empty()) {
        let creds = raketa_core::model::Credentials {
            username: u,
            password: password.unwrap_or_default(),
        };
        state
            .auth_store
            .lock()
            .await
            .insert(id.clone(), creds.clone());
        task.auth = Some(creds);
    }

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

/// Événement « média/torrent récupéré depuis une page » (navigateur intégré ou
/// extension), publié pour que l'interface affiche aussitôt le transfert.
#[derive(Debug, Clone, Serialize)]
pub struct GrabbedEvent {
    /// `media` | `torrent` | `http`.
    pub kind: String,
    /// Identifiant du média (pour lier la progression), si pertinent.
    pub id: Option<String>,
    pub title: Option<String>,
    pub url: String,
}

/// Oriente un contenu « récupéré » sur une page vers le bon moteur : les vidéos
/// vers le téléchargeur média (yt-dlp), les magnets/.torrent vers le moteur
/// torrent, le reste vers le moteur HTTP. Généraliste : fonctionne sur
/// n'importe quelle page (aucun site n'est ciblé en particulier).
pub(crate) async fn route_grab(app: AppHandle, kind: String, url: String, title: Option<String>) {
    use tauri::Emitter;

    // Ramène la fenêtre principale au premier plan pour montrer le transfert.
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }

    match kind.as_str() {
        "media" => match crate::media::download(
            app.clone(),
            url.clone(),
            "auto".to_string(),
            String::new(),
        )
        .await
        {
            Ok(id) => {
                let _ = app.emit(
                    "raketa://grabbed",
                    GrabbedEvent { kind: "media".into(), id: Some(id), title, url },
                );
            }
            Err(e) => crate::logx::error("récupération", &e),
        },
        "torrent" => {
            let state = app.state::<AppState>();
            match state.torrents.add_magnet_or_url(&url, false, None).await {
                Ok(_) => {
                    let _ = app.emit(
                        "raketa://grabbed",
                        GrabbedEvent { kind: "torrent".into(), id: None, title, url },
                    );
                }
                Err(e) => crate::logx::error("récupération", &e.to_string()),
            }
        }
        _ => {
            let state = app.state::<AppState>();
            if add_url(app.clone(), state.inner(), url.clone()).await.is_ok() {
                let _ = app.emit(
                    "raketa://grabbed",
                    GrabbedEvent { kind: "http".into(), id: None, title, url },
                );
            }
        }
    }
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

    // Restaure d'éventuels identifiants (lien protégé) mémorisés dans la session.
    let auth = state.auth_store.lock().await.get(&id).cloned();
    let task = DownloadTask {
        id: record.id.clone(),
        url: record.url,
        dest_dir: record.destination,
        filename: Some(record.display_name),
        expected_sha256: record.sha256,
        auth,
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
pub async fn set_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), String> {
    {
        let store = state.store.lock().await;
        settings.save(&store)?;
    }
    settings.apply_to_engine(&state.engine);

    // Applique à chaud la réduction en zone de notification et le démarrage auto.
    crate::manager::TRAY_ON_CLOSE.store(
        settings.minimize_to_tray,
        std::sync::atomic::Ordering::SeqCst,
    );
    {
        use tauri_plugin_autostart::ManagerExt;
        let al = app.autolaunch();
        let _ = if settings.autostart { al.enable() } else { al.disable() };
    }

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
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:42px;z-index:2147483647;background:#14161a;border-bottom:1px solid #272b33;display:flex;align-items:center;gap:6px;padding:0 8px;font-family:Segoe UI,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);transform:translateY(-100%);transition:transform .18s ease;will-change:transform;';
    function btn(t,fn){var b=document.createElement('button');b.textContent=t;b.style.cssText='background:#1c1f25;color:#e8eaed;border:1px solid #272b33;border-radius:6px;height:28px;min-width:32px;cursor:pointer;font-size:15px;';b.onclick=fn;return b;}
    var back=btn('◀',function(){history.back();});
    var fwd=btn('▶',function(){history.forward();});
    var rel=btn('↻',function(){location.reload();});
    var addr=document.createElement('input');
    addr.value=location.href;
    addr.spellcheck=false;
    addr.style.cssText='flex:1;height:28px;background:#0a0b0d;color:#e8eaed;border:1px solid #272b33;border-radius:6px;padding:0 10px;font-size:12px;outline:none;';
    // Barre d'adresse = aussi une recherche : URL complète ou domaine →
    // navigation ; sinon → recherche YouTube (pratique quand la barre du site
    // est masquée).
    addr.addEventListener('keydown',function(e){
      if(e.key!=='Enter') return;
      var u=addr.value.trim(); if(!u) return;
      if(/^https?:\/\//i.test(u)) location.href=u;
      else if(/^[^\s]+\.[^\s]{2,}($|[\/?#])/.test(u)) location.href='https://'+u;
      else location.href='https://www.youtube.com/results?search_query='+encodeURIComponent(u);
    });
    var grab=document.createElement('button');
    grab.textContent='⬇ Récupérer';
    grab.title='Détecter les vidéos et les fichiers téléchargeables de cette page';
    grab.style.cssText='background:#1f6feb;color:#fff;border:1px solid #1f6feb;border-radius:6px;height:28px;padding:0 10px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;';
    grab.onclick=function(){showGrab();};
    bar.appendChild(back);bar.appendChild(fwd);bar.appendChild(rel);bar.appendChild(addr);bar.appendChild(grab);
    (document.documentElement||document.body).appendChild(bar);
    // Barre auto-masquée : elle n'empiète plus sur le site (plus de décalage du
    // contenu, plus d'en-tête du site caché). Elle glisse vers le bas quand la
    // souris touche le haut de la fenêtre, ou quand on clique dans l'adresse.
    function showBar(){ bar.style.transform='translateY(0)'; }
    function hideBar(){ if(document.activeElement!==addr) bar.style.transform='translateY(-100%)'; }
    try{
      window.addEventListener('mousemove',function(e){ if(e.clientY<=4) showBar(); else if(e.clientY>58) hideBar(); },true);
      addr.addEventListener('focus',showBar);
      addr.addEventListener('blur',function(){ setTimeout(hideBar,150); });
    }catch(e){}
    // Aperçu au chargement, puis masquage pour laisser le site pleine hauteur.
    showBar(); setTimeout(hideBar,2200);
  }

  // --- 4) Récupérateur de médias : détecte les vidéos (lecteurs embarqués,
  //        balises <video>, flux HLS/DASH) et les torrents (magnet / .torrent)
  //        présents sur la page, puis les envoie au moteur RAKETA adéquat.
  //        Généraliste : aucun site n'est ciblé en particulier.
  function collectMedia(){
    var items=[], seen={};
    function add(kind,u,label){
      if(!u) return;
      var isMagnet=/^magnet:/i.test(u);
      if(!isMagnet){ try{u=new URL(u, location.href).href;}catch(e){return;} }
      if(seen[u]) return; seen[u]=1;
      items.push({kind:kind,url:u,label:label});
    }
    var hosts=[['youtube.com/embed/','YouTube'],['youtube-nocookie.com/embed/','YouTube'],['player.vimeo.com/','Vimeo'],['dailymotion.com/embed/','Dailymotion'],['facebook.com/plugins/video','Facebook'],['w.soundcloud.com/player','SoundCloud']];
    try{Array.prototype.forEach.call(document.querySelectorAll('iframe[src]'),function(f){var src=f.src||'';for(var i=0;i<hosts.length;i++){if(src.indexOf(hosts[i][0])>=0)add('media',src,'Vidéo intégrée · '+hosts[i][1]);}});}catch(e){}
    try{Array.prototype.forEach.call(document.querySelectorAll('video'),function(v){if(v.currentSrc)add('media',v.currentSrc,'Vidéo en lecture');Array.prototype.forEach.call(v.querySelectorAll('source[src]'),function(s){add('media',s.src,'Source vidéo');});});}catch(e){}
    var fileRe=/\.(zip|rar|7z|tar|gz|tgz|bz2|xz|iso|img|bin|exe|msi|apk|xapk|dmg|pkg|deb|rpm|pdf|docx?|xlsx?|pptx?|mp3|flac|wav|m4a|aac|ogg|opus|mp4|mkv|avi|mov|webm|wmv|flv|ts|epub|mobi|psd|ai|csv|srt)(\?|#|$)/i;
    try{Array.prototype.forEach.call(document.querySelectorAll('a[href]'),function(a){
      var raw=a.getAttribute('href')||'';var h=a.href||'';
      if(/^magnet:/i.test(raw))add('torrent',raw,'Torrent (magnet)');
      else if(/\.torrent(\?|$)/i.test(h))add('torrent',h,'Fichier .torrent');
      else if(/\.m3u8(\?|$)/i.test(h)||/\.mpd(\?|$)/i.test(h))add('media',h,'Flux vidéo');
      else if(/^https?:/i.test(h)&&fileRe.test(h)){var fn='';try{fn=decodeURIComponent((h.split('#')[0].split('?')[0].split('/').pop())||'');}catch(_){fn=(h.split('/').pop()||'');}add('file',h,fn||'Fichier');}
    });}catch(e){}
    add('media', location.href, 'Cette page (extraction automatique)');
    return items;
  }

  function toast(msg){
    var t=document.createElement('div');
    t.textContent=msg;
    t.style.cssText='position:fixed;top:50px;right:12px;z-index:2147483647;background:#1f6feb;color:#fff;padding:10px 14px;border-radius:8px;font-family:Segoe UI,Arial,sans-serif;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.5);';
    (document.documentElement||document.body).appendChild(t);
    setTimeout(function(){try{t.remove();}catch(e){}},2600);
  }

  // Envoie le choix à RAKETA via une navigation sentinelle (interceptée et
  // annulée côté Rust : la page courante n'est jamais quittée).
  function sendGrab(kind,url,title){
    location.href='https://grab.raketa.invalid/?kind='+encodeURIComponent(kind)+'&url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title||document.title||'');
  }
  // Envoi groupé (« Tout télécharger ») : une seule navigation sentinelle avec
  // un tableau d'URL (côté Rust, chacune est routée vers le bon moteur).
  function sendGrabMany(kind,urls){
    location.href='https://grab.raketa.invalid/?kind='+encodeURIComponent(kind)+'&urls='+encodeURIComponent(JSON.stringify(urls));
  }
  function kindIcon(k){ return k==='torrent'?'🧲 ':k==='file'?'📄 ':'🎬 '; }

  function showGrab(){
    var old=document.getElementById('__raketa_grab'); if(old){old.remove();return;}
    var items=collectMedia();
    var files=items.filter(function(it){return it.kind==='file';});
    var panel=document.createElement('div');
    panel.id='__raketa_grab';
    panel.style.cssText='position:fixed;top:46px;right:8px;width:380px;max-height:72vh;overflow:auto;z-index:2147483647;background:#14161a;border:1px solid #272b33;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.55);font-family:Segoe UI,Arial,sans-serif;padding:8px;';
    var head=document.createElement('div');head.textContent='Détecté sur la page';head.style.cssText='color:#9aa0a6;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;';panel.appendChild(head);
    // Bouton « Tout télécharger » quand plusieurs fichiers sont détectés.
    if(files.length>1){
      var all=document.createElement('button');
      all.textContent='⬇ Tout télécharger ('+files.length+' fichiers)';
      all.style.cssText='width:100%;background:#1f6feb;color:#fff;border:none;border-radius:8px;padding:9px 10px;margin:2px 0 6px;cursor:pointer;font-size:13px;font-weight:700;';
      all.onclick=function(){toast('Envoi de '+files.length+' fichiers à RAKETA');panel.remove();sendGrabMany('file',files.map(function(f){return f.url;}));};
      panel.appendChild(all);
    }
    items.forEach(function(it){
      var row=document.createElement('button');
      row.style.cssText='display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;background:#1c1f25;color:#e8eaed;border:1px solid #272b33;border-radius:8px;padding:8px 10px;margin:4px 0;cursor:pointer;';
      var l=document.createElement('span');l.textContent=kindIcon(it.kind)+it.label;l.style.cssText='font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:344px;';
      var u=document.createElement('span');u.textContent=it.url;u.style.cssText='font-size:11px;color:#9aa0a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:344px;';
      row.appendChild(l);row.appendChild(u);
      row.onclick=function(){toast('Envoyé à RAKETA');panel.remove();sendGrab(it.kind,it.url,document.title);};
      panel.appendChild(row);
    });
    (document.documentElement||document.body).appendChild(panel);
    setTimeout(function(){document.addEventListener('mousedown',function onDoc(e){if(!panel.contains(e.target)){try{panel.remove();}catch(_){}document.removeEventListener('mousedown',onDoc);}});},0);
  }

  // --- 5) Bouton FLOTTANT « Télécharger cette vidéo », posé directement sur le
  //        lecteur (façon IDM). Apparaît automatiquement dès qu'une vidéo est
  //        détectée (YouTube, Dailymotion, Vimeo, <video>…), suit le lecteur,
  //        et se referme d'un clic sur ✕.
  var floatDismissed=false, floatUrl=location.href;
  function biggestMedia(){
    var best=null, area=0;
    function consider(el){
      var r=el.getBoundingClientRect();
      var a=r.width*r.height;
      if(a>area && r.width>=220 && r.height>=120 && r.bottom>40 && r.top<innerHeight){ area=a; best=r; }
    }
    try{Array.prototype.forEach.call(document.querySelectorAll('video'),consider);}catch(e){}
    if(!best){try{Array.prototype.forEach.call(document.querySelectorAll('iframe[src]'),function(f){if(/youtube|youtube-nocookie|vimeo|dailymotion|player/i.test(f.src))consider(f);});}catch(e){}}
    return best;
  }
  function ensureFloat(){
    var btn=document.getElementById('__raketa_float');
    if(floatDismissed){ if(btn)btn.remove(); return; }
    var r=biggestMedia();
    if(!r){ if(btn)btn.style.display='none'; return; }
    if(!btn){
      btn=document.createElement('div');
      btn.id='__raketa_float';
      btn.style.cssText='position:fixed;z-index:2147483647;display:flex;align-items:center;gap:10px;background:rgba(31,111,235,.97);color:#fff;font-family:Segoe UI,Arial,sans-serif;font-size:13px;font-weight:600;padding:8px 12px;border-radius:9px;box-shadow:0 6px 18px rgba(0,0,0,.5);cursor:pointer;';
      var dl=document.createElement('span');dl.textContent='⬇ Télécharger cette vidéo';
      var x=document.createElement('span');x.textContent='✕';x.title='Masquer';x.style.cssText='opacity:.85;font-weight:700;padding:0 2px;';
      dl.onclick=function(){toast('Envoyé à RAKETA');sendGrab('media',location.href,document.title);};
      x.onclick=function(e){e.stopPropagation();floatDismissed=true;btn.remove();};
      btn.appendChild(dl);btn.appendChild(x);
      (document.documentElement||document.body).appendChild(btn);
    }
    btn.style.display='flex';
    btn.style.top=Math.max(8, r.top+10)+'px';
    btn.style.left=(r.left+r.width/2)+'px';
    btn.style.transform='translateX(-50%)';
  }
  function floatTick(){ if(location.href!==floatUrl){ floatUrl=location.href; floatDismissed=false; } ensureFloat(); }
  try{setInterval(floatTick,1200);}catch(e){}
  try{window.addEventListener('scroll',ensureFloat,true);window.addEventListener('resize',ensureFloat);}catch(e){}

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
    let app_for_nav = app.clone();

    let mut builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("RAKETA — Navigateur")
        .inner_size(1120.0, 800.0)
        .on_navigation(move |u| {
            // Sentinelle du récupérateur de médias : le script injecté « navigue »
            // vers grab.raketa.invalid avec les paramètres du média choisi. On
            // intercepte (sans jamais réellement naviguer) et on route vers le
            // bon moteur. C'est le canal de l'interface vers RAKETA dans le
            // navigateur intégré (les pages externes n'ont pas l'IPC Tauri).
            if u.host_str() == Some("grab.raketa.invalid") {
                let mut kind = String::from("media");
                let mut target = String::new();
                let mut urls_json: Option<String> = None;
                let mut title: Option<String> = None;
                for (k, v) in u.query_pairs() {
                    match k.as_ref() {
                        "kind" => kind = v.into_owned(),
                        "url" => target = v.into_owned(),
                        "urls" => urls_json = Some(v.into_owned()),
                        "title" => {
                            let t = v.into_owned();
                            if !t.is_empty() {
                                title = Some(t);
                            }
                        }
                        _ => {}
                    }
                }
                // Envoi groupé (« Tout télécharger ») : tableau JSON d'URL.
                if let Some(j) = urls_json {
                    if let Ok(list) = serde_json::from_str::<Vec<String>>(&j) {
                        for one in list.into_iter().take(200) {
                            if one.trim().is_empty() {
                                continue;
                            }
                            let app2 = app_for_nav.clone();
                            let kind2 = kind.clone();
                            tauri::async_runtime::spawn(async move {
                                route_grab(app2, kind2, one, None).await;
                            });
                        }
                    }
                    return false;
                }
                if !target.is_empty() {
                    let app2 = app_for_nav.clone();
                    tauri::async_runtime::spawn(async move {
                        route_grab(app2, kind, target, title).await;
                    });
                }
                return false; // annule la navigation sentinelle
            }
            matches!(u.scheme(), "http" | "https" | "about")
        })
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

    let status = resp.status();
    if !status.is_success() {
        // 404 = aucune release publiée (dépôt pas encore prêt) ; autre code =
        // service momentanément indisponible. Dans les deux cas on ne peut PAS
        // affirmer « à jour » : on remonte une erreur pour que l'interface
        // propose le téléchargement manuel plutôt qu'un faux « Vous êtes à jour ».
        return Err(format!(
            "vérification impossible (HTTP {}) — réessayez plus tard ou téléchargez manuellement.",
            status.as_u16()
        ));
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

// ---------------------------------------------------------------------------
// Téléchargeur de contenu média (YouTube & co., via yt-dlp)
// ---------------------------------------------------------------------------

/// Analyse une URL média : titre, miniature, durée et qualités proposées.
/// yt-dlp est provisionné automatiquement au premier appel.
#[tauri::command]
pub async fn media_probe(url: String) -> Result<crate::media::MediaInfo, String> {
    let url = url.trim().to_string();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL invalide (http/https attendu)".into());
    }
    crate::media::probe(url).await
}

/// Lance un téléchargement média. `quality` ∈ {auto, 2160, 1440, 1080, 720,
/// 480, audio}. `dest_dir` vide → dossier de téléchargement par défaut.
#[tauri::command]
pub async fn media_download(
    app: AppHandle,
    url: String,
    quality: String,
    dest_dir: String,
) -> Result<String, String> {
    crate::media::download(app, url, quality, dest_dir).await
}

/// Annule un téléchargement média en cours.
#[tauri::command]
pub async fn media_cancel(id: String) -> Result<(), String> {
    crate::media::cancel(id).await
}

/// Applique une limite de débit « à chaud » sans la persister (utilisé par le
/// planificateur horaire côté interface : vitesse réduite la nuit, etc.).
#[tauri::command]
pub async fn set_rate_limit_live(state: State<'_, AppState>, kbps: u64) -> Result<(), String> {
    state.engine.set_rate_limit(kbps.saturating_mul(1024));
    Ok(())
}

/// État des outils média externes (yt-dlp, ffmpeg).
#[tauri::command]
pub async fn media_tools_status() -> Result<crate::media::ToolsStatus, String> {
    Ok(crate::media::tools_status().await)
}

// ---------------------------------------------------------------------------
// Pare-feu Windows (autorisation des connexions entrantes des pairs torrent)
// ---------------------------------------------------------------------------

/// Indique si RAKETA est déjà autorisé dans le pare-feu Windows.
#[tauri::command]
pub async fn firewall_status() -> Result<crate::firewall::FirewallStatus, String> {
    tokio::task::spawn_blocking(crate::firewall::status)
        .await
        .map_err(|e| e.to_string())
}

/// Ajoute la règle de pare-feu autorisant RAKETA (invite UAC ponctuelle).
#[tauri::command]
pub async fn firewall_authorize() -> Result<(), String> {
    tokio::task::spawn_blocking(crate::firewall::authorize)
        .await
        .map_err(|e| e.to_string())?
}

/// Télécharge et installe ffmpeg (fusion HD vidéo+audio, conversion MP3).
#[tauri::command]
pub async fn install_ffmpeg(app: AppHandle) -> Result<(), String> {
    crate::media::install_ffmpeg(app).await
}

// ---------------------------------------------------------------------------
// Historique des téléchargements (persistant)
// ---------------------------------------------------------------------------

/// Entrée d'historique exposée au front.
#[derive(Debug, Serialize)]
pub struct HistoryDto {
    pub id: String,
    /// URL réelle (sert au re-téléchargement — non affichée telle quelle).
    pub url: String,
    /// URL expurgée des secrets (pour l'affichage).
    pub url_display: String,
    pub display_name: String,
    pub destination: String,
    pub total_bytes: Option<u64>,
    pub sha256: Option<String>,
    pub source: String,
    pub completed_at: i64,
    /// Le fichier existe-t-il encore sur le disque ?
    pub file_exists: bool,
}

impl From<raketa_core::HistoryRecord> for HistoryDto {
    fn from(h: raketa_core::HistoryRecord) -> Self {
        let file_exists = std::path::Path::new(&h.destination).is_file();
        let url_display = raketa_core::redact_url(&h.url);
        Self {
            id: h.id,
            url: h.url,
            url_display,
            display_name: h.display_name,
            destination: h.destination,
            total_bytes: h.total_bytes,
            sha256: h.sha256,
            source: h.source,
            completed_at: h.completed_at,
            file_exists,
        }
    }
}

/// Liste l'historique des téléchargements (plus récents d'abord).
#[tauri::command]
pub async fn list_history(state: State<'_, AppState>) -> Result<Vec<HistoryDto>, String> {
    let store = state.store.lock().await;
    let recs = store.list_history(1000).map_err(|e| e.to_string())?;
    Ok(recs.into_iter().map(HistoryDto::from).collect())
}

/// Supprime une entrée d'historique (le fichier n'est pas touché).
#[tauri::command]
pub async fn delete_history_entry(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let store = state.store.lock().await;
    store.delete_history(&id).map_err(|e| e.to_string())
}

/// Vide tout l'historique.
#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let store = state.store.lock().await;
    store.clear_history().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Ergonomie de la fenêtre (épingler, mode réduit « à côté de l'écran »)
// ---------------------------------------------------------------------------

/// Épingle/désépingle la fenêtre au-dessus des autres (toujours visible).
#[tauri::command]
pub async fn set_always_on_top(app: AppHandle, on: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(on).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Mode réduit : fenêtre étroite ancrée à droite de l'écran et épinglée, idéale
/// pour la garder à côté du navigateur et coller des liens.
#[tauri::command]
pub async fn dock_right(app: AppHandle) -> Result<(), String> {
    use tauri::{LogicalPosition, LogicalSize};
    if let Some(w) = app.get_webview_window("main") {
        let width = 460.0;
        let (mw, mh, mx, my) = match w.current_monitor().map_err(|e| e.to_string())? {
            Some(m) => {
                let sf = m.scale_factor();
                let s = m.size();
                let p = m.position();
                (
                    s.width as f64 / sf,
                    s.height as f64 / sf,
                    p.x as f64 / sf,
                    p.y as f64 / sf,
                )
            }
            None => (1280.0, 800.0, 0.0, 0.0),
        };
        let height = (mh - 80.0).max(480.0);
        w.set_always_on_top(true).map_err(|e| e.to_string())?;
        w.set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
        w.set_position(LogicalPosition::new(mx + mw - width - 12.0, my + 16.0))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Restaure la fenêtre à sa taille normale, centrée et non épinglée.
#[tauri::command]
pub async fn restore_window(app: AppHandle) -> Result<(), String> {
    use tauri::LogicalSize;
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(false).map_err(|e| e.to_string())?;
        w.set_size(LogicalSize::new(1240.0, 800.0))
            .map_err(|e| e.to_string())?;
        let _ = w.center();
    }
    Ok(())
}

/// Re-télécharge un élément existant (liste ou terminé) à partir de son id :
/// réutilise l'URL réelle stockée (non expurgée) et le dossier d'origine.
#[tauri::command]
pub async fn redownload(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    let record = {
        let store = state.store.lock().await;
        store.get(&id).map_err(|e| e.to_string())?
    };
    let Some(record) = record else {
        return Err("téléchargement introuvable".into());
    };
    // Dossier de destination = parent du fichier final (si c'est un chemin de
    // fichier), sinon la destination telle quelle (déjà un dossier).
    let p = std::path::Path::new(&record.destination);
    let dir = if p.extension().is_some() {
        p.parent()
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_default()
    } else {
        record.destination.clone()
    };
    let (mut task, display_name) =
        prepare_task(&state, record.url, dir, Some(record.display_name), None).await?;
    let new_id = task.id.clone();
    // Reporte les identifiants (lien protégé) sur la nouvelle tâche. On lit
    // d'abord (verrou relâché) avant de ré-insérer, pour éviter tout blocage.
    let creds = state.auth_store.lock().await.get(&id).cloned();
    if let Some(creds) = creds {
        state
            .auth_store
            .lock()
            .await
            .insert(new_id.clone(), creds.clone());
        task.auth = Some(creds);
    }
    {
        let store = state.store.lock().await;
        store.insert(&task, &display_name).map_err(|e| e.to_string())?;
    }
    state.submit(app, task).await;
    Ok(new_id)
}

// ---------------------------------------------------------------------------
// Journal (diagnostic / signalement de problème)
// ---------------------------------------------------------------------------

/// Renvoie les dernières entrées du journal (plus récentes en dernier).
#[tauri::command]
pub async fn read_log() -> Result<Vec<crate::logx::LogEntry>, String> {
    Ok(crate::logx::tail(400))
}

/// Ouvre le fichier de journal dans l'explorateur / éditeur par défaut.
#[tauri::command]
pub async fn open_log(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = crate::logx::log_path();
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| e.to_string())
}

/// Vide le journal.
#[tauri::command]
pub async fn clear_log() -> Result<(), String> {
    crate::logx::clear();
    Ok(())
}
