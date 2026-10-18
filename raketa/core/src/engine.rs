//! Moteur de téléchargement (sections 8 & 9).
//!
//! Garanties visées :
//! - mémoire bornée : le corps est diffusé bloc par bloc, jamais chargé en entier ;
//! - reprise sûre : on n'ajoute à un fichier partiel que si le serveur renvoie
//!   `206` et que le validateur (ETag/Last-Modified) correspond (`If-Range`) ;
//! - finalisation atomique : écriture dans un fichier `.rkt-part` puis `rename` ;
//! - aucun transfert n'est « terminé » avant fermeture correcte du fichier et
//!   validation de la taille / de l'empreinte configurée.

use crate::error::{EngineError, Result};
use crate::metadata;
use crate::model::{Control, DownloadTask, Outcome, Progress, RemoteInfo};
use crate::{filename, hash};
use futures_util::StreamExt;
use reqwest::header::{CONTENT_LENGTH, IF_RANGE, RANGE, RETRY_AFTER};
use reqwest::{Client, StatusCode};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

/// Rappel de progression (publié vers l'UI via événements typés, section 5.1).
pub type ProgressFn = Arc<dyn Fn(Progress) + Send + Sync>;

/// Paramètres du moteur.
#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Nombre maximal de tentatives sur erreur transitoire (429/5xx/réseau).
    pub max_retries: u32,
    /// Temporisation de base du backoff exponentiel.
    pub base_backoff: Duration,
    /// Intervalle minimal entre deux événements de progression.
    pub progress_interval: Duration,
    /// Suffixe des fichiers partiels.
    pub part_suffix: String,
    /// Nombre de connexions parallèles (segments) pour un même fichier.
    pub connections: usize,
    /// Taille minimale d'un fichier pour activer le multi-segments.
    pub segment_threshold: u64,
    /// Taille minimale d'un segment (évite de sur-découper les petits fichiers).
    pub min_segment_size: u64,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            max_retries: 5,
            base_backoff: Duration::from_millis(500),
            progress_interval: Duration::from_millis(250),
            part_suffix: ".rkt-part".to_string(),
            // 8 connexions par défaut : bon compromis vitesse / politesse serveur.
            connections: 8,
            segment_threshold: 4 * 1024 * 1024, // 4 Mio
            min_segment_size: 1024 * 1024,      // 1 Mio
        }
    }
}

/// Moteur de téléchargement réutilisable (un client HTTP mutualisé).
#[derive(Clone)]
pub struct Engine {
    client: Client,
    config: EngineConfig,
    /// Limiteur de débit global, réglable à chaud (0 = illimité).
    limiter: crate::RateLimiter,
    /// Nombre de connexions parallèles, réglable à chaud.
    connections: Arc<std::sync::atomic::AtomicUsize>,
}

impl Engine {
    pub fn new() -> Result<Self> {
        Self::with_config(EngineConfig::default())
    }

