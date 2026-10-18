//! Téléchargeur de contenu vidéo/audio (YouTube et ~1000 autres sites),
//! basé sur `yt-dlp`.
//!
//! RAKETA reste un téléchargeur généraliste : cette fonction sert à récupérer
//! des contenus auxquels l'utilisateur a droit (ses propres vidéos, contenus
//! libres, etc.). `yt-dlp` est provisionné automatiquement au premier usage
//! (téléchargé depuis sa release officielle), ce qui garde l'installeur léger.
//!
//! Le binaire tourne en processus externe ; on lit sa sortie ligne par ligne
//! pour publier une progression typée vers l'interface (canal
//! `raketa://media-progress`), sur le même principe que les torrents.

use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Notify};
use uuid::Uuid;

/// Canal d'événement de progression des téléchargements média (yt-dlp).
pub const EVENT_MEDIA: &str = "raketa://media-progress";

/// URL de la release officielle de yt-dlp (binaire Windows autonome).
const YT_DLP_URL: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

/// Runtime JavaScript recommandé par yt-dlp pour résoudre les défis YouTube.
/// Le binaire Windows x64 est installé à côté de yt-dlp pour ne pas dépendre du PATH.
const DENO_URL: &str = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";

/// Build statique de ffmpeg (Windows 64 bits, GPL) — fusion HD + MP3.
const FFMPEG_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";

/// Canal d'événement de progression de l'installation de ffmpeg.
pub const EVENT_FFMPEG: &str = "raketa://ffmpeg-progress";

/// Crée une commande externe SANS fenêtre console (indispensable sous Windows :
/// sinon chaque appel à yt-dlp/ffmpeg fait clignoter une fenêtre `cmd`).
fn command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW : le processus tourne en arrière-plan, invisible.
        c.creation_flags(0x0800_0000);
    }
    c
}

/// Registre des annulations : identifiant de média → signal d'annulation.
fn cancels() -> &'static Mutex<HashMap<String, Arc<Notify>>> {
    static CANCELS: OnceLock<Mutex<HashMap<String, Arc<Notify>>>> = OnceLock::new();
    CANCELS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Limite le nombre de téléchargements média (yt-dlp) simultanés : au-delà, les
/// suivants attendent un créneau au lieu de lancer autant de processus que de
/// vidéos demandées — ce qui saturerait le processeur, le réseau et le disque
/// (chaque yt-dlp ouvre déjà plusieurs fragments en parallèle).
fn media_sem() -> &'static tokio::sync::Semaphore {
    static SEM: OnceLock<tokio::sync::Semaphore> = OnceLock::new();
    SEM.get_or_init(|| tokio::sync::Semaphore::new(3))
}

/// Sérialise l'installation/mise à jour des exécutables : plusieurs clics rapides
/// ne doivent pas écrire simultanément dans les mêmes fichiers temporaires.
fn tool_install_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// Dossier des binaires embarqués (yt-dlp, etc.), côté données utilisateur.
fn bin_dir() -> PathBuf {
    ProjectDirs::from("com", "SmartServiceAndroy", "RAKETA")
        .map(|d| d.data_dir().join("bin"))
        .unwrap_or_else(|| PathBuf::from("bin"))
}

/// Chemin du binaire yt-dlp (spécifique à la plateforme).
fn yt_dlp_path() -> PathBuf {
    let name = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    bin_dir().join(name)
}

/// Télécharge (ou re-télécharge) la dernière version de yt-dlp vers `path`.
async fn download_yt_dlp(path: &std::path::Path) -> Result<(), String> {
    let bytes = reqwest::Client::new()
        .get(YT_DLP_URL)
        .header("User-Agent", "RAKETA")
        .send()
        .await
        .map_err(|e| format!("téléchargement de yt-dlp : {e}"))?
        .error_for_status()
        .map_err(|e| format!("téléchargement de yt-dlp : {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("lecture de yt-dlp : {e}"))?;

    // Évite d'enregistrer une page HTML de proxy/erreur comme si c'était le binaire.
    if bytes.len() < 1_000_000 || (cfg!(windows) && !bytes.starts_with(b"MZ")) {
        return Err("Le fichier yt-dlp reçu est invalide ou incomplet. Vérifiez que GitHub est accessible puis réessayez.".into());
    }
    let temp = path.with_extension(if cfg!(windows) { "exe.download" } else { "download" });
    std::fs::write(&temp, &bytes).map_err(|e| format!("écriture temporaire de yt-dlp : {e}"))?;
    if path.exists() {
        let backup = path.with_extension(if cfg!(windows) { "exe.backup" } else { "backup" });
        let _ = std::fs::remove_file(&backup);
        std::fs::rename(path, &backup).map_err(|e| format!("préparation de la mise à jour yt-dlp : {e}"))?;
        if let Err(e) = std::fs::rename(&temp, path) {
            let _ = std::fs::rename(&backup, path);
            let _ = std::fs::remove_file(&temp);
            return Err(format!("installation de la mise à jour yt-dlp : {e}"));
        }
        let _ = std::fs::remove_file(backup);
    } else {
        std::fs::rename(&temp, path).map_err(|e| format!("installation de yt-dlp : {e}"))?;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755));
    }
    Ok(())
}

