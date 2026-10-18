//! Commandes Tauri invoquées depuis l'interface React.
//!
//! Chaque commande valide ses entrées (section 5.1) et délègue au moteur ou au
//! stockage. Les secrets éventuels ne transitent jamais par les logs.

use crate::manager::AppState;
use crate::settings::Settings;
use raketa_core::model::{DownloadStatus, DownloadTask, RemoteInfo};
use serde::Serialize;
// Navigateur intégré (fenêtre webview supplémentaire) : bureau uniquement.
#[cfg(desktop)]
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
pub(crate) async fn route_grab(
    app: AppHandle,
    kind: String,
    url: String,
    title: Option<String>,
    quality: Option<String>,
) {
    use tauri::Emitter;

    // Ramène la fenêtre principale au premier plan pour montrer le transfert.
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        #[cfg(desktop)]
        let _ = w.unminimize();
        let _ = w.set_focus();
    }

    match kind.as_str() {
        "media" => match crate::media::download(
            app.clone(),
            url.clone(),
            quality.filter(|q| !q.is_empty()).unwrap_or_else(|| "auto".to_string()),
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
    // Démarrage automatique : notion propre au bureau (absent sur Android).
    #[cfg(desktop)]
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

  // --- 1) (OPTIONNEL — mode compatibilité agressif, désactivé par défaut)
  //        window.open est détourné vers la fenêtre courante pour capter les
  //        téléchargements ouverts en popup. Désactivé par défaut car cela
  //        casse les connexions/paiements en popup (OAuth, etc.).
  if (window.__rkAgg) { try {
    var _open = window.open;
    window.open = function(u, n, f){
      try {
        if (u) { location.href = new URL(u, location.href).href; return window; }
      } catch (e) { try { return _open.call(window, u, n, f); } catch (e2) {} }
      return window;
    };
  } catch (e) {} }

  // --- 2) (OPTIONNEL — même mode) Réactive le clic droit et la sélection sur
  //        les sites qui les bloquent. Limité à contextmenu/selectstart pour ne
  //        pas casser les applications web qui gèrent copier/glisser.
  if (window.__rkAgg) { try {
    ['contextmenu','selectstart'].forEach(function(evt){
      window.addEventListener(evt, function(e){ e.stopImmediatePropagation(); }, true);
    });
  } catch (e) {} }

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
    var home=btn('⌂',function(){location.href='https://www.google.com/';});
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
      else location.href='https://www.google.com/search?q='+encodeURIComponent(u);
    });
    var grab=document.createElement('button');
    grab.textContent='⬇ Récupérer';
    grab.title='Détecter les vidéos et les fichiers téléchargeables de cette page';
    grab.style.cssText='background:#1f6feb;color:#fff;border:1px solid #1f6feb;border-radius:6px;height:28px;padding:0 10px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;';
    grab.onclick=function(){showGrab();};
    bar.appendChild(back);bar.appendChild(fwd);bar.appendChild(rel);bar.appendChild(home);bar.appendChild(addr);bar.appendChild(grab);
    (document.documentElement||document.body).appendChild(bar);
    // Petite languette toujours visible en haut : indique où retrouver la barre
    // (elle s'auto-masque). Un clic / survol la fait glisser.
    var nub=document.createElement('div');
    nub.id='__raketa_nub';nub.textContent='▾ RAKETA';nub.title='Barre RAKETA (adresse, recherche, téléchargement)';
    nub.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483646;background:rgba(31,111,235,.92);color:#fff;font:600 10px Segoe UI,Arial,sans-serif;letter-spacing:.5px;padding:2px 12px 3px;border-radius:0 0 8px 8px;cursor:pointer;opacity:.6;';
    nub.onmouseenter=function(){showBar();};nub.onclick=function(){showBar();};
    (document.documentElement||document.body).appendChild(nub);
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
    // Tient l'adresse à jour lors des navigations internes (applications web /
    // SPA qui changent d'URL sans recharger la page via l'API history).
    try{
      var sync=function(){ try{ if(document.activeElement!==addr) addr.value=location.href; }catch(e){} };
      var _ps=history.pushState, _rs=history.replaceState;
      history.pushState=function(){ var r=_ps.apply(this,arguments); setTimeout(sync,0); return r; };
      history.replaceState=function(){ var r=_rs.apply(this,arguments); setTimeout(sync,0); return r; };
      window.addEventListener('popstate',sync);
      window.addEventListener('hashchange',sync);
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
  function sendGrab(kind,url,title,quality){
    location.href='https://grab.raketa.invalid/?kind='+encodeURIComponent(kind)+'&url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title||document.title||'')+(quality?'&quality='+encodeURIComponent(quality):'');
  }
  function rkPageTitle(){
    var t=(document.title||'').replace(/\s*[-–|]\s*(YouTube|Vimeo|Dailymotion|SoundCloud).*$/i,'');
    t=t.replace(/^\(\d+\)\s*/,'').trim();
    return t.length>70?t.slice(0,67)+'…':t;
  }
  // Menu de qualités (style IDM) ancré sous le bouton flottant : en-tête de
  // marque, titre détecté, puis une ligne par qualité.
  function showFloatMenu(anchor){
    var old=document.getElementById('__raketa_fmenu'); if(old){old.remove();return;}
    var r=anchor.getBoundingClientRect();
    var m=document.createElement('div');
    m.id='__raketa_fmenu';
    m.style.cssText='position:fixed;z-index:2147483647;top:'+(r.bottom+8)+'px;left:'+r.left+'px;min-width:286px;max-width:340px;background:#0f1216;border:1px solid #2a2f37;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.62);overflow:hidden;font-family:Segoe UI,Arial,sans-serif;';
    var head=document.createElement('div');
    head.style.cssText='display:flex;align-items:center;gap:8px;padding:11px 13px;background:linear-gradient(90deg,#1f6feb,#1559c7);color:#fff;';
    head.innerHTML='<span style="font-size:15px">🚀</span><span style="font-weight:700;font-size:13px;letter-spacing:.2px">Télécharger avec RAKETA</span>';
    m.appendChild(head);
    var title=rkPageTitle();
    if(title){ var sub=document.createElement('div'); sub.textContent=title; sub.style.cssText='padding:8px 13px;color:#aeb6c2;font-size:12px;border-bottom:1px solid #20242b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'; m.appendChild(sub); }
    var list=document.createElement('div'); list.style.cssText='padding:6px;display:flex;flex-direction:column;gap:1px;';
    function row(icon,label,hint,quality){
      var b=document.createElement('button');
      b.style.cssText='display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:transparent;color:#e8eaed;border:0;border-radius:8px;padding:9px 10px;cursor:pointer;font-size:13px;font-weight:600;font-family:Segoe UI,Arial,sans-serif;';
      b.onmouseenter=function(){b.style.background='#1b2430';};
      b.onmouseleave=function(){b.style.background='transparent';};
      b.innerHTML='<span style="font-size:15px;width:18px;text-align:center">'+icon+'</span><span style="flex:1">'+label+'</span>'+(hint?'<span style="color:#7d8694;font-weight:600;font-size:11px">'+hint+'</span>':'');
      b.onclick=function(){toast('Envoyé à RAKETA');m.remove();sendGrab('media',location.href,document.title,quality);};
      return b;
    }
    list.appendChild(row('🎬','Meilleure qualité','auto','auto'));
    list.appendChild(row('🎬','4K Ultra HD','2160p','2160'));
    list.appendChild(row('🎬','2K','1440p','1440'));
    list.appendChild(row('🎬','Full HD','1080p','1080'));
    list.appendChild(row('🎬','HD','720p','720'));
    list.appendChild(row('🎬','Standard','480p','480'));
    list.appendChild(row('🎵','Audio seul','MP3','audio'));
    m.appendChild(list);
    (document.documentElement||document.body).appendChild(m);
    var mr=m.getBoundingClientRect(); if(mr.right>innerWidth-8){ m.style.left=Math.max(8,innerWidth-mr.width-8)+'px'; }
    setTimeout(function(){document.addEventListener('mousedown',function h(e){if(!m.contains(e.target)&&e.target!==anchor){try{m.remove();}catch(_){}document.removeEventListener('mousedown',h);}});},0);
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
      btn.style.cssText='position:fixed;z-index:2147483647;display:flex;align-items:center;gap:9px;background:linear-gradient(90deg,#1f6feb,#1559c7);color:#fff;font-family:Segoe UI,Arial,sans-serif;font-size:13px;font-weight:700;padding:9px 13px;border-radius:11px;box-shadow:0 8px 22px rgba(15,90,220,.5);cursor:pointer;border:1px solid rgba(255,255,255,.14);transition:transform .12s ease,box-shadow .12s ease;';
      btn.onmouseenter=function(){btn.style.transform='translateX(-50%) translateY(-1px)';btn.style.boxShadow='0 12px 28px rgba(15,90,220,.6)';};
      btn.onmouseleave=function(){btn.style.transform='translateX(-50%)';btn.style.boxShadow='0 8px 22px rgba(15,90,220,.5)';};
      var dl=document.createElement('span');dl.innerHTML='🚀&nbsp; Télécharger cette vidéo <span style="opacity:.8">▾</span>';
      var x=document.createElement('span');x.textContent='✕';x.title='Masquer';x.style.cssText='opacity:.8;font-weight:700;padding:0 2px;margin-left:2px;';
      dl.onclick=function(e){e.stopPropagation();showFloatMenu(btn);};
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
/// depuis cette fenêtre sont **captés par RAKETA** (envoyés au moteur rapide).
/// Le mode « compatibilité agressif » (détour des popups + réactivation du clic
/// droit) n'est activé que si l'option `block_popups` est cochée.
#[tauri::command]
pub async fn open_browser(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    // Le navigateur intégré ouvre une fenêtre webview supplémentaire : non
    // disponible sur Android (une seule vue). On y proposera un onglet système
    // (Custom Tabs) en phase ultérieure.
    #[cfg(not(desktop))]
    {
        let _ = (&app, &state, &url);
        return Err("Le navigateur intégré n'est pas disponible sur Android.".into());
    }

    #[cfg(desktop)]
    {
    let parsed: url::Url = url.parse().map_err(|_| "URL invalide".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("seuls http/https sont autorisés".into());
    }
    // Mode agressif (popups/clic droit) : seulement si l'utilisateur l'a activé.
    let aggressive = state.settings.lock().await.block_popups;

    // Fenêtre UNIQUE : si le navigateur est déjà ouvert, on y navigue (session
    // et cookies conservés) au lieu d'empiler des fenêtres — plus pro et plus
    // clair pour l'utilisateur.
    if let Some(existing) = app.get_webview_window("raketa-browser") {
        existing.navigate(parsed).map_err(|e| e.to_string())?;
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }

    let app_for_dl = app.clone();
    let app_for_nav = app.clone();

    let mut builder = WebviewWindowBuilder::new(&app, "raketa-browser", WebviewUrl::External(parsed))
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
                let mut quality: Option<String> = None;
                for (k, v) in u.query_pairs() {
                    match k.as_ref() {
                        "kind" => kind = v.into_owned(),
                        "url" => target = v.into_owned(),
                        "urls" => urls_json = Some(v.into_owned()),
                        "quality" => {
                            let q = v.into_owned();
                            if !q.is_empty() {
                                quality = Some(q);
                            }
                        }
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
                            let q2 = quality.clone();
                            tauri::async_runtime::spawn(async move {
                                route_grab(app2, kind2, one, None, q2).await;
                            });
                        }
                    }
                    return false;
                }
                if !target.is_empty() {
                    let app2 = app_for_nav.clone();
                    tauri::async_runtime::spawn(async move {
                        route_grab(app2, kind, target, title, quality).await;
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
                // RAKETA prend la main : on route comme une « récupération » pour
                // un retour clair — la fenêtre principale revient au premier plan
                // et le transfert s'affiche aussitôt (l'utilisateur voit que le
                // téléchargement a bien été capté, au lieu d'un lancement muet).
                tauri::async_runtime::spawn(async move {
                    route_grab(app, "auto".into(), link, None, None).await;
                });
                return false; // annule le téléchargement natif du webview
            }
            true
        });

    // Barre de navigation + grabber. Le drapeau __rkAgg active (ou non) le mode
    // compatibilité agressif (popups/clic droit) selon le réglage utilisateur.
    let script = format!("window.__rkAgg={};\n{}", aggressive, NAV_JS);
    builder = builder.initialization_script(script);

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
    } // fin #[cfg(desktop)]
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
    /// Empreinte SHA-256 attendue de l'installeur (hex minuscule), si publiée :
    /// digest de l'asset GitHub, sinon ligne « SHA256-SETUP: … » du corps de la
    /// release. Permet de vérifier l'intégrité avant de lancer l'installeur.
    pub sha256: Option<String>,
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

    // On liste TOUTES les releases publiées (plus robuste que /releases/latest,
    // qui exclut les préversions et dépend du marqueur « latest ») puis on retient
    // le build le plus élevé. Les brouillons n'apparaissent pas sans auth ; on les
    // écarte aussi par sécurité.
    let resp = client
        .get("https://api.github.com/repos/vagnondily/raketa-releases/releases?per_page=30")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    if !status.is_success() {
        // On ne peut PAS affirmer « à jour » : on remonte une erreur pour que
        // l'interface propose le téléchargement manuel plutôt qu'un faux « à jour ».
        return Err(format!(
            "vérification impossible (HTTP {}) — réessayez plus tard ou téléchargez manuellement.",
            status.as_u16()
        ));
    }

    let releases: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;

    // Build d'une release = N extrait du tag « bN ».
    let build_of = |r: &serde_json::Value| -> u64 {
        r.get("tag_name")
            .and_then(|v| v.as_str())
            .map(|t| t.trim_start_matches(|c: char| !c.is_ascii_digit()).parse().unwrap_or(0))
            .unwrap_or(0)
    };

    let best = releases
        .iter()
        .filter(|r| !r.get("draft").and_then(|d| d.as_bool()).unwrap_or(false))
        .max_by_key(|r| build_of(r));
    let Some(best) = best else {
        return Ok(None); // aucune release publiée
    };

    let latest = build_of(best);
    if latest <= current {
        return Ok(None);
    }

    let tag = best.get("tag_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let setup = best
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|arr| {
            arr.iter().find(|x| {
                x.get("name")
                    .and_then(|n| n.as_str())
                    .map(|n| n.ends_with("-setup.exe"))
                    .unwrap_or(false)
            })
        });
    let url = setup
        .and_then(|x| x.get("browser_download_url"))
        .and_then(|u| u.as_str())
        .or_else(|| best.get("html_url").and_then(|u| u.as_str()))
        .unwrap_or("")
        .to_string();
    let notes = best.get("body").and_then(|b| b.as_str()).unwrap_or("").to_string();
    // Empreinte attendue : « digest » de l'asset GitHub (« sha256:HEX ») en
    // priorité, sinon une ligne « SHA256-SETUP: HEX » du corps de la release.
    let sha256 = setup
        .and_then(|x| x.get("digest"))
        .and_then(|d| d.as_str())
        .and_then(|d| d.strip_prefix("sha256:"))
        .map(|h| h.to_lowercase())
        .filter(|h| h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()))
        .or_else(|| parse_body_sha256(&notes));

    Ok(Some(UpdateInfo { build: latest, tag, url, notes, sha256 }))
}