    pub fn with_config(config: EngineConfig) -> Result<Self> {
        let client = Client::builder()
            .user_agent(concat!("RAKETA/", env!("CARGO_PKG_VERSION")))
            // Limite le nombre de redirections suivies (section 12).
            .redirect(reqwest::redirect::Policy::limited(10))
            // --- Performance sur liens à FORTE LATENCE (satellite/Starlink, 4G) ---
            // Sans réglage, reqwest négocie HTTP/2 avec la plupart des CDN et
            // MULTIPLEXE toutes nos requêtes de plage sur UNE SEULE connexion TCP
            // dont la fenêtre de contrôle de flux par défaut (~64 Kio) plafonne le
            // débit à « fenêtre / latence ». Sur un lien à ~120 ms de ping, cela
            // donne ~100-500 Ko/s quel que soit le nombre de segments — c'est le
            // symptôme exact rapporté (127 Ko/s sur du Starlink). On corrige :
            //  • fenêtre HTTP/2 auto-dimensionnée par estimation du BDP (le point
            //    le plus important : laisse une connexion remplir un gros tuyau) ;
            //  • Nagle désactivé (latence) + keep-alive TCP/HTTP2 pour ne pas
            //    reconstruire les connexions des segments ;
            //  • pool de connexions gardé chaud.
            .tcp_nodelay(true)
            .tcp_keepalive(Duration::from_secs(60))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(16)
            .http2_adaptive_window(true)
            .http2_keep_alive_interval(Duration::from_secs(30))
            .http2_keep_alive_timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(30))
            .build()?;
        let connections = Arc::new(std::sync::atomic::AtomicUsize::new(config.connections));
        Ok(Self {
            client,
            config,
            limiter: crate::RateLimiter::unlimited(),
            connections,
        })
    }

    /// Règle le débit global maximal (octets/seconde ; 0 = illimité).
    pub fn set_rate_limit(&self, bytes_per_sec: u64) {
        self.limiter.set_limit(bytes_per_sec);
    }

    /// Règle le nombre de connexions parallèles par téléchargement.
    pub fn set_connections(&self, n: usize) {
        self.connections
            .store(n.max(1), std::sync::atomic::Ordering::SeqCst);
    }

    /// Nombre de connexions courant.
    fn connections(&self) -> usize {
        self.connections.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Sonde les métadonnées distantes sans télécharger le corps.
    pub async fn probe(&self, url: &str) -> Result<RemoteInfo> {
        metadata::probe(&self.client, url, None).await
    }

    /// Exécute un téléchargement avec reprise, tentatives et vérifications.
    ///
    /// Boucle de tentatives : chaque échec transitoire relance `attempt`, qui
    /// reprend naturellement là où le fichier `.part` s'est arrêté.
    pub async fn download(
        &self,
        task: &DownloadTask,
        control: Control,
        progress: ProgressFn,
    ) -> Result<Outcome> {
        metadata::validate_scheme(&task.url)?;
        let info = metadata::probe(&self.client, &task.url, task.auth.as_ref()).await?;

        let dir = PathBuf::from(&task.dest_dir);
        fs::create_dir_all(&dir).await?;

        let chosen = task
            .filename
            .clone()
            .map(|f| filename::sanitize(&f))
            .or_else(|| info.suggested_filename.clone())
            .unwrap_or_else(|| filename::from_url(&info.final_url));

        // Stratégie : multi-segments si la taille est connue, que le serveur
        // honore Range et que le fichier dépasse le seuil ; sinon flux unique.
        let connections = self.connections();
        if connections > 1 && info.accept_ranges {
            if let Some(total) = info.size {
                if total >= self.config.segment_threshold {
                    let validator = info.etag.clone().or_else(|| info.last_modified.clone());
                    return crate::segmented::run(
                        self.client.clone(),
                        self.config.clone(),
                        connections,
                        self.limiter.clone(),
                        task.clone(),
                        info.final_url.clone(),
                        validator,
                        total,
                        dir.clone(),
                        chosen.clone(),
                        control,
                        progress,
                    )
                    .await;
                }
            }
        }

        // Chemin partiel indexé par l'IDENTIFIANT de tâche (et non le nom de
        // fichier) : deux téléchargements de même nom ne se marchent plus dessus,
        // et la reprise retrouve toujours son .part même si le nom résolu diffère
        // (Content-Disposition / redirection). Le nom final est résolu à la
        // finalisation pour éviter tout écrasement.
        let part_path = dir.join(format!("{}{}", task.id, self.config.part_suffix));

        let mut attempt: u32 = 0;
        loop {
            match self
                .attempt(task, &info, &part_path, &control, &progress)
                .await
            {
                Ok(outcome) => {
                    // Finalisation : vérifications puis rename atomique.
                    if let Outcome::Completed { .. } = &outcome {
                        return self.finalize(task, &info, &part_path, &dir, &chosen, &progress).await;
                    }
                    return Ok(outcome);
                }
                Err(e) if e.is_retryable() && attempt < self.config.max_retries => {
                    attempt += 1;
                    let backoff = self.config.base_backoff * 2u32.pow(attempt.min(6));
                    tokio::time::sleep(backoff).await;
                    // Pause/annulation peuvent survenir pendant l'attente.
                    if control.is_cancelled() {
                        return Err(EngineError::Cancelled);
                    }
                }
                Err(e) => return Err(e),
            }
        }
    }

    /// Une tentative de transfert (reprise incluse).
    async fn attempt(
        &self,
        task: &DownloadTask,
        info: &RemoteInfo,
        part_path: &Path,
        control: &Control,
        progress: &ProgressFn,
    ) -> Result<Outcome> {
        // Octets déjà présents dans le fichier partiel.
        let existing: u64 = match fs::metadata(part_path).await {
            Ok(m) => m.len(),
            Err(_) => 0,
        };

        // Marqueur du validateur d'ORIGINE, mémorisé à côté du `.part` dès le
        // premier téléchargement. On ne reprend que si le serveur honore les
        // plages, qu'on a un validateur maintenant, ET qu'il est IDENTIQUE à
        // celui d'origine. Sans cette égalité, une ressource modifiée — même à
        // taille égale — serait reprise et corrompue en silence (le validateur
        // fraîchement sondé « correspond » toujours à lui-même : il ne peut donc
        // PAS servir de garde, c'est tout l'intérêt de mémoriser l'original).
        let vmarker = validator_marker(part_path);
        let validator = info.etag.clone().or_else(|| info.last_modified.clone());
        let stored = read_marker(&vmarker).await;
        let can_resume = existing > 0
            && info.accept_ranges
            && validator.is_some()
            && stored.as_deref() == validator.as_deref();
        // Départ neuf (ou reprise refusée car ressource changée) : on (ré)écrit
        // le validateur courant pour les reprises futures ; le `.part` périmé
        // sera tronqué par la réponse complète (200) ci-dessous.
        if !can_resume {
            write_marker(&vmarker, validator.as_deref()).await;
        }

        let mut req = metadata::apply_auth(self.client.get(&info.final_url), task.auth.as_ref());
        if can_resume {
            req = req.header(RANGE, format!("bytes={existing}-"));
            if let Some(v) = &validator {
                // If-Range : le serveur renvoie 206 si inchangé, 200 (complet) sinon.
                req = req.header(IF_RANGE, v.clone());
            }
        }

        let resp = req.send().await?;
        let status = resp.status();

        // Mode d'écriture déterminé par la réponse réelle du serveur.
        let (mut file, mut downloaded) = match status {
            StatusCode::PARTIAL_CONTENT => {
                // Reprise acceptée : on ajoute à la suite.
                let f = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(part_path)
                    .await?;
                (f, existing)
            }
            StatusCode::OK => {
                // Réponse complète : si on espérait reprendre, le serveur a ignoré
                // Range ou la ressource a changé → on repart de zéro proprement.
                let f = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .open(part_path)
                    .await?;
                (f, 0u64)
            }
            StatusCode::RANGE_NOT_SATISFIABLE => {
                // 416 : la plage dépasse la taille. Le fichier partiel est peut-être
                // déjà complet. On ne suppose JAMAIS « terminé » sans revérifier.
                if let Some(total) = info.size {
                    if existing == total {
                        return Ok(Outcome::Completed {
                            path: part_path.display().to_string(),
                            bytes: existing,
                            sha256: None,
                        });
                    }
                }
                // Sinon le partiel est incohérent : on le purge et on réessaiera à neuf.
                let _ = fs::remove_file(part_path).await;
                return Err(EngineError::HttpStatus(416));
            }
            s if s.is_client_error() => return Err(EngineError::HttpStatus(s.as_u16())),
            s if s.is_server_error() => {
                // Respecte Retry-After si présent avant que la boucle ne réessaie.
                if let Some(d) = parse_retry_after(resp.headers().get(RETRY_AFTER)) {
                    tokio::time::sleep(d).await;
                }
                return Err(EngineError::HttpStatus(s.as_u16()));
            }
            s => return Err(EngineError::HttpStatus(s.as_u16())),
        };

        // Taille totale la plus fiable : Content-Length de cette réponse + offset.
        let body_len = resp
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok());
        let total = info
            .size
            .or_else(|| body_len.map(|b| b + downloaded));

        // Diffusion bloc par bloc (mémoire bornée).
        let mut stream = resp.bytes_stream();
        let mut last_emit = Instant::now();
        let mut window_bytes: u64 = 0;
        let mut window_start = Instant::now();
        let mut speed_bps = 0.0f64;

        self.emit(
            progress,
            task,
            downloaded,
            total,
            speed_bps,
            crate::model::DownloadStatus::Downloading,
        );

        while let Some(chunk) = stream.next().await {
            // Réaction aux ordres de contrôle entre deux blocs.
            if control.is_cancelled() {
                file.flush().await?;
                return Err(EngineError::Cancelled);
            }
            if control.is_paused() {
                file.flush().await?;
                self.emit(
                    progress,
                    task,
                    downloaded,
                    total,
                    0.0,
                    crate::model::DownloadStatus::Paused,
                );
                return Ok(Outcome::Paused { downloaded });
            }

            let bytes = chunk?;
            let n = bytes.len() as u64;
            // Limiteur de débit global (0 = illimité) : attente avant écriture.
            self.limiter.acquire(n).await;
            // Gestion explicite du disque plein (section 9.2).
            if let Err(e) = file.write_all(&bytes).await {
                if e.raw_os_error() == Some(28) {
                    // ENOSPC
                    file.flush().await?;
                    return Err(EngineError::DiskFull);
                }
                return Err(EngineError::Io(e));
            }

            downloaded += n;
            window_bytes += n;

            // Débit lissé sur une fenêtre ~1 s (section 11.2).
            let win = window_start.elapsed();
            if win >= Duration::from_secs(1) {
                speed_bps = window_bytes as f64 / win.as_secs_f64();
                window_bytes = 0;
                window_start = Instant::now();
            }

            if last_emit.elapsed() >= self.config.progress_interval {
                self.emit(
                    progress,
                    task,
                    downloaded,
                    total,
                    speed_bps,
                    crate::model::DownloadStatus::Downloading,
                );
                last_emit = Instant::now();
            }
        }

        // Fermeture correcte du fichier avant toute déclaration de fin.
        file.flush().await?;
        file.sync_all().await?;
        drop(file);

        // Vérification de taille si le serveur l'a annoncée.
        if let Some(total) = total {
            if downloaded != total {
                return Err(EngineError::SizeMismatch {
                    expected: total,
                    actual: downloaded,
                });
            }
        }

        Ok(Outcome::Completed {
            path: part_path.display().to_string(),
            bytes: downloaded,
            sha256: None,
        })
    }

    /// Vérifie l'empreinte (si demandée) puis renomme atomiquement le `.part`.
    async fn finalize(
        &self,
        task: &DownloadTask,
        _info: &RemoteInfo,
        part_path: &Path,
        dir: &Path,
        chosen: &str,
        progress: &ProgressFn,
    ) -> Result<Outcome> {
        let bytes = fs::metadata(part_path).await?.len();

        // On calcule toujours l'empreinte SHA-256 (traçabilité + vérification FR-12).
        let digest = hash::sha256_file(part_path).await?;
        if let Some(expected) = &task.expected_sha256 {
            if !expected.eq_ignore_ascii_case(&digest) {
                return Err(EngineError::IntegrityMismatch {
                    expected: expected.clone(),
                    actual: digest,
                });
            }
        }
        let sha = Some(digest);

        let final_path = filename::unique_destination(dir, chosen);
        // rename atomique sur un même système de fichiers.
        fs::rename(part_path, &final_path).await?;
        // Le marqueur de validateur n'a plus d'utilité une fois le fichier finalisé.
        let _ = fs::remove_file(validator_marker(part_path)).await;

        self.emit(
            progress,
            task,
            bytes,
            Some(bytes),
            0.0,
            crate::model::DownloadStatus::Completed,
        );

        Ok(Outcome::Completed {
            path: final_path.display().to_string(),
            bytes,
            sha256: sha,
        })
    }

    fn emit(
        &self,
        progress: &ProgressFn,
        task: &DownloadTask,
        downloaded: u64,
        total: Option<u64>,
        speed_bps: f64,
        status: crate::model::DownloadStatus,
    ) {
        progress(Progress {
            download_id: task.id.clone(),
            downloaded,
            total,
            speed_bps,
            status,
            segments: None,
        });
    }
}

/// Chemin du marqueur de validateur, accolé au fichier partiel (« ….rkt-part.v »).
/// Mémorise l'ETag/Last-Modified vu au premier téléchargement pour sécuriser la
/// reprise après redémarrage (cf. `attempt`).
fn validator_marker(part_path: &Path) -> PathBuf {
    let mut p = part_path.as_os_str().to_owned();
    p.push(".v");
    PathBuf::from(p)
}

/// Lit le validateur d'origine mémorisé (`None` si absent ou vide).
async fn read_marker(path: &Path) -> Option<String> {
    let s = fs::read_to_string(path).await.ok()?;
    let s = s.trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/// Écrit le validateur d'origine à côté du fichier partiel (best-effort).
async fn write_marker(path: &Path, validator: Option<&str>) {
    let _ = fs::write(path, validator.unwrap_or("")).await;
}

/// Analyse l'en-tête `Retry-After` (format « secondes » uniquement, suffisant ici).
fn parse_retry_after(value: Option<&reqwest::header::HeaderValue>) -> Option<Duration> {
    let secs = value?.to_str().ok()?.trim().parse::<u64>().ok()?;
    Some(Duration::from_secs(secs.min(120)))
}
