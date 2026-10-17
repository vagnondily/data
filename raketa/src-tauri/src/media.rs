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

/// S'assure que yt-dlp est présent ; le télécharge au premier usage.
async fn ensure_yt_dlp() -> Result<PathBuf, String> {
    let path = yt_dlp_path();
    if path.is_file() {
        return Ok(path);
    }
    let dir = bin_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("création du dossier bin : {e}"))?;

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

    std::fs::write(&path, &bytes).map_err(|e| format!("écriture de yt-dlp : {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
    }
    Ok(path)
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

/// Événement de progression d'un téléchargement média.
#[derive(Debug, Clone, Serialize)]
pub struct MediaProgress {
    pub id: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub speed_bps: f64,
    /// `downloading` | `completed` | `error` | `cancelled`.
    pub status: String,
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
}

#[derive(Debug, Deserialize)]
struct YtFormat {
    #[serde(default)]
    height: Option<u64>,
    #[serde(default)]
    vcodec: Option<String>,
}

/// Analyse une URL : titre, miniature, durée et qualités proposées.
pub async fn probe(url: String) -> Result<MediaInfo, String> {
    let bin = ensure_yt_dlp().await?;
    let out = command(&bin)
        .args(["-J", "--no-playlist", "--no-warnings"])
        .arg(&url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("exécution de yt-dlp : {e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!(
            "analyse impossible : {}",
            err.lines().last().unwrap_or("URL non reconnue").trim()
        ));
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
    let bin = ensure_yt_dlp().await?;
    let ffmpeg = ffmpeg_available().await;

    let dest = if dir.trim().is_empty() {
        directories::UserDirs::new()
            .and_then(|u| u.download_dir().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(dir)
    };

    let id = Uuid::new_v4().simple().to_string();
    let cancel = Arc::new(Notify::new());
    cancels().lock().await.insert(id.clone(), cancel.clone());

    let mut args: Vec<String> = vec![
        "--no-playlist".into(),
        "--newline".into(),
        "--no-warnings".into(),
        "--no-simulate".into(),
        "--restrict-filenames".into(),
        "--print".into(),
        "after_move:RKFILE|%(filepath)s".into(),
        "--progress-template".into(),
        // Préfixe repérable + champs séparés par des « | ».
        "download:RKPROG|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s".into(),
        "-P".into(),
        dest.display().to_string(),
        "-o".into(),
        "%(title).200B.%(ext)s".into(),
    ];
    // Si ffmpeg est embarqué, on indique son emplacement à yt-dlp.
    if let Some(loc) = ffmpeg_location() {
        args.push("--ffmpeg-location".into());
        args.push(loc.display().to_string());
    }
    args.extend(format_args(&quality, ffmpeg));
    let url_for_hist = url.clone();
    args.push(url);

    let mut child = command(&bin)
        .args(&args)
        // stderr ignoré : on ne le lit pas (un tube plein bloquerait yt-dlp).
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("lancement de yt-dlp : {e}"))?;

    let stdout = child.stdout.take().ok_or("sortie yt-dlp indisponible")?;
    let id_task = id.clone();
    let app_hist = app.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut filepath: Option<String> = None;
        let mut last = MediaProgress {
            id: id_task.clone(),
            downloaded: 0,
            total: None,
            speed_bps: 0.0,
            status: "downloading".into(),
            detail: None,
        };

        loop {
            tokio::select! {
                // Annulation demandée : on tue le processus.
                _ = cancel.notified() => {
                    let _ = child.start_kill();
                    emit(&app, MediaProgress {
                        id: id_task.clone(), downloaded: last.downloaded, total: last.total,
                        speed_bps: 0.0, status: "cancelled".into(), detail: None,
                    });
                    cleanup(&id_task).await;
                    return;
                }
                line = reader.next_line() => {
                    match line {
                        Ok(Some(l)) => {
                            if let Some(rest) = l.strip_prefix("RKPROG|") {
                                if let Some(p) = parse_progress(&id_task, rest) {
                                    last = p.clone();
                                    emit(&app, p);
                                }
                            } else if let Some(fp) = l.strip_prefix("RKFILE|") {
                                filepath = Some(fp.trim().to_string());
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
                status: "completed".into(),
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
            crate::logx::error(
                "média",
                "yt-dlp a échoué (lien privé, région, ou ffmpeg requis)",
            );
            emit(&app, MediaProgress {
                id: id_task.clone(),
                downloaded: last.downloaded,
                total: last.total,
                speed_bps: 0.0,
                status: "error".into(),
                detail: Some("yt-dlp a échoué (lien privé, région, ou ffmpeg requis)".into()),
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

/// Analyse une ligne de progression `status|downloaded|total|total_est|speed`.
fn parse_progress(id: &str, rest: &str) -> Option<MediaProgress> {
    let f: Vec<&str> = rest.split('|').collect();
    if f.len() < 5 {
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
    Some(MediaProgress {
        id: id.to_string(),
        downloaded,
        total,
        speed_bps,
        status: "downloading".into(),
        detail: None,
    })
}
