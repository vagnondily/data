//! Téléchargement multi-segments (phase P4) — le cœur de la vitesse.
//!
//! Le fichier est découpé en N plages d'octets téléchargées **en parallèle**,
//! chacune dans son propre fichier `.part.N` (append-only). La longueur de
//! chaque fichier `.part.N` donne directement sa progression, ce qui rend la
//! **reprise triviale et sans corruption** : on relance chaque segment là où il
//! s'est arrêté, via `Range` + `If-Range`. Une fois tous les segments complets,
//! on les concatène dans l'ordre en calculant l'empreinte SHA-256 au passage,
//! puis on finalise atomiquement (`rename`).
//!
//! On n'entre en mode multi-segments que si la taille est connue, que le serveur
//! honore `Accept-Ranges` et que le fichier dépasse un seuil : sinon on retombe
//! sur le flux unique (voir `engine.rs`).

use crate::engine::EngineConfig;
use crate::error::{EngineError, Result};
use crate::filename;
use crate::model::{Control, DownloadStatus, DownloadTask, Outcome, Progress};
use crate::{ProgressFn, RateLimiter};
use futures_util::future::join_all;
use futures_util::StreamExt;
use reqwest::header::{IF_RANGE, RANGE};
use reqwest::{Client, StatusCode};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::fs::{self, OpenOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Résultat d'un segment individuel.
enum SegStatus {
    Completed,
    Paused,
}

/// Découpe `total` octets en plages inclusives `(start, end)`.
///
/// Le nombre de segments est borné pour qu'aucun segment ne soit plus petit que
/// `min_seg`, et ne dépasse pas `connections`.
pub fn plan_segments(total: u64, connections: usize, min_seg: u64) -> Vec<(u64, u64)> {
    let max_by_size = (total / min_seg.max(1)).max(1) as usize;
    let n = connections.clamp(1, max_by_size);
    let base = total / n as u64;
    let rem = total % n as u64;

    let mut ranges = Vec::with_capacity(n);
    let mut start = 0u64;
    for i in 0..n as u64 {
        let len = base + if i < rem { 1 } else { 0 };
        if len == 0 {
            continue;
        }
        let end = start + len - 1;
        ranges.push((start, end));
        start = end + 1;
    }
    ranges
}

/// Exécute un téléchargement multi-segments complet (segments + finalisation).
#[allow(clippy::too_many_arguments)]
pub async fn run(
    client: Client,
    config: EngineConfig,
    connections: usize,
    limiter: RateLimiter,
    task: DownloadTask,
    final_url: String,
    validator: Option<String>,
    total: u64,
    dir: PathBuf,
    chosen: String,
    control: Control,
    progress: ProgressFn,
) -> Result<Outcome> {
    let ranges = plan_segments(total, connections, config.min_segment_size);
    let part_path = |i: usize| dir.join(format!("{chosen}{}.{i}", config.part_suffix));

    // Compteur partagé de l'avancement global (octets déjà sur disque inclus).
    let shared = Arc::new(AtomicU64::new(0));
    for i in 0..ranges.len() {
        if let Ok(meta) = fs::metadata(part_path(i)).await {
            shared.fetch_add(meta.len(), Ordering::SeqCst);
        }
    }

    // Tâche de rapport : publie la progression agrégée et le débit lissé.
    let done = Arc::new(AtomicBool::new(false));
    let reporter = tokio::spawn(report(
        progress.clone(),
        control.clone(),
        shared.clone(),
        done.clone(),
        total,
        task.id.clone(),
        config.progress_interval,
    ));

    // Lancement des segments en parallèle.
    let futures = ranges.iter().enumerate().map(|(i, &(start, end))| {
        fetch_segment(
            client.clone(),
            config.clone(),
            limiter.clone(),
            final_url.clone(),
            validator.clone(),
            start,
            end,
            part_path(i),
            control.clone(),
            shared.clone(),
        )
    });
    let results = join_all(futures).await;

    done.store(true, Ordering::SeqCst);
    reporter.abort();

    if control.is_cancelled() {
        return Err(EngineError::Cancelled);
    }

    // Un échec non récupérable d'un segment fait échouer l'ensemble.
    let mut any_paused = false;
    for r in results {
        match r? {
            SegStatus::Paused => any_paused = true,
            SegStatus::Completed => {}
        }
    }

    if any_paused {
        let downloaded = shared.load(Ordering::SeqCst);
        progress(Progress {
            download_id: task.id.clone(),
            downloaded,
            total: Some(total),
            speed_bps: 0.0,
            status: DownloadStatus::Paused,
        });
        return Ok(Outcome::Paused { downloaded });
    }

    // Tous les segments sont complets : concaténation + vérification + finalisation.
    concat_and_finalize(&config, &task, &dir, &chosen, ranges.len(), total, &progress).await
}

/// Télécharge une plage `[start, end]` dans son fichier `.part.i` (append-only).
#[allow(clippy::too_many_arguments)]
async fn fetch_segment(
    client: Client,
    config: EngineConfig,
    limiter: RateLimiter,
    url: String,
    validator: Option<String>,
    start: u64,
    end: u64,
    path: PathBuf,
    control: Control,
    shared: Arc<AtomicU64>,
) -> Result<SegStatus> {
    let seg_len = end - start + 1;
    let mut attempt: u32 = 0;

    loop {
        if control.is_cancelled() {
            return Err(EngineError::Cancelled);
        }
        if control.is_paused() {
            return Ok(SegStatus::Paused);
        }

        // Progression déjà sur disque pour ce segment.
        let existing = fs::metadata(&path).await.map(|m| m.len()).unwrap_or(0);
        if existing >= seg_len {
            return Ok(SegStatus::Completed);
        }

        let from = start + existing;
        let mut req = client
            .get(&url)
            .header(RANGE, format!("bytes={from}-{end}"));
        if let Some(v) = &validator {
            req = req.header(IF_RANGE, v.clone());
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                if attempt < config.max_retries {
                    attempt += 1;
                    tokio::time::sleep(config.base_backoff * 2u32.pow(attempt.min(6))).await;
                    continue;
                }
                return Err(EngineError::Network(e));
            }
        };

        match resp.status() {
            StatusCode::PARTIAL_CONTENT => { /* attendu */ }
            StatusCode::OK => {
                // Le serveur a ignoré Range alors qu'il annonçait le support :
                // on ne peut pas assembler des segments de façon fiable.
                return Err(EngineError::Other(
                    "le serveur a ignoré Range pendant un transfert multi-segments".into(),
                ));
            }
            StatusCode::RANGE_NOT_SATISFIABLE => {
                if existing >= seg_len {
                    return Ok(SegStatus::Completed);
                }
                return Err(EngineError::HttpStatus(416));
            }
            s if s.is_server_error() || s.as_u16() == 429 => {
                if attempt < config.max_retries {
                    attempt += 1;
                    tokio::time::sleep(config.base_backoff * 2u32.pow(attempt.min(6))).await;
                    continue;
                }
                return Err(EngineError::HttpStatus(s.as_u16()));
            }
            s => return Err(EngineError::HttpStatus(s.as_u16())),
        }

        // Écriture en append, bornée à la taille exacte du segment (défense
        // contre un serveur qui ignorerait la borne haute de Range).
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await?;

        let mut remaining = seg_len - existing;
        let mut stream = resp.bytes_stream();
        let mut clean_eof = false;

        while let Some(chunk) = stream.next().await {
            if control.is_cancelled() {
                file.flush().await?;
                return Err(EngineError::Cancelled);
            }
            if control.is_paused() {
                file.flush().await?;
                return Ok(SegStatus::Paused);
            }

            let bytes = match chunk {
                Ok(b) => b,
                Err(_) => break, // coupure : on retentera (reprise par Range)
            };

            let take = (bytes.len() as u64).min(remaining) as usize;
            // Limiteur de débit global partagé entre tous les segments.
            limiter.acquire(take as u64).await;
            if let Err(e) = file.write_all(&bytes[..take]).await {
                if e.raw_os_error() == Some(28) {
                    return Err(EngineError::DiskFull);
                }
                return Err(EngineError::Io(e));
            }
            shared.fetch_add(take as u64, Ordering::SeqCst);
            remaining -= take as u64;
            if remaining == 0 {
                clean_eof = true;
                break;
            }
        }

        file.flush().await?;
        file.sync_all().await?;

        if clean_eof || remaining == 0 {
            return Ok(SegStatus::Completed);
        }

        // Fin de flux prématurée : nouvelle tentative (la reprise reprend l'offset).
        if attempt < config.max_retries {
            attempt += 1;
            tokio::time::sleep(config.base_backoff * 2u32.pow(attempt.min(6))).await;
            continue;
        }
        return Err(EngineError::TooManyRetries(attempt));
    }
}