/// Extrait l'empreinte « SHA256-SETUP: <hex> » du corps d'une release (publiée
/// par la CI), si elle est présente et bien formée (64 caractères hexadécimaux).
fn parse_body_sha256(body: &str) -> Option<String> {
    for line in body.lines() {
        if let Some(rest) = line.trim().strip_prefix("SHA256-SETUP:") {
            let h = rest.trim().to_lowercase();
            if h.len() == 64 && h.chars().all(|c| c.is_ascii_hexdigit()) {
                return Some(h);
            }
        }
    }
    None
}

/// Canal de progression du téléchargement de la mise à jour.
pub const EVENT_UPDATE: &str = "raketa://update-progress";

/// Progression du téléchargement de l'installeur de mise à jour.
#[derive(Debug, Clone, Serialize)]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    pub done: bool,
}

/// Télécharge l'installeur de la nouvelle version DANS RAKETA (dossier
/// temporaire), en publiant la progression sur `raketa://update-progress`.
/// Renvoie le chemin local du `.exe`. Évite de passer par le navigateur.
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    use futures_util::StreamExt;
    use std::io::Write;
    use tauri::Emitter;

    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL de mise à jour invalide".into());
    }
    let resp = reqwest::Client::new()
        .get(url.as_str())
        .header("User-Agent", "RAKETA-Updater")
        .send()
        .await
        .map_err(|e| format!("téléchargement de la mise à jour : {e}"))?
        .error_for_status()
        .map_err(|e| format!("téléchargement de la mise à jour : {e}"))?;

    let total = resp.content_length();
    // Nom de fichier tiré de l'URL (sinon nom générique).
    let fname = url
        .rsplit('/')
        .next()
        .filter(|s| s.to_lowercase().ends_with(".exe"))
        .unwrap_or("RAKETA-setup.exe");
    let dest = std::env::temp_dir().join(fname);

    let mut file =
        std::fs::File::create(&dest).map_err(|e| format!("création du fichier : {e}"))?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("lecture : {e}"))?;
        file.write_all(&bytes).map_err(|e| format!("écriture : {e}"))?;
        downloaded += bytes.len() as u64;
        if last.elapsed() >= std::time::Duration::from_millis(200) {
            let _ = app.emit(EVENT_UPDATE, UpdateProgress { downloaded, total, done: false });
            last = std::time::Instant::now();
        }
    }
    file.flush().map_err(|e| format!("finalisation : {e}"))?;
    drop(file); // referme le fichier avant de le relire (verrou Windows)

    // Vérification d'intégrité : si l'empreinte attendue est connue (publiée par
    // la CI / fournie par GitHub), on refuse de lancer un installeur altéré.
    // Best-effort : sans empreinte (anciennes releases), on n'empêche pas la MAJ.
    if let Some(expected) = expected_sha256 {
        let expected = expected.trim().to_lowercase();
        if expected.len() == 64 {
            match raketa_core::hash::sha256_file(&dest).await {
                Ok(actual) if actual == expected => {}
                Ok(actual) => {
                    let _ = std::fs::remove_file(&dest);
                    return Err(format!(
                        "empreinte de l'installeur invalide (attendu {}…, obtenu {}…) — mise à jour refusée par sécurité",
                        &expected[..8],
                        &actual[..8.min(actual.len())]
                    ));
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&dest);
                    return Err(format!("vérification de l'intégrité impossible : {e}"));
                }
            }
        }
    }

    let _ = app.emit(EVENT_UPDATE, UpdateProgress { downloaded, total, done: true });
    Ok(dest.display().to_string())
}