/// S'assure que yt-dlp est présent ; le télécharge au premier usage, et le
/// rafraîchit s'il date de plus de 10 jours (YouTube & co. changent souvent :
/// un yt-dlp périmé est une cause fréquente d'échec de téléchargement).
async fn ensure_yt_dlp() -> Result<PathBuf, String> {
    let _guard = tool_install_lock().lock().await;
    let path = yt_dlp_path();
    if path.is_file() {
        let stale = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .map(|t| t.elapsed().map(|d| d.as_secs() > 10 * 24 * 3600).unwrap_or(false))
            .unwrap_or(false);
        if stale {
            // Best-effort : en cas d'échec réseau, on garde le binaire existant.
            let _ = download_yt_dlp(&path).await;
        }
        return Ok(path);
    }
    let dir = bin_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("création du dossier bin : {e}"))?;
    download_yt_dlp(&path).await?;
    Ok(path)
}

/// Prépare Deno pour YouTube. yt-dlp fournit les scripts EJS dans son binaire,
/// mais il lui faut aussi un runtime JS externe. Sans lui, les vidéos peuvent
/// échouer même si yt-dlp est récent. Sur Windows x64, on installe Deno officiel
/// dans le dossier privé de RAKETA ; aucune dépendance au PATH système.
async fn ensure_youtube_runtime(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "URL média invalide".to_string())?;
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    let is_youtube = host == "youtu.be"
        || host == "youtube.com"
        || host.ends_with(".youtube.com")
        || host == "youtube-nocookie.com"
        || host.ends_with(".youtube-nocookie.com");
    if !is_youtube {
        return Ok(());
    }
    let _guard = tool_install_lock().lock().await;

    #[cfg(all(windows, target_arch = "x86_64"))]
    {
        let dir = bin_dir();
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Impossible de préparer les outils YouTube : {e}"))?;
        let deno_path = dir.join("deno.exe");
        let valid_existing = std::fs::metadata(&deno_path)
            .map(|m| m.len() > 1_000_000)
            .unwrap_or(false)
            && std::fs::File::open(&deno_path)
                .and_then(|mut f| {
                    let mut signature = [0_u8; 2];
                    f.read_exact(&mut signature)?;
                    Ok(signature == *b"MZ")
                })
                .unwrap_or(false);
        if !valid_existing {
            let response = reqwest::Client::builder()
                .user_agent("RAKETA")
                .build()
                .map_err(|e| format!("Initialisation réseau de Deno : {e}"))?
                .get(DENO_URL)
                .send()
                .await
                .map_err(|e| format!("Téléchargement du moteur JavaScript Deno : {e}"))?
                .error_for_status()
                .map_err(|e| format!("Téléchargement du moteur JavaScript Deno : {e}"))?;
            let bytes = response.bytes().await
                .map_err(|e| format!("Lecture de l'archive Deno : {e}"))?;
            if bytes.len() < 1_000_000 {
                return Err("L'archive Deno reçue est invalide ou incomplète. Vérifiez la connexion puis réessayez.".into());
            }
            let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
                .map_err(|e| format!("Archive Deno invalide : {e}"))?;
            let mut entry = archive.by_name("deno.exe")
                .map_err(|_| "Le fichier deno.exe est absent de l'archive officielle Deno.".to_string())?;
            let mut executable = Vec::new();
            entry.read_to_end(&mut executable)
                .map_err(|e| format!("Extraction de Deno : {e}"))?;
            if executable.len() < 1_000_000 || !executable.starts_with(b"MZ") {
                return Err("Le moteur JavaScript Deno téléchargé n'est pas un exécutable Windows valide.".into());
            }
            let temp_path = dir.join("deno.exe.download");
            std::fs::write(&temp_path, &executable)
                .map_err(|e| format!("Installation de Deno : {e}"))?;
            if deno_path.exists() {
                std::fs::remove_file(&deno_path)
                    .map_err(|e| format!("Remplacement de Deno : {e}"))?;
            }
            std::fs::rename(&temp_path, &deno_path)
                .map_err(|e| format!("Finalisation de l'installation de Deno : {e}"))?;
        }
    }

    #[cfg(not(all(windows, target_arch = "x86_64")))]
    {
        // Sur les autres plateformes, yt-dlp utilisera un runtime pris en charge
        // déjà présent dans le PATH. On ne télécharge pas un binaire inadapté.
    }
    Ok(())
}

/// Chemin de ffmpeg embarqué (téléchargé via « Installer ffmpeg »), s'il existe.
fn ffmpeg_bin() -> PathBuf {
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    bin_dir().join(name)
}

/// Emplacement à passer à yt-dlp (`--ffmpeg-location`) si ffmpeg est embarqué.
fn ffmpeg_location() -> Option<PathBuf> {
    if ffmpeg_bin().is_file() {
        Some(bin_dir())
    } else {
        None
    }
}

