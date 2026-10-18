//! Persistance SQLite (section 10) avec schéma versionné et migrations contrôlées.
//!
//! On ne conserve jamais cookies ni jetons d'accès en clair. L'URL est stockée
//! telle quelle pour pouvoir reprendre, mais les secrets de session restent hors
//! base (section 10, dernier paragraphe).

use crate::error::Result;
use crate::model::{DownloadStatus, DownloadTask};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::Path;

/// Version courante du schéma (incrémentée à chaque migration).
const SCHEMA_VERSION: i64 = 2;

/// Enregistrement d'un téléchargement tel que persisté.
#[derive(Debug, Clone)]
pub struct DownloadRecord {
    pub id: String,
    pub url: String,
    pub display_name: String,
    pub destination: String,
    pub status: DownloadStatus,
    pub total_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    pub mime_type: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub sha256: Option<String>,
    pub error_code: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Entrée d'historique d'un téléchargement (table `events`).
#[derive(Debug, Clone)]
pub struct EventRecord {
    pub event_type: String,
    pub timestamp: i64,
    pub message: Option<String>,
}

/// Entrée d'historique persistant (table `history`) : conserve les informations
/// de base d'un fichier téléchargé pour pouvoir le re-télécharger plus tard.
#[derive(Debug, Clone)]
pub struct HistoryRecord {
    pub id: String,
    pub url: String,
    pub display_name: String,
    pub destination: String,
    pub total_bytes: Option<u64>,
    pub sha256: Option<String>,
    /// Origine : `http`, `media` (yt-dlp) ou `torrent`.
    pub source: String,
    pub completed_at: i64,
}

/// Couche d'accès au stockage.
pub struct Store {
    conn: Connection,
}

impl Store {
    /// Ouvre (ou crée) la base et applique les migrations.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    /// Base en mémoire (tests).
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        Self::init(conn)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        let store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    /// Applique les migrations de schéma de façon contrôlée (section 5.1).
    fn migrate(&self) -> Result<()> {
        let current: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap_or(0);

        if current < 1 {
            self.conn.execute_batch(
                r#"
                CREATE TABLE downloads (
                    id               TEXT PRIMARY KEY,
                    url              TEXT NOT NULL,
                    display_name     TEXT NOT NULL,
                    destination      TEXT NOT NULL,
                    status           TEXT NOT NULL,
                    total_bytes      INTEGER,
                    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                    mime_type        TEXT,
                    etag             TEXT,
                    last_modified    TEXT,
                    sha256           TEXT,
                    error_code       TEXT,
                    created_at       INTEGER NOT NULL,
                    updated_at       INTEGER NOT NULL
                );

                CREATE TABLE segments (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id      TEXT NOT NULL REFERENCES downloads(id) ON DELETE CASCADE,
                    start_byte       INTEGER NOT NULL,
                    end_byte         INTEGER NOT NULL,
                    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
                    status           TEXT NOT NULL,
                    checksum         TEXT
                );

                CREATE TABLE categories (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    name                 TEXT NOT NULL UNIQUE,
                    extensions           TEXT,
                    destination_template TEXT
                );

                CREATE TABLE settings (
                    key        TEXT PRIMARY KEY,
                    value      TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE events (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    download_id TEXT REFERENCES downloads(id) ON DELETE CASCADE,
                    event_type  TEXT NOT NULL,
                    timestamp   INTEGER NOT NULL,
                    message     TEXT
                );

                CREATE TABLE browser_rules (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    host       TEXT NOT NULL,
                    action     TEXT NOT NULL,
                    enabled    INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL
                );

                CREATE INDEX idx_downloads_status ON downloads(status);
                CREATE INDEX idx_segments_download ON segments(download_id);
                CREATE INDEX idx_events_download ON events(download_id);
                "#,
            )?;
        }

        if current < 2 {
            // Historique persistant des fichiers téléchargés : survit à la
            // suppression d'une entrée de la liste active (permet de
            // re-télécharger un fichier effacé par mégarde).
            self.conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS history (
                    id            TEXT PRIMARY KEY,
                    url           TEXT NOT NULL,
                    display_name  TEXT NOT NULL,
                    destination   TEXT NOT NULL,
                    total_bytes   INTEGER,
                    sha256        TEXT,
                    source        TEXT NOT NULL DEFAULT 'http',
                    completed_at  INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_history_completed ON history(completed_at);
                "#,
            )?;
        }

        if current < SCHEMA_VERSION {
            self.conn
                .pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }

        Ok(())
    }

    /// Insère une nouvelle tâche à l'état `Queued`.
    pub fn insert(&self, task: &DownloadTask, display_name: &str) -> Result<()> {
        let now = now_ts();
        self.conn.execute(
            r#"INSERT INTO downloads
               (id, url, display_name, destination, status, downloaded_bytes, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, 'queued', 0, ?5, ?5)"#,
            params![task.id, task.url, display_name, task.dest_dir, now],
        )?;
        self.log_event(&task.id, "created", "téléchargement enregistré")?;
        Ok(())
    }

    /// Met à jour l'état et la progression d'un téléchargement.
    pub fn update_progress(
        &self,
        id: &str,
        status: DownloadStatus,
        downloaded: u64,
        total: Option<u64>,
    ) -> Result<()> {
        self.conn.execute(
            r#"UPDATE downloads
               SET status = ?2, downloaded_bytes = ?3,
                   total_bytes = COALESCE(?4, total_bytes), updated_at = ?5
               WHERE id = ?1"#,
            params![id, status.as_str(), downloaded, total, now_ts()],
        )?;
        Ok(())
    }

    /// Enregistre les métadonnées découvertes lors du sondage.
    pub fn set_metadata(
        &self,
        id: &str,
        mime: Option<&str>,
        etag: Option<&str>,
        last_modified: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            r#"UPDATE downloads
               SET mime_type = ?2, etag = ?3, last_modified = ?4, updated_at = ?5
               WHERE id = ?1"#,
            params![id, mime, etag, last_modified, now_ts()],
        )?;
        Ok(())
    }