/// Lance l'installeur téléchargé, puis ferme RAKETA (pour que l'installeur
/// puisse remplacer les fichiers de l'application).
#[tauri::command]
pub async fn run_installer(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())?;
    // L'installeur est lancé (ShellExecute, détaché) : on peut quitter.
    app.exit(0);
    Ok(())
}

/// Télécharge l'extension navigateur, la décompresse dans un dossier stable, et
/// ouvre ce dossier dans l'explorateur. L'utilisateur n'a plus qu'à activer le
/// « Mode développeur » puis « Charger l'extension non empaquetée » en pointant
/// ce dossier — les seules étapes que Chrome/Edge imposent pour une extension
/// hors Web Store. Renvoie le chemin du dossier prêt à charger.
#[tauri::command]
pub async fn install_extension(app: AppHandle) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("RAKETA-Updater")
        .build()
        .map_err(|e| e.to_string())?;

    // 1) Trouver l'URL du zip de l'extension dans une release publiée.
    let releases: Vec<serde_json::Value> = client
        .get("https://api.github.com/repos/vagnondily/raketa-releases/releases?per_page=30")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let zip_url = releases
        .iter()
        .filter(|r| !r.get("draft").and_then(|d| d.as_bool()).unwrap_or(false))
        .flat_map(|r| {
            r.get("assets")
                .and_then(|a| a.as_array())
                .cloned()
                .unwrap_or_default()
        })
        .find(|a| a.get("name").and_then(|n| n.as_str()) == Some("raketa-extension.zip"))
        .and_then(|a| {
            a.get("browser_download_url")
                .and_then(|u| u.as_str())
                .map(|s| s.to_string())
        })
        .ok_or("extension introuvable dans les releases — réessayez après la prochaine build")?;

    // 2) Télécharger le zip.
    let bytes = client
        .get(&zip_url)
        .header("User-Agent", "RAKETA")
        .send()
        .await
        .map_err(|e| format!("téléchargement de l'extension : {e}"))?
        .error_for_status()
        .map_err(|e| format!("téléchargement de l'extension : {e}"))?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    // 3) Extraire dans <données>/extension (dossier remis à neuf à chaque fois).
    let base = directories::ProjectDirs::from("com", "SmartServiceAndroy", "RAKETA")
        .map(|d| d.data_dir().to_path_buf())
        .ok_or("dossier de données introuvable")?;
    let dir = base.join("extension");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    extract_zip_tree(&bytes, &dir)?;

    // 4) Ouvrir le dossier prêt à charger dans l'explorateur.
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_path(dir.display().to_string(), None::<&str>);

    Ok(dir.display().to_string())
}