/// Indique si ffmpeg est accessible (embarqué ou dans le PATH système).
/// Nécessaire pour fusionner vidéo+audio HD ou convertir en MP3.
async fn ffmpeg_available() -> bool {
    if ffmpeg_location().is_some() {
        return true;
    }
    command("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// État des outils externes, pour l'interface.
#[derive(Debug, Clone, Serialize)]
pub struct ToolsStatus {
    pub yt_dlp: bool,
    pub ffmpeg: bool,
}

/// Renvoie la présence de yt-dlp (embarqué) et de ffmpeg (embarqué ou PATH).
pub async fn tools_status() -> ToolsStatus {
    ToolsStatus {
        yt_dlp: yt_dlp_path().is_file(),
        ffmpeg: ffmpeg_available().await,
    }
}

/// Progression de l'installation de ffmpeg (publiée vers l'interface).
#[derive(Debug, Clone, Serialize)]
pub struct FfmpegProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
    /// `download` | `extract` | `done` | `error`.
    pub phase: String,
    pub message: Option<String>,
}

fn ffmpeg_emit(app: &AppHandle, downloaded: u64, total: Option<u64>, phase: &str) {
    let _ = app.emit(
        EVENT_FFMPEG,
        FfmpegProgress {
            downloaded,
            total,
            phase: phase.to_string(),
            message: None,
        },
    );
}

/// Télécharge et installe ffmpeg (build statique) dans le dossier bin, en
/// publiant une progression claire (téléchargement %, extraction, terminé).
pub async fn install_ffmpeg(app: AppHandle) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::time::{Duration, Instant};

    if ffmpeg_location().is_some() {
        ffmpeg_emit(&app, 0, None, "done");
        return Ok(());
    }
    let dir = bin_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("création du dossier bin : {e}"))?;

    let resp = reqwest::Client::new()
        .get(FFMPEG_URL)
        .header("User-Agent", "RAKETA")
        .send()
        .await
        .map_err(|e| format!("téléchargement de ffmpeg : {e}"))?
        .error_for_status()
        .map_err(|e| format!("téléchargement de ffmpeg : {e}"))?;

    let total = resp.content_length();
    ffmpeg_emit(&app, 0, total, "download");

    // Téléchargement en flux pour une vraie barre de progression.
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::with_capacity(total.unwrap_or(0) as usize);
    let mut downloaded: u64 = 0;
    let mut last = Instant::now();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| format!("téléchargement de ffmpeg : {e}"))?;
        downloaded += bytes.len() as u64;
        buf.extend_from_slice(&bytes);
        if last.elapsed() >= Duration::from_millis(200) {
            ffmpeg_emit(&app, downloaded, total, "download");
            last = Instant::now();
        }
    }

    // Extraction (zip synchrone, en tâche bloquante).
    ffmpeg_emit(&app, downloaded, total, "extract");
    let dir2 = dir.clone();
    tokio::task::spawn_blocking(move || extract_ffmpeg(&buf, &dir2))
        .await
        .map_err(|e| format!("extraction interrompue : {e}"))??;

    if ffmpeg_bin().is_file() {
        ffmpeg_emit(&app, downloaded, total, "done");
        Ok(())
    } else {
        ffmpeg_emit(&app, downloaded, total, "error");
        Err("ffmpeg.exe introuvable après extraction".into())
    }
}

/// Extrait les exécutables ffmpeg/ffprobe de l'archive zip vers `dir`.
fn extract_ffmpeg(data: &[u8], dir: &std::path::Path) -> Result<(), String> {
    use std::io::{Cursor, Read, Write};
    let mut zip = zip::ZipArchive::new(Cursor::new(data))
        .map_err(|e| format!("archive ffmpeg illisible : {e}"))?;
    let wanted = ["ffmpeg.exe", "ffprobe.exe", "ffmpeg", "ffprobe"];
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("entrée zip illisible : {e}"))?;
        let name = entry.name().to_string();
        let base = name.rsplit('/').next().unwrap_or(&name);
        if wanted.contains(&base) {
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("lecture entrée : {e}"))?;
            let out = dir.join(base);
            let mut f = std::fs::File::create(&out)
                .map_err(|e| format!("création {base} : {e}"))?;
            f.write_all(&buf).map_err(|e| format!("écriture {base} : {e}"))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(0o755));
            }
        }
    }
    Ok(())
}

/// Un format téléchargeable proposé à l'utilisateur.
#[derive(Debug, Clone, Serialize)]
pub struct MediaFormat {
    /// Clé de qualité comprise par le backend (`auto`, `1080`, `720`, `audio`).
    pub quality: String,
    /// Libellé lisible affiché dans l'interface.
    pub label: String,
}

/// Métadonnées d'un média, renvoyées par l'analyse (`media_probe`).
#[derive(Debug, Clone, Serialize)]
pub struct MediaInfo {
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub ffmpeg: bool,
    pub formats: Vec<MediaFormat>,
}

/// Une entrée de playlist. L'URL individuelle est utilisée pour la file de tâches.
#[derive(Debug, Clone, Serialize)]
pub struct PlaylistEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistInfo {
    pub title: String,
    pub uploader: Option<String>,
    pub entries: Vec<PlaylistEntry>,
}

