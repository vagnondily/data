//! Modèle de données partagé entre le moteur, le stockage et l'interface.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;

/// État d'un téléchargement (persisté et publié vers l'UI).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Probing,
    Downloading,
    Paused,
    Completed,
    Error,
    Cancelled,
}

impl DownloadStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            DownloadStatus::Queued => "queued",
            DownloadStatus::Probing => "probing",
            DownloadStatus::Downloading => "downloading",
            DownloadStatus::Paused => "paused",
            DownloadStatus::Completed => "completed",
            DownloadStatus::Error => "error",
            DownloadStatus::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "queued" => DownloadStatus::Queued,
            "probing" => DownloadStatus::Probing,
            "downloading" => DownloadStatus::Downloading,
            "paused" => DownloadStatus::Paused,
            "completed" => DownloadStatus::Completed,
            "cancelled" => DownloadStatus::Cancelled,
            _ => DownloadStatus::Error,
        }
    }
}

/// Métadonnées distantes obtenues lors du sondage (section 9.1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteInfo {
    /// URL finale après redirections.
    pub final_url: String,
    /// Taille totale si le serveur l'a annoncée.
    pub size: Option<u64>,
    /// Le serveur accepte-t-il les requêtes `Range` (octets) ?
    pub accept_ranges: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub mime_type: Option<String>,
    /// Nom de fichier suggéré (Content-Disposition ou chemin de l'URL).
    pub suggested_filename: Option<String>,
}

/// Identifiants d'authentification HTTP (Basic), pour les liens protégés par
/// mot de passe.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

/// Décrit un téléchargement à exécuter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    /// Dossier de destination.
    pub dest_dir: String,
    /// Nom de fichier imposé par l'utilisateur, sinon dérivé des en-têtes/URL.
    pub filename: Option<String>,
    /// Empreinte SHA-256 attendue (hex), vérifiée en fin de transfert si fournie.
    pub expected_sha256: Option<String>,
    /// Identifiants (Basic auth) pour les téléchargements protégés.
    #[serde(default)]
    pub auth: Option<Credentials>,
}

/// État d'un segment (connexion parallèle) pour l'affichage façon IDM.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentInfo {
    pub index: usize,
    pub downloaded: u64,
    pub total: u64,
    /// Débit instantané de CE segment (octets/seconde), lissé sur l'intervalle
    /// de rapport. Permet d'afficher la vitesse par connexion (façon IDM).
    #[serde(default)]
    pub speed_bps: f64,
}

/// Instantané de progression publié vers l'interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Progress {
    pub download_id: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    /// Débit instantané lissé, en octets/seconde.
    pub speed_bps: f64,
    pub status: DownloadStatus,
    /// Détail par segment (multi-connexions) ; absent en flux unique.
    #[serde(default)]
    pub segments: Option<Vec<SegmentInfo>>,
}

/// Résultat d'une exécution du moteur.
#[derive(Debug, Clone)]
pub enum Outcome {
    /// Transfert terminé, fichier finalisé à `path`.
    Completed {
        path: String,
        bytes: u64,
        sha256: Option<String>,
    },
    /// Transfert interrompu volontairement (pause) ; reprise possible.
    Paused { downloaded: u64 },
}

/// Ordre de contrôle d'un transfert en cours.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Signal {
    Run = 0,
    Pause = 1,
    Cancel = 2,
}

/// Jeton de contrôle partageable (thread-safe) pour piloter un transfert.
///
/// L'UI appelle `pause()` / `cancel()` ; le moteur observe l'état à chaque
/// bloc reçu et réagit sans jamais corrompre le fichier partiel.
#[derive(Debug, Clone)]
pub struct Control {
    state: Arc<AtomicU8>,
}

impl Default for Control {
    fn default() -> Self {
        Self::new()
    }
}

impl Control {
    pub fn new() -> Self {
        Self {
            state: Arc::new(AtomicU8::new(Signal::Run as u8)),
        }
    }

    pub fn pause(&self) {
        self.state.store(Signal::Pause as u8, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.state.store(Signal::Run as u8, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.state.store(Signal::Cancel as u8, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.state.load(Ordering::SeqCst) == Signal::Cancel as u8
    }

    pub fn is_paused(&self) -> bool {
        self.state.load(Ordering::SeqCst) == Signal::Pause as u8
    }
}