/// Concatène les fichiers `.part.i` dans l'ordre, calcule le SHA-256, vérifie et
/// finalise atomiquement, puis supprime les fichiers partiels.
async fn concat_and_finalize(
    config: &EngineConfig,
    task: &DownloadTask,
    dir: &PathBuf,
    chosen: &str,
    n: usize,
    total: u64,
    progress: &ProgressFn,
) -> Result<Outcome> {
    let assembled = dir.join(format!("{chosen}{}.assembled", config.part_suffix));
    let mut out = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&assembled)
        .await?;

    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 1024];
    let mut written: u64 = 0;

    for i in 0..n {
        let part = dir.join(format!("{chosen}{}.{i}", config.part_suffix));
        let mut f = fs::File::open(&part).await?;
        loop {
            let read = f.read(&mut buf).await?;
            if read == 0 {
                break;
            }
            if let Err(e) = out.write_all(&buf[..read]).await {
                if e.raw_os_error() == Some(28) {
                    return Err(EngineError::DiskFull);
                }
                return Err(EngineError::Io(e));
            }
            hasher.update(&buf[..read]);
            written += read as u64;
        }
    }

    out.flush().await?;
    out.sync_all().await?;
    drop(out);

    // Vérification de taille.
    if written != total {
        return Err(EngineError::SizeMismatch {
            expected: total,
            actual: written,
        });
    }

    // Vérification d'empreinte si attendue (FR-12).
    let digest: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if let Some(expected) = &task.expected_sha256 {
        if !expected.eq_ignore_ascii_case(&digest) {
            return Err(EngineError::IntegrityMismatch {
                expected: expected.clone(),
                actual: digest,
            });
        }
    }

    // Finalisation atomique + nettoyage des parts.
    let final_path = filename::unique_destination(dir, chosen);
    fs::rename(&assembled, &final_path).await?;
    for i in 0..n {
        let _ = fs::remove_file(dir.join(format!("{chosen}{}.{i}", config.part_suffix))).await;
    }

    progress(Progress {
        download_id: task.id.clone(),
        downloaded: total,
        total: Some(total),
        speed_bps: 0.0,
        status: DownloadStatus::Completed,
    });

    Ok(Outcome::Completed {
        path: final_path.display().to_string(),
        bytes: total,
        sha256: Some(digest),
    })
}