/// Événement de progression d'un téléchargement média.
#[derive(Debug, Clone, Serialize)]
pub struct MediaProgress {
    pub id: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub speed_bps: f64,
    /// Pourcentage calculé par yt-dlp lui-même (0–100). Fiable même quand
    /// `total` est inconnu : pour les flux fragmentés (DASH/HLS de YouTube &
    /// co.) yt-dlp ne connaît pas la taille totale en octets mais sait le
    /// nombre de fragments → c'est ce pourcentage qui fait avancer la barre.
    pub percent: Option<f64>,
    /// `downloading` | `processing` (fusion/conversion) | `completed` | `error`
    /// | `cancelled`.
    pub status: String,
    /// Titre réel du média (connu dès l'extraction), pour l'afficher au lieu
    /// d'un nom générique — utile surtout pour les « récupérations » (grab).
    pub title: Option<String>,
    /// Chemin final du fichier (à la fin) ou message d'erreur.
    pub detail: Option<String>,
}

/// Sous-ensemble du JSON de yt-dlp qui nous intéresse.
#[derive(Debug, Deserialize)]
struct YtJson {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    formats: Vec<YtFormat>,
    #[serde(default)]
    _type: Option<String>,
    #[serde(default)]
    entries: Option<Vec<YtEntry>>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    webpage_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtEntry {
    #[serde(default)] id: Option<String>,
    #[serde(default)] title: Option<String>,
    #[serde(default)] url: Option<String>,
    #[serde(default)] webpage_url: Option<String>,
    #[serde(default)] duration: Option<f64>,
    #[serde(default)] thumbnail: Option<String>,
    #[serde(default)] availability: Option<String>,
    #[serde(default)] live_status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtFormat {
    #[serde(default)]
    height: Option<u64>,
    #[serde(default)]
    vcodec: Option<String>,
}

/// Refuse les URL vides ou non HTTP(S) avant de lancer un processus externe.
fn validate_media_url(raw: &str) -> Result<(), String> {
    let parsed = url::Url::parse(raw.trim()).map_err(|_| "URL invalide : collez un lien complet commençant par https://".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err("URL invalide : seuls les liens HTTP et HTTPS sont pris en charge.".into());
    }
    Ok(())
}

/// Ajoute explicitement le runtime JavaScript privé à yt-dlp.
/// Deno installé à côté de yt-dlp n'est pas forcément détecté via le PATH.
fn append_js_runtime_args(args: &mut Vec<String>) {
    #[cfg(all(windows, target_arch = "x86_64"))]
    {
        let deno = bin_dir().join("deno.exe");
        if deno.is_file() {
            args.push("--js-runtimes".into());
            args.push(format!("deno:{}", deno.display()));
        }
    }
}

/// Analyse une URL : titre, miniature, durée et qualités proposées.
pub async fn probe(url: String) -> Result<MediaInfo, String> {
    let url = url.trim().to_string();
    validate_media_url(&url)?;
    ensure_youtube_runtime(&url).await?;
    let bin = ensure_yt_dlp().await?;
    let mut probe_args = vec![
        "-J".to_string(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--remote-components".into(),
        "ejs:github".into(),
    ];
    append_js_runtime_args(&mut probe_args);
    let out = command(&bin)
        .args(&probe_args)
        .arg(&url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("exécution de yt-dlp : {e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let useful = err.lines().filter(|l| !l.trim().is_empty()).rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        let low = useful.to_lowercase();
        if low.contains("this video is not available") || low.contains("video unavailable") || low.contains("not available") {
            return Err(format!(
                "YouTube refuse cette vidéo à yt-dlp depuis cet environnement. Cela ne prouve pas qu'elle est supprimée : vérifiez qu'elle s'ouvre dans votre navigateur, puis mettez yt-dlp à jour et réessayez. Si elle fonctionne sur un autre service, la différence peut venir du réseau, de la région ou du client YouTube utilisé. Détail technique : {}",
                if useful.is_empty() { "aucun détail fourni par yt-dlp" } else { &useful }
            ));
        }
        return Err(format!("Analyse impossible (yt-dlp, code {:?}) : {}", out.status.code(), if useful.is_empty() { "aucun détail fourni par yt-dlp" } else { &useful }));
    }

    let info: YtJson = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("réponse yt-dlp illisible : {e}"))?;

    let ffmpeg = ffmpeg_available().await;
    let max_height = info
        .formats
        .iter()
        .filter(|f| f.vcodec.as_deref().unwrap_or("none") != "none")
        .filter_map(|f| f.height)
        .max()
        .unwrap_or(0);

    // Construit la liste de qualités en fonction de ffmpeg (fusion possible ?).
    let mut formats = Vec::new();
    if ffmpeg {
        formats.push(MediaFormat {
            quality: "auto".into(),
            label: "Meilleure qualité (vidéo + audio)".into(),
        });
        for h in [2160u64, 1440, 1080, 720, 480] {
            if max_height >= h {
                formats.push(MediaFormat {
                    quality: h.to_string(),
                    label: format!("Vidéo {h}p"),
                });
            }
        }
        formats.push(MediaFormat {
            quality: "audio".into(),
            label: "Audio seul (MP3)".into(),
        });
    } else {
        // Sans ffmpeg : formats déjà fusionnés (≤ 720p) + audio sans conversion.
        formats.push(MediaFormat {
            quality: "auto".into(),
            label: "Meilleure qualité disponible (sans ffmpeg, ≤ 720p)".into(),
        });
        formats.push(MediaFormat {
            quality: "720".into(),
            label: "Vidéo 720p".into(),
        });
        formats.push(MediaFormat {
            quality: "audio".into(),
            label: "Audio seul (M4A)".into(),
        });
    }

    Ok(MediaInfo {
        title: info.title.unwrap_or_else(|| "Sans titre".into()),
        uploader: info.uploader,
        duration: info.duration,
        thumbnail: info.thumbnail,
        ffmpeg,
        formats,
    })
}

/// Analyse une playlist sans télécharger les médias. Le mode flat est volontaire :
/// les playlists Mix/RD peuvent être dynamiques et certaines entrées indisponibles.
pub async fn probe_playlist(url: String) -> Result<PlaylistInfo, String> {
    let url = url.trim().to_string();
    validate_media_url(&url)?;
    ensure_youtube_runtime(&url).await?;
    let bin = ensure_yt_dlp().await?;
    let out = command(&bin)
        .args(["-J", "--flat-playlist", "--no-warnings", "--ignore-errors", "--remote-components", "ejs:github"])
        .arg(&url)
        .stdout(Stdio::piped()).stderr(Stdio::piped()).output().await
        .map_err(|e| format!("exécution de yt-dlp : {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        let useful = err.lines().filter(|l| !l.trim().is_empty()).rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("Analyse de playlist impossible : {}", if useful.is_empty() { "URL non reconnue ou playlist inaccessible" } else { &useful }));
    }
    let info: YtJson = serde_json::from_slice(&out.stdout).map_err(|e| format!("réponse playlist illisible : {e}"))?;
    let entries = info.entries.unwrap_or_default().into_iter().filter_map(|e| {
        let id = e.id.or_else(|| e.url.clone()).unwrap_or_default();
        if id.is_empty() { return None; }
        let url = e.webpage_url.or_else(|| e.url.filter(|u| u.starts_with("http://") || u.starts_with("https://")))
            .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={id}"));
        let title_lower = e.title.as_deref().unwrap_or("").to_ascii_lowercase();
        let unavailable_title = title_lower.contains("private video") || title_lower.contains("deleted video") || title_lower.contains("video unavailable");
        let available = !unavailable_title
            && !matches!(e.availability.as_deref(), Some("private" | "premium_only" | "subscriber_only" | "needs_auth"))
            && !matches!(e.live_status.as_deref(), Some("is_upcoming"));
        Some(PlaylistEntry { id, title: e.title.unwrap_or_else(|| "Vidéo sans titre".into()), url, duration: e.duration, thumbnail: e.thumbnail, available })
    }).collect::<Vec<_>>();
    if entries.is_empty() { return Err("Aucune vidéo exploitable trouvée. La playlist peut être vide, privée ou générée dynamiquement par YouTube.".into()); }
    Ok(PlaylistInfo { title: info.title.unwrap_or_else(|| "Playlist YouTube".into()), uploader: info.uploader, entries })
}

/// Traduit une clé de qualité en arguments yt-dlp (format + post-traitement),
/// selon la disponibilité de ffmpeg.
fn format_args(quality: &str, ffmpeg: bool) -> Vec<String> {
    let s = |v: &str| v.to_string();
    if ffmpeg {
        match quality {
            "audio" => vec![
                s("-f"),
                s("ba/b"),
                s("--extract-audio"),
                s("--audio-format"),
                s("mp3"),
            ],
            "auto" => vec![s("-f"), s("bv*+ba/b")],
            h => vec![
                s("-f"),
                format!("bv*[height<={h}]+ba/b[height<={h}]"),
            ],
        }
    } else {
        match quality {
            "audio" => vec![s("-f"), s("ba[ext=m4a]/ba")],
            // Formats déjà fusionnés uniquement (pas de merge sans ffmpeg).
            _ => vec![s("-f"), s("b[ext=mp4][height<=720]/b[height<=720]/b")],
        }
    }
}

/// Lance un téléchargement média. Renvoie immédiatement un identifiant ; la
/// progression est publiée via le canal `raketa://media-progress`.
pub async fn download(
    app: AppHandle,
    url: String,
    quality: String,
    dir: String,
) -> Result<String, String> {
    let url = url.trim().to_string();
    validate_media_url(&url)?;
    ensure_youtube_runtime(&url).await?;
    let quality = match quality.as_str() {
        "auto" | "audio" | "2160" | "1440" | "1080" | "720" | "480" => quality,
        _ => "auto".to_string(),
    };
    let bin = ensure_yt_dlp().await?;
    let ffmpeg = ffmpeg_available().await;

    let dest = if dir.trim().is_empty() {
        directories::UserDirs::new()
            .and_then(|u| u.download_dir().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(dir)
    };

    std::fs::create_dir_all(&dest).map_err(|e| {
        format!("Impossible de créer le dossier de téléchargement « {} » : {e}", dest.display())
    })?;

    let id = Uuid::new_v4().simple().to_string();
    let cancel = Arc::new(Notify::new());
    cancels().lock().await.insert(id.clone(), cancel.clone());

    let mut args: Vec<String> = vec![
        "--no-playlist".into(),
        "--newline".into(),
        "--no-warnings".into(),
        "--remote-components".into(),
        "ejs:github".into(),
        "--no-simulate".into(),
        "--restrict-filenames".into(),
        // Téléchargement SEGMENTÉ : plusieurs fragments en parallèle (vidéos HD
        // DASH/HLS) → nettement plus rapide sur les gros volumes. Plus des
        // reprises robustes sur réseau instable.
        "--concurrent-fragments".into(),
        "5".into(),
        "--retries".into(),
        "10".into(),
        "--fragment-retries".into(),
        "10".into(),
        // Titre réel imprimé juste avant le téléchargement (pour l'affichage).
        "--print".into(),
        "before_dl:RKTITLE|%(title)s".into(),
        "--print".into(),
        "after_move:RKFILE|%(filepath)s".into(),
        "--progress-template".into(),
        // Préfixe repérable + champs séparés par des « | ». Le dernier champ
        // (_percent_str) est le pourcentage « prêt à afficher » de yt-dlp : il
        // fait avancer la barre même pour les flux fragmentés (total inconnu).
        "download:RKPROG|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress._percent_str)s".into(),
        "-P".into(),
        dest.display().to_string(),
        "-o".into(),
        "%(title).200B.%(ext)s".into(),
    ];
    append_js_runtime_args(&mut args);
    // Si ffmpeg est embarqué, on indique son emplacement à yt-dlp.
    if let Some(loc) = ffmpeg_location() {
        args.push("--ffmpeg-location".into());
        args.push(loc.display().to_string());
    }
    // Métadonnées + pochette intégrées au fichier (titre, artiste, album quand la
    // source les fournit — YouTube Music/VEVO le font souvent — et la miniature
    // en cover art). Résultat : les infos et la jaquette s'affichent dans iTunes
    // et les autres lecteurs, au lieu d'un fichier « nu ». Nécessite ffmpeg.
    if ffmpeg {
        args.push("--embed-metadata".into());
        args.push("--embed-thumbnail".into());
        args.push("--embed-chapters".into());
        // Convertit la miniature en un format sûr pour l'intégration (évite les
        // WebP que certains conteneurs/lecteurs rejettent comme pochette).
        args.push("--convert-thumbnails".into());
        args.push("jpg".into());
    }
    args.extend(format_args(&quality, ffmpeg));
    let url_for_hist = url.clone();
    args.push(url);

    let id_task = id.clone();
    let app_hist = app.clone();

    // Statut initial « en file » : l'élément apparaît immédiatement dans l'UI,
    // même si aucun créneau média n'est encore libre (cap de concurrence).
    emit(
        &app,
        MediaProgress {
            id: id_task.clone(),
            downloaded: 0,
            total: None,
            speed_bps: 0.0,
            percent: None,
            status: "queued".into(),
            title: None,
            detail: None,
        },
    );

    tokio::spawn(async move {
        // Attente d'un créneau (au plus N téléchargements média simultanés).
        // Reste annulable pendant l'attente : annuler une vidéo en file ne doit
        // pas attendre qu'un créneau se libère.
        let _permit = tokio::select! {
            p = media_sem().acquire() => match p {
                Ok(p) => p,
                Err(_) => { cleanup(&id_task).await; return; }
            },
            _ = cancel.notified() => {
                emit(&app, MediaProgress {
                    id: id_task.clone(), downloaded: 0, total: None, speed_bps: 0.0,
                    percent: None, status: "cancelled".into(), title: None, detail: None,
                });
                cleanup(&id_task).await;
                return;
            }
        };

        // Lancement de yt-dlp (stderr capturé à part pour remonter l'erreur
        // réelle au lieu d'un message générique).
        let mut child = match command(&bin)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                emit(&app, MediaProgress {
                    id: id_task.clone(), downloaded: 0, total: None, speed_bps: 0.0,
                    percent: None, status: "error".into(), title: None,
                    detail: Some(format!("lancement de yt-dlp : {e}")),
                });
                cleanup(&id_task).await;
                return;
            }
        };
        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                emit(&app, MediaProgress {
                    id: id_task.clone(), downloaded: 0, total: None, speed_bps: 0.0,
                    percent: None, status: "error".into(), title: None,
                    detail: Some("sortie yt-dlp indisponible".into()),
                });
                cleanup(&id_task).await;
                return;
            }
        };
        let stderr = child.stderr.take();

        // Tampon des dernières lignes de stderr (borné à 60 lignes).
        // Vec<String> : pas de risque de couper un caractère UTF-8.
        let errbuf = Arc::new(Mutex::new(Vec::<String>::new()));
        if let Some(se) = stderr {
            let errbuf2 = errbuf.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(se).lines();
                while let Ok(Some(l)) = lines.next_line().await {
                    let mut b = errbuf2.lock().await;
                    b.push(l);
                    if b.len() > 60 {
                        let drop = b.len() - 60;
                        b.drain(0..drop);
                    }
                }
            });
        }

