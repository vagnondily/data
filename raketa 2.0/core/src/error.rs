//! Types d'erreur du moteur RAKETA.

use thiserror::Error;

/// Erreurs renvoyées par le moteur de téléchargement.
#[derive(Debug, Error)]
pub enum EngineError {
    #[error("erreur réseau : {0}")]
    Network(#[from] reqwest::Error),

    #[error("erreur d'entrée/sortie : {0}")]
    Io(#[from] std::io::Error),

    #[error("erreur base de données : {0}")]
    Db(#[from] rusqlite::Error),

    #[error("URL invalide : {0}")]
    InvalidUrl(String),

    #[error("protocole non supporté : {0} (seuls http/https sont acceptés)")]
    UnsupportedScheme(String),

    #[error("le serveur a renvoyé le statut HTTP {0}")]
    HttpStatus(u16),

    #[error("la ressource distante a changé (validateur ETag/Last-Modified différent)")]
    ValidatorMismatch,

    #[error("intégrité invalide : empreinte attendue {expected}, obtenue {actual}")]
    IntegrityMismatch { expected: String, actual: String },

    #[error("taille invalide : attendue {expected} octets, obtenue {actual}")]
    SizeMismatch { expected: u64, actual: u64 },

    #[error("espace disque insuffisant")]
    DiskFull,

    #[error("téléchargement annulé")]
    Cancelled,

    #[error("trop de tentatives échouées ({0})")]
    TooManyRetries(u32),

    #[error("{0}")]
    Other(String),
}

impl EngineError {
    /// Indique si l'erreur est transitoire et justifie une nouvelle tentative.
    pub fn is_retryable(&self) -> bool {
        match self {
            EngineError::Network(_) => true,
            EngineError::HttpStatus(code) => *code == 429 || (500..=599).contains(code),
            EngineError::Io(e) => matches!(
                e.kind(),
                std::io::ErrorKind::TimedOut
                    | std::io::ErrorKind::ConnectionReset
                    | std::io::ErrorKind::BrokenPipe
                    | std::io::ErrorKind::UnexpectedEof
            ),
            _ => false,
        }
    }
}

/// Alias de résultat du moteur.
pub type Result<T> = std::result::Result<T, EngineError>;