/// Décompresse une archive zip en préservant l'arborescence (protégé contre le
/// « zip-slip » via `enclosed_name`). Utilisé pour l'extension navigateur.
fn extract_zip_tree(data: &[u8], dest: &std::path::Path) -> Result<(), String> {
    use std::io::{Cursor, Read, Write};
    let mut zip = zip::ZipArchive::new(Cursor::new(data))
        .map_err(|e| format!("archive illisible : {e}"))?;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("entrée zip illisible : {e}"))?;
        // On copie le chemin tout de suite (propriétaire) pour ne pas garder un
        // emprunt sur `entry`, qui est ensuite lu en mutable.
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue, // chemin non sûr : ignoré
        };
        let out = dest.join(&rel);
        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&out);
            continue;
        }
        if let Some(parent) = out.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| format!("lecture entrée : {e}"))?;
        std::fs::File::create(&out)
            .and_then(|mut f| f.write_all(&buf))
            .map_err(|e| format!("écriture {} : {e}", out.display()))?;
    }
    Ok(())
}

/// Ouvre le navigateur demandé DIRECTEMENT sur sa page des extensions
/// (`chrome://extensions` / `edge://extensions`). Évite à l'utilisateur de
/// taper l'adresse interne lui-même — c'est l'étape la plus déroutante de
/// l'installation d'une extension non empaquetée. Chrome/Edge interdisent
/// d'aller plus loin par programme (activer le mode dev / charger le dossier
/// se font à la main, par sécurité).
#[tauri::command]
pub async fn open_browser_extensions(browser: String) -> Result<(), String> {
    let (candidates, url, nice): (Vec<std::path::PathBuf>, &str, &str) =
        if browser == "edge" {
            (browser_paths(&["ProgramFiles(x86)", "ProgramFiles"], "Microsoft/Edge/Application/msedge.exe"), "edge://extensions/", "Microsoft Edge")
        } else {
            (browser_paths(&["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"], "Google/Chrome/Application/chrome.exe"), "chrome://extensions/", "Google Chrome")
        };
    let exe = candidates
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| format!("{nice} est introuvable sur ce PC"))?;
    std::process::Command::new(exe)
        .arg(url)
        .spawn()
        .map_err(|e| format!("lancement de {nice} : {e}"))?;
    Ok(())
}