/// Publie périodiquement la progression agrégée et le débit lissé.
async fn report(
    progress: ProgressFn,
    control: Control,
    shared: Arc<AtomicU64>,
    done: Arc<AtomicBool>,
    total: u64,
    id: String,
    interval: Duration,
) {
    let mut last = Instant::now();
    let mut last_bytes = shared.load(Ordering::SeqCst);

    loop {
        tokio::time::sleep(interval).await;
        if done.load(Ordering::SeqCst) {
            break;
        }
        let now = Instant::now();
        let cur = shared.load(Ordering::SeqCst);
        let dt = now.duration_since(last).as_secs_f64();
        let speed = if dt > 0.0 {
            cur.saturating_sub(last_bytes) as f64 / dt
        } else {
            0.0
        };
        last = now;
        last_bytes = cur;

        let status = if control.is_paused() {
            DownloadStatus::Paused
        } else {
            DownloadStatus::Downloading
        };
        progress(Progress {
            download_id: id.clone(),
            downloaded: cur,
            total: Some(total),
            speed_bps: speed,
            status,
        });

        if control.is_cancelled() {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoupe_en_segments_couvre_tout() {
        let ranges = plan_segments(1000, 4, 100);
        assert_eq!(ranges.len(), 4);
        assert_eq!(ranges[0].0, 0);
        assert_eq!(ranges.last().unwrap().1, 999);
        // Contiguïté : aucun trou ni chevauchement.
        for w in ranges.windows(2) {
            assert_eq!(w[0].1 + 1, w[1].0);
        }
    }

    #[test]
    fn respecte_la_taille_minimale_de_segment() {
        // 150 octets, min 100 → au plus 1 segment malgré 8 connexions.
        let ranges = plan_segments(150, 8, 100);
        assert_eq!(ranges.len(), 1);
        assert_eq!(ranges[0], (0, 149));
    }
}
