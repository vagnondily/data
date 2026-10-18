//! Journal d'événements et d'erreurs de RAKETA.
//!
//! Écrit dans un fichier texte (dossier de données utilisateur) pour permettre
//! le diagnostic et le signalement de problèmes. Léger, synchrone, avec une
//! rotation simple pour éviter une croissance illimitée.

use directories::ProjectDirs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

/// Dossier des journaux.
pub fn log_dir() -> PathBuf {
    ProjectDirs::from("com", "SmartServiceAndroy", "RAKETA")
        .map(|d| d.data_dir().join("logs"))
        .unwrap_or_else(|| PathBuf::from("logs"))
}

/// Chemin du fichier de journal courant.
pub fn log_path() -> PathBuf {
    log_dir().join("raketa.log")
}

/// Ajoute une entrée au journal (niveau : INFO, WARN, ERROR…).
pub fn log(level: &str, message: &str) {
    let _ = append(level, message);
}

/// Raccourci pour une erreur.
pub fn error(context: &str, message: &str) {
    log("ERROR", &format!("{context}: {message}"));
}

fn append(level: &str, message: &str) -> std::io::Result<()> {
    let dir = log_dir();
    std::fs::create_dir_all(&dir)?;
    let path = log_path();
    // Rotation simple : au-delà de 1 Mo, on archive l'ancien journal.
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 1_000_000 {
            let _ = std::fs::rename(&path, dir.join("raketa.log.old"));
        }
    }
    let ts = crate::manager::now_secs();
    // Les retours à la ligne du message sont neutralisés (une entrée = une ligne).
    let clean = message.replace(['\n', '\r', '\t'], " ");
    let mut f = OpenOptions::new().create(true).append(true).open(&path)?;
    writeln!(f, "{ts}\t{level}\t{clean}")?;
    Ok(())
}

/// Entrée de journal structurée, pour l'interface.
#[derive(Debug, Clone, serde::Serialize)]
pub struct LogEntry {
    pub ts: i64,
    pub level: String,
    pub message: String,
}

/// Renvoie les `n` dernières entrées du journal (plus récentes en dernier).
pub fn tail(n: usize) -> Vec<LogEntry> {
    let content = std::fs::read_to_string(log_path()).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..]
        .iter()
        .map(|line| {
            let mut parts = line.splitn(3, '\t');
            let ts = parts.next().and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
            let level = parts.next().unwrap_or("INFO").to_string();
            let message = parts.next().unwrap_or("").to_string();
            LogEntry { ts, level, message }
        })
        .collect()
}

/// Vide le journal.
pub fn clear() {
    let _ = std::fs::write(log_path(), b"");
    let _ = std::fs::remove_file(log_dir().join("raketa.log.old"));
}
