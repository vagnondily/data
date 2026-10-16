//! # raketa-core
//!
//! Moteur de téléchargement de **RAKETA** (Smart Service Androy).
//!
//! Ce crate est volontairement **indépendant de l'interface** (section 5.1) :
//! il peut être testé, mesuré et réutilisé sans Tauri ni navigateur. Il regroupe
//! le sondage des métadonnées, le téléchargement en flux avec reprise, la
//! vérification d'intégrité et la persistance SQLite.
//!
//! ## Exemple
//! ```no_run
//! use raketa_core::{Engine, model::{DownloadTask, Control}};
//! use std::sync::Arc;
//!
//! # async fn demo() -> raketa_core::error::Result<()> {
//! let engine = Engine::new()?;
//! let task = DownloadTask {
//!     id: "demo".into(),
//!     url: "https://example.com/fichier.zip".into(),
//!     dest_dir: "/tmp/raketa".into(),
//!     filename: None,
//!     expected_sha256: None,
//! };
//! let outcome = engine
//!     .download(&task, Control::new(), Arc::new(|p| println!("{} octets", p.downloaded)))
//!     .await?;
//! println!("{:?}", outcome);
//! # Ok(())
//! # }
//! ```

pub mod batch;
pub mod category;
pub mod engine;
pub mod error;
pub mod filename;
pub mod hash;
pub mod metadata;
pub mod model;
pub mod ratelimit;
pub mod segmented;
pub mod storage;

pub use category::{categorize, Category};
pub use engine::{Engine, EngineConfig, ProgressFn};
pub use error::{EngineError, Result};
pub use model::{Control, DownloadStatus, DownloadTask, Outcome, Progress, RemoteInfo};
pub use ratelimit::RateLimiter;
pub use storage::{DownloadRecord, Store};