        let mut reader = BufReader::new(stdout).lines();
        let mut filepath: Option<String> = None;
        let mut last = MediaProgress {
            id: id_task.clone(),
            downloaded: 0,
            total: None,
            speed_bps: 0.0,
            percent: None,
            status: "downloading".into(),
            title: None,
            detail: None,
        };

        loop {
            tokio::select! {
                // Annulation demandée : on tue le processus.
                _ = cancel.notified() => {
                    let _ = child.start_kill();
                    emit(&app, MediaProgress {
                        id: id_task.clone(), downloaded: last.downloaded, total: last.total,
                        speed_bps: 0.0, percent: last.percent, status: "cancelled".into(),
                        title: last.title.clone(), detail: None,
                    });
                    cleanup(&id_task).await;
                    return;
                }
                line = reader.next_line() => {
                    match line {
                        Ok(Some(l)) => {
                            if let Some(rest) = l.strip_prefix("RKPROG|") {
                                if let Some(mut p) = parse_progress(&id_task, rest) {
                                    p.title = last.title.clone(); // conserve le titre connu
                                    last = p.clone();
                                    emit(&app, p);
                                }
                            } else if let Some(t) = l.strip_prefix("RKTITLE|") {
                                let t = t.trim();
                                if !t.is_empty() && t != "NA" {
                                    last.title = Some(t.to_string());
                                    emit(&app, last.clone());
                                }
                            } else if let Some(fp) = l.strip_prefix("RKFILE|") {
                                filepath = Some(fp.trim().to_string());
                            } else if l.contains("[Merger]")
                                || l.contains("Merging formats")
                                || l.contains("[ExtractAudio]")
                                || l.contains("[VideoConvertor]")
                                || l.starts_with("[Fixup")
                            {
                                // Post-traitement (fusion vidéo+audio, conversion
                                // MP3…) : plus de progression d'octets → on signale
                                // « Finalisation » pour ne pas rester figé à 100 %.
                                if last.status == "downloading" {
                                    last.status = "processing".into();
                                    emit(&app, last.clone());
                                }
                            }
                        }
                        Ok(None) => break, // fin de flux
                        Err(_) => break,
                    }
                }
            }
        }