    /// Marque un téléchargement terminé avec son empreinte et sa destination finale.
    pub fn mark_completed(&self, id: &str, sha256: &str, final_path: &str, bytes: u64) -> Result<()> {
        self.conn.execute(
            r#"UPDATE downloads
               SET status = 'completed', sha256 = ?2, destination = ?3,
                   downloaded_bytes = ?4, total_bytes = COALESCE(total_bytes, ?4),
                   error_code = NULL, updated_at = ?5
               WHERE id = ?1"#,
            params![id, sha256, final_path, bytes, now_ts()],
        )?;
        self.log_event(id, "completed", "téléchargement finalisé")?;
        Ok(())
    }

    /// Marque un téléchargement en erreur.
    pub fn mark_error(&self, id: &str, code: &str, message: &str) -> Result<()> {
        self.conn.execute(
            r#"UPDATE downloads SET status = 'error', error_code = ?2, updated_at = ?3 WHERE id = ?1"#,
            params![id, code, now_ts()],
        )?;
        self.log_event(id, "error", message)?;
        Ok(())
    }

    /// Récupère un enregistrement par identifiant.
    pub fn get(&self, id: &str) -> Result<Option<DownloadRecord>> {
        let rec = self
            .conn
            .query_row(
                "SELECT id, url, display_name, destination, status, total_bytes, downloaded_bytes, \
                 mime_type, etag, last_modified, sha256, error_code, created_at, updated_at \
                 FROM downloads WHERE id = ?1",
                params![id],
                Self::map_row,
            )
            .optional()?;
        Ok(rec)
    }