/// Chemins candidats d'un navigateur, dérivés de variables d'environnement
/// Windows (`%ProgramFiles%`, etc.). Sur un autre OS, la liste reste vide.
fn browser_paths(env_keys: &[&str], rel: &str) -> Vec<std::path::PathBuf> {
    let mut v = Vec::new();
    for key in env_keys {
        if let Ok(base) = std::env::var(key) {
            v.push(std::path::Path::new(&base).join(rel));
        }
    }
    v
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
            // Les fichiers partiels sont désormais nommés d'après l'identifiant de
            // la tâche (« {id}.rkt-part », « {id}.rkt-part.{n} », « .plan »,
            // « .assembled »), pas d'après le nom d'affichage : on filtre donc sur
            // l'id pour tous les retrouver (mono-flux comme multi-segments).
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with(&r.id) && name.contains(".rkt-part") {
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
    // Gestion de fenêtre : propre au bureau (Android n'a qu'une vue plein écran).
    #[cfg(desktop)]
    if let Some(w) = app.get_webview_window("main") {
        w.set_always_on_top(on).map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    let _ = (&app, on);
    Ok(())
}

/// Mode réduit : fenêtre étroite ancrée à droite de l'écran et épinglée, idéale
/// pour la garder à côté du navigateur et coller des liens.
#[tauri::command]
pub async fn dock_right(app: AppHandle) -> Result<(), String> {
    #[cfg(not(desktop))]
    let _ = &app;
    #[cfg(desktop)]
    {
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
    } // fin #[cfg(desktop)]
    Ok(())
}

/// Restaure la fenêtre à sa taille normale, centrée et non épinglée.
#[tauri::command]
pub async fn restore_window(app: AppHandle) -> Result<(), String> {
    #[cfg(not(desktop))]
    let _ = &app;
    #[cfg(desktop)]
    {
        use tauri::LogicalSize;
        if let Some(w) = app.get_webview_window("main") {
            w.set_always_on_top(false).map_err(|e| e.to_string())?;
            w.set_size(LogicalSize::new(1240.0, 800.0))
                .map_err(|e| e.to_string())?;
            let _ = w.center();
        }
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