        // Le flux est terminé : on attend le code de sortie.
        let status = child.wait().await;
        let ok = status.map(|s| s.success()).unwrap_or(false);
        if ok {
            let name = filepath
                .as_deref()
                .and_then(|p| std::path::Path::new(p).file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "média".to_string());
            // Taille réelle lue sur le disque : yt-dlp ne rapporte pas toujours
            // la taille finale (surtout après fusion vidéo+audio) → on évite le
            // « 0 o » trompeur en interrogeant le fichier.
            let real_size = filepath
                .as_deref()
                .and_then(|p| std::fs::metadata(p).ok())
                .map(|m| m.len());
            let final_bytes = real_size.or(last.total).unwrap_or(last.downloaded);
            // Historique persistant (re-téléchargement possible plus tard).
            if let Some(fp) = filepath.clone() {
                let state = app_hist.state::<crate::manager::AppState>();
                let store = state.store.lock().await;
                let _ = store.add_history(&raketa_core::HistoryRecord {
                    id: id_task.clone(),
                    url: url_for_hist.clone(),
                    display_name: name.clone(),
                    destination: fp,
                    total_bytes: Some(final_bytes),
                    sha256: None,
                    source: "media".to_string(),
                    completed_at: crate::manager::now_secs(),
                });
            }
            emit(&app, MediaProgress {
                id: id_task.clone(),
                downloaded: final_bytes,
                total: Some(final_bytes),
                speed_bps: 0.0,
                percent: Some(100.0),
                status: "completed".into(),
                title: last.title.clone().or_else(|| Some(name.clone())),
                detail: filepath,
            });
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("RAKETA — Média téléchargé")
                .body(name)
                .show();
        } else {
            let raw = errbuf.lock().await.join("\n");
            let msg = friendly_media_error(&raw);
            crate::logx::error(
                "média",
                if raw.trim().is_empty() { msg.as_str() } else { raw.trim() },
            );
            emit(&app, MediaProgress {
                id: id_task.clone(),
                downloaded: last.downloaded,
                total: last.total,
                speed_bps: 0.0,
                percent: last.percent,
                status: "error".into(),
                title: last.title.clone(),
                detail: Some(msg),
            });
        }
        cleanup(&id_task).await;
    });

    Ok(id)
}