    /// Liste tous les téléchargements (plus récents d'abord).
    pub fn list(&self) -> Result<Vec<DownloadRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, display_name, destination, status, total_bytes, downloaded_bytes, \
             mime_type, etag, last_modified, sha256, error_code, created_at, updated_at \
             FROM downloads ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], Self::map_row)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Supprime un téléchargement de la base (ses événements/segments suivent
    /// via `ON DELETE CASCADE`).
    pub fn delete_download(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM downloads WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Liste les transferts qui étaient actifs (ou en file) au moment de l'arrêt
    /// — ceux à reprendre automatiquement au prochain démarrage. Les transferts
    /// volontairement mis en pause par l'utilisateur ont le statut `paused` et
    /// sont donc exclus : ils restent en pause (section 5.1, FR-04).
    pub fn list_interrupted(&self) -> Result<Vec<DownloadRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, display_name, destination, status, total_bytes, downloaded_bytes, \
             mime_type, etag, last_modified, sha256, error_code, created_at, updated_at \
             FROM downloads WHERE status IN ('downloading', 'probing', 'queued') \
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map([], Self::map_row)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Au démarrage : ramène les tâches « en cours » à l'état `paused` pour
    /// restaurer un état cohérent (FR-04, section 5.1).
    pub fn recover_interrupted(&self) -> Result<usize> {
        let n = self.conn.execute(
            "UPDATE downloads SET status = 'paused', updated_at = ?1 \
             WHERE status IN ('downloading', 'probing', 'queued')",
            params![now_ts()],
        )?;
        Ok(n)
    }

    /// Enregistre (ou met à jour) un paramètre applicatif.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) \
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
            params![key, value, now_ts()],
        )?;
        Ok(())
    }

    /// Lit un paramètre applicatif.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let v = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get::<_, String>(0),
            )
            .optional()?;
        Ok(v)
    }

    /// Lit tous les paramètres sous forme de dictionnaire.
    pub fn all_settings(&self) -> Result<HashMap<String, String>> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        let mut map = HashMap::new();
        for r in rows {
            let (k, v) = r?;
            map.insert(k, v);
        }
        Ok(map)
    }

    /// Historique d'un téléchargement (plus récent d'abord).
    pub fn events(&self, id: &str, limit: usize) -> Result<Vec<EventRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT event_type, timestamp, message FROM events \
             WHERE download_id = ?1 ORDER BY timestamp DESC, id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![id, limit as i64], |r| {
            Ok(EventRecord {
                event_type: r.get(0)?,
                timestamp: r.get(1)?,
                message: r.get(2)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Ajoute (ou remplace) une entrée d'historique. Idempotent par `id`.
    pub fn add_history(&self, h: &HistoryRecord) -> Result<()> {
        self.conn.execute(
            r#"INSERT OR REPLACE INTO history
               (id, url, display_name, destination, total_bytes, sha256, source, completed_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
            params![
                h.id,
                h.url,
                h.display_name,
                h.destination,
                h.total_bytes.map(|v| v as i64),
                h.sha256,
                h.source,
                h.completed_at
            ],
        )?;
        Ok(())
    }

    /// Liste l'historique (plus récent d'abord).
    pub fn list_history(&self, limit: usize) -> Result<Vec<HistoryRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, url, display_name, destination, total_bytes, sha256, source, completed_at \
             FROM history ORDER BY completed_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit as i64], |r| {
            Ok(HistoryRecord {
                id: r.get(0)?,
                url: r.get(1)?,
                display_name: r.get(2)?,
                destination: r.get(3)?,
                total_bytes: r.get::<_, Option<i64>>(4)?.map(|v| v as u64),
                sha256: r.get(5)?,
                source: r.get(6)?,
                completed_at: r.get(7)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// Supprime une entrée d'historique.
    pub fn delete_history(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM history WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Vide tout l'historique.
    pub fn clear_history(&self) -> Result<()> {
        self.conn.execute("DELETE FROM history", [])?;
        Ok(())
    }

    fn log_event(&self, id: &str, event_type: &str, message: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO events (download_id, event_type, timestamp, message) VALUES (?1, ?2, ?3, ?4)",
            params![id, event_type, now_ts(), message],
        )?;
        Ok(())
    }

    fn map_row(row: &rusqlite::Row) -> rusqlite::Result<DownloadRecord> {
        Ok(DownloadRecord {
            id: row.get(0)?,
            url: row.get(1)?,
            display_name: row.get(2)?,
            destination: row.get(3)?,
            status: DownloadStatus::from_str(&row.get::<_, String>(4)?),
            total_bytes: row.get::<_, Option<i64>>(5)?.map(|v| v as u64),
            downloaded_bytes: row.get::<_, i64>(6)? as u64,
            mime_type: row.get(7)?,
            etag: row.get(8)?,
            last_modified: row.get(9)?,
            sha256: row.get(10)?,
            error_code: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    }
}

/// Horodatage epoch en secondes.
fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task(id: &str) -> DownloadTask {
        DownloadTask {
            id: id.to_string(),
            url: "https://ex.com/f.zip".to_string(),
            dest_dir: "/tmp".to_string(),
            filename: None,
            expected_sha256: None,
            auth: None,
        }
    }

    #[test]
    fn insere_et_relit() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&task("a"), "f.zip").unwrap();
        let rec = store.get("a").unwrap().unwrap();
        assert_eq!(rec.status, DownloadStatus::Queued);
        assert_eq!(rec.display_name, "f.zip");
    }

    #[test]
    fn recupere_les_taches_interrompues() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&task("a"), "f.zip").unwrap();
        store
            .update_progress("a", DownloadStatus::Downloading, 100, Some(500))
            .unwrap();
        let n = store.recover_interrupted().unwrap();
        assert_eq!(n, 1);
        assert_eq!(store.get("a").unwrap().unwrap().status, DownloadStatus::Paused);
    }

    #[test]
    fn liste_a_reprendre_exclut_les_pauses_utilisateur() {
        let store = Store::open_in_memory().unwrap();
        // « a » était en cours (interrompu par l'arrêt), « b » a été mis en
        // pause volontairement, « c » est terminé.
        store.insert(&task("a"), "a.zip").unwrap();
        store.insert(&task("b"), "b.zip").unwrap();
        store.insert(&task("c"), "c.zip").unwrap();
        store
            .update_progress("a", DownloadStatus::Downloading, 10, Some(100))
            .unwrap();
        store
            .update_progress("b", DownloadStatus::Paused, 20, Some(100))
            .unwrap();
        store.mark_completed("c", "h", "/tmp/c.zip", 100).unwrap();

        let resume = store.list_interrupted().unwrap();
        let ids: Vec<&str> = resume.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids, vec!["a"], "seul le transfert actif doit être repris");
    }

    #[test]
    fn marque_termine() {
        let store = Store::open_in_memory().unwrap();
        store.insert(&task("a"), "f.zip").unwrap();
        store.mark_completed("a", "abc123", "/tmp/f.zip", 500).unwrap();
        let rec = store.get("a").unwrap().unwrap();
        assert_eq!(rec.status, DownloadStatus::Completed);
        assert_eq!(rec.sha256.as_deref(), Some("abc123"));
    }

    #[test]
    fn historique_ajout_liste_suppression() {
        let store = Store::open_in_memory().unwrap();
        let h = |id: &str, name: &str| HistoryRecord {
            id: id.to_string(),
            url: "https://ex.com/f.zip".to_string(),
            display_name: name.to_string(),
            destination: format!("/tmp/{name}"),
            total_bytes: Some(1024),
            sha256: Some("abc".to_string()),
            source: "http".to_string(),
            completed_at: 100,
        };
        store.add_history(&h("a", "un.zip")).unwrap();
        store.add_history(&h("b", "deux.zip")).unwrap();
        // Idempotent : même id → remplace, pas de doublon.
        store.add_history(&h("a", "un.zip")).unwrap();
        assert_eq!(store.list_history(50).unwrap().len(), 2);

        store.delete_history("a").unwrap();
        let rest = store.list_history(50).unwrap();
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].display_name, "deux.zip");

        store.clear_history().unwrap();
        assert_eq!(store.list_history(50).unwrap().len(), 0);
    }

    #[test]
    fn parametres_set_get() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.get_setting("speed_limit").unwrap(), None);
        store.set_setting("speed_limit", "512000").unwrap();
        store.set_setting("connections", "16").unwrap();
        // Mise à jour (upsert).
        store.set_setting("connections", "12").unwrap();
        assert_eq!(store.get_setting("speed_limit").unwrap().as_deref(), Some("512000"));
        assert_eq!(store.get_setting("connections").unwrap().as_deref(), Some("12"));
        assert_eq!(store.all_settings().unwrap().len(), 2);
    }
}