/// Demande l'annulation d'un téléchargement média en cours.
pub async fn cancel(id: String) -> Result<(), String> {
    if let Some(n) = cancels().lock().await.get(&id) {
        n.notify_one();
    }
    Ok(())
}

async fn cleanup(id: &str) {
    cancels().lock().await.remove(id);
}

fn emit(app: &AppHandle, p: MediaProgress) {
    let _ = app.emit(EVENT_MEDIA, &p);
}

/// Traduit la sortie d'erreur brute de yt-dlp en message clair et actionnable.
fn friendly_media_error(raw: &str) -> String {
    let low = raw.to_lowercase();
    if low.contains("unsupported url") || low.contains("no video") {
        "Cette page ne contient pas de vidéo téléchargeable. Ouvrez d'abord la vidéo elle-même (pas la page d'accueil).".into()
    } else if low.contains("sign in to confirm") || (low.contains("confirm") && low.contains("bot")) {
        "YouTube demande une vérification anti-robot. Réessayez dans un instant, ou mettez yt-dlp à jour (Préférences › Outils).".into()
    } else if low.contains("no supported javascript runtime")
        || low.contains("javascript runtime")
        || low.contains("js runtime")
        || low.contains("signature solving")
    {
        "YouTube exige un moteur JavaScript. RAKETA prépare Deno automatiquement ; vérifiez que le téléchargement de Deno depuis GitHub n'est pas bloqué, puis réessayez.".into()
    } else if low.contains("private video")
        || low.contains("video unavailable")
        || low.contains("this video is not available")
        || low.contains("not available")
        || low.contains("removed")
    {
        "YouTube refuse cette vidéo à yt-dlp depuis cet environnement. Cela ne prouve pas qu'elle est supprimée : vérifiez qu'elle s'ouvre sans restriction dans votre navigateur, mettez yt-dlp à jour, puis réessayez. Si elle fonctionne sur un autre service mais pas ici, la différence peut venir du réseau, de la région ou du client YouTube utilisé.".into()
    } else if low.contains("po token") || low.contains("proof of origin") {
        "YouTube refuse ce flux sans jeton PO Token valide. Mettez yt-dlp à jour et réessayez ; certains flux peuvent rester indisponibles sans fournisseur de jeton compatible.".into()
    } else if low.contains("deno") {
        "Le moteur JavaScript Deno est indisponible. Vérifiez la connexion à GitHub et réessayez.".into()
    } else if low.contains("http error 403") || low.contains("403 forbidden") {
        "YouTube a refusé l'accès au flux (HTTP 403). Le lien peut être protégé, ou yt-dlp peut nécessiter une mise à jour ou un jeton PO Token.".into()
    } else if low.contains("requested format is not available") {
        "Format demandé indisponible. Essayez « Meilleure qualité » ou installez ffmpeg (Préférences › Outils).".into()
    } else if low.contains("ffmpeg") {
        "Cette qualité nécessite ffmpeg. Installez-le depuis Préférences › Outils.".into()
    } else if raw.trim().is_empty() {
        "Échec du téléchargement (yt-dlp). Vérifiez le lien et votre connexion.".into()
    } else {
        // Dernière ligne significative de yt-dlp (souvent explicite), nettoyée.
        let line = raw
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("Échec du téléchargement")
            .trim()
            .trim_start_matches("ERROR:")
            .trim();
        let line: String = line.chars().take(200).collect();
        format!("yt-dlp : {line}")
    }
}

/// Analyse une ligne `status|downloaded|total|total_est|speed|percent`.
fn parse_progress(id: &str, rest: &str) -> Option<MediaProgress> {
    let f: Vec<&str> = rest.split('|').collect();
    if f.len() < 6 {
        return None;
    }
    let num = |s: &str| -> Option<u64> {
        let s = s.trim();
        if s.is_empty() || s == "NA" {
            None
        } else {
            // yt-dlp peut émettre des flottants (ex. « 1234.0 »).
            s.parse::<f64>().ok().map(|v| v as u64)
        }
    };
    let downloaded = num(f[1]).unwrap_or(0);
    let total = num(f[2]).or_else(|| num(f[3]));
    let speed = f[4].trim();
    let speed_bps = if speed.is_empty() || speed == "NA" {
        0.0
    } else {
        speed.parse::<f64>().unwrap_or(0.0)
    };
    // Pourcentage « prêt à afficher » de yt-dlp (« 45.2% ») : on retire le signe
    // « % » et d'éventuels codes couleur ANSI avant de convertir.
    let percent = {
        let p = f[5]
            .trim()
            .trim_end_matches('%')
            .trim_matches(|c: char| !(c.is_ascii_digit() || c == '.'));
        if p.is_empty() {
            None
        } else {
            p.parse::<f64>().ok().filter(|v| v.is_finite())
        }
    };
    Some(MediaProgress {
        id: id.to_string(),
        downloaded,
        total,
        speed_bps,
        percent,
        status: "downloading".into(),
        title: None,
        detail: None,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_progress;

    #[test]
    fn parse_fragmented_stream_uses_percent() {
        // total_bytes = NA (flux fragmenté) mais yt-dlp fournit le pourcentage.
        let p = parse_progress("x", "downloading|524288|NA|NA|131072.0| 42.5%").unwrap();
        assert_eq!(p.downloaded, 524_288);
        assert_eq!(p.total, None);
        assert_eq!(p.percent, Some(42.5));
        assert_eq!(p.speed_bps as u64, 131_072);
    }

    #[test]
    fn parse_known_total_still_works() {
        let p = parse_progress("x", "downloading|1000|2000|2000|500.0|50.0%").unwrap();
        assert_eq!(p.total, Some(2000));
        assert_eq!(p.percent, Some(50.0));
    }

    #[test]
    fn parse_na_percent_is_none() {
        let p = parse_progress("x", "downloading|0|NA|NA|NA|NA").unwrap();
        assert_eq!(p.percent, None);
        assert_eq!(p.speed_bps, 0.0);
    }

    #[test]
    fn parse_too_few_fields_rejected() {
        assert!(parse_progress("x", "downloading|0|NA|NA|NA").is_none());
    }
}
