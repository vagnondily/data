//! # raketa-torrent
//!
//! Moteur **BitTorrent** de RAKETA, bâti sur [`librqbit`] (Rust pur, async).
//! Il ajoute magnets et fichiers `.torrent`, le suivi de progression et de débit,
//! la pause/reprise et la suppression — exposé via un `TorrentManager` simple que
//! la couche Tauri pilote.
//!
//! Le débit est calculé côté RAKETA à partir des deltas d'octets (on ne dépend
//! pas du format interne de `Speed`), ce qui donne une valeur stable en o/s.

use anyhow::Result;
use librqbit::{AddTorrent, AddTorrentOptions, ManagedTorrent, Session, SessionOptions};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Détail d'un fichier contenu dans un torrent (façon uTorrent).
#[derive(Debug, Clone, Serialize)]
pub struct TorrentFile {
    /// Chemin relatif dans le torrent.
    pub name: String,
    /// Taille totale du fichier.
    pub len: u64,
    /// Octets déjà téléchargés pour ce fichier.
    pub downloaded: u64,
}

/// Instantané de progression d'un torrent, destiné à l'interface.
#[derive(Debug, Clone, Serialize)]
pub struct TorrentProgress {
    /// Identifiant interne (stable pour la session).
    pub id: usize,
    /// Empreinte info-hash (hex), identifiant durable du torrent.
    pub info_hash: String,
    pub name: String,
    pub downloaded: u64,
    pub total: u64,
    pub uploaded: u64,
    /// Débit de téléchargement en octets/seconde (fourni par le moteur).
    pub speed_bps: f64,
    /// Débit d'envoi (seed) en octets/seconde.
    pub up_speed_bps: f64,
    /// Pairs connectés (actifs).
    pub peers_live: u32,
    /// Pairs découverts au total (via trackers/DHT).
    pub peers_seen: u32,
    /// Détail par fichier (nom, taille, progression).
    pub files: Vec<TorrentFile>,
    pub finished: bool,
    pub paused: bool,
    /// État lisible (live, paused, initializing, error…).
    pub state: String,
    pub error: Option<String>,
}

/// Gestionnaire de torrents : encapsule une session librqbit.
pub struct TorrentManager {
    session: Arc<Session>,
    /// Poignées actives, par identifiant interne.
    handles: Mutex<HashMap<usize, Arc<ManagedTorrent>>>,
}

impl TorrentManager {
    /// Crée un gestionnaire dont les fichiers atterrissent dans `download_dir`.
    ///
    /// Le DHT, les trackers et l'écoute entrante sont actifs (configuration de
    /// production : indispensable pour les magnets et une bonne vitesse).
    pub async fn new(download_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&download_dir)?;
        let session = Session::new(download_dir).await?;
        Ok(Self::from_session(session))
    }

    /// Crée un gestionnaire avec des options de session explicites.
    ///
    /// Utile pour des environnements restreints (CI, bac à sable) où lier des
    /// sockets UDP est interdit : on peut y passer `dht: None`, `listen: None`.
    pub async fn new_with_opts(download_dir: PathBuf, opts: SessionOptions) -> Result<Self> {
        std::fs::create_dir_all(&download_dir)?;
        let session = Session::new_with_opts(download_dir, opts).await?;
        Ok(Self::from_session(session))
    }

    fn from_session(session: Arc<Session>) -> Self {
        Self {
            session,
            handles: Mutex::new(HashMap::new()),
        }
    }

    /// Ajoute un torrent depuis un lien magnet ou une URL `.torrent`.
    ///
    /// `only_files` : indices des fichiers à télécharger (sélection façon uTorrent) ;
    /// `None` télécharge tout.
    pub async fn add_magnet_or_url(
        &self,
        url: &str,
        paused: bool,
        only_files: Option<Vec<usize>>,
    ) -> Result<usize> {
        let opts = AddTorrentOptions {
            paused,
            overwrite: true, // nécessaire pour reprendre/seeder des pièces déjà écrites
            only_files,
            ..Default::default()
        };
        let resp = self
            .session
            .add_torrent(AddTorrent::from_url(url), Some(opts))
            .await?;
        self.register(resp.into_handle()).await
    }

    /// Ajoute un torrent depuis un fichier `.torrent` local.
    pub async fn add_file(
        &self,
        path: &str,
        paused: bool,
        only_files: Option<Vec<usize>>,
    ) -> Result<usize> {
        let opts = AddTorrentOptions {
            paused,
            overwrite: true,
            only_files,
            ..Default::default()
        };
        let resp = self
            .session
            .add_torrent(AddTorrent::from_local_filename(path)?, Some(opts))
            .await?;
        self.register(resp.into_handle()).await
    }

    async fn register(&self, handle: Option<Arc<ManagedTorrent>>) -> Result<usize> {
        let handle = handle.ok_or_else(|| anyhow::anyhow!("torrent ajouté sans poignée exploitable"))?;
        let id = handle.id();
        self.handles.lock().await.insert(id, handle);
        Ok(id)
    }

    /// Met un torrent en pause.
    pub async fn pause(&self, id: usize) -> Result<()> {
        if let Some(h) = self.handles.lock().await.get(&id).cloned() {
            self.session.pause(&h).await?;
        }
        Ok(())
    }

    /// Reprend un torrent en pause.
    pub async fn resume(&self, id: usize) -> Result<()> {
        if let Some(h) = self.handles.lock().await.get(&id).cloned() {
            self.session.unpause(&h).await?;
        }
        Ok(())
    }

    /// Supprime un torrent (et optionnellement ses fichiers).
    pub async fn remove(&self, id: usize, delete_files: bool) -> Result<()> {
        if let Some(h) = self.handles.lock().await.remove(&id) {
            self.session.delete(h.info_hash().into(), delete_files).await?;
        }
        Ok(())
    }

    /// Progression d'un torrent, avec débit lissé calculé entre deux appels.
    pub async fn progress(&self, id: usize) -> Option<TorrentProgress> {
        let handle = self.handles.lock().await.get(&id).cloned()?;
        Some(self.snapshot(&handle).await)
    }

    /// Progression de tous les torrents gérés.
    pub async fn list(&self) -> Vec<TorrentProgress> {
        let handles: Vec<Arc<ManagedTorrent>> =
            self.handles.lock().await.values().cloned().collect();
        let mut out = Vec::with_capacity(handles.len());
        for h in handles {
            out.push(self.snapshot(&h).await);
        }
        out
    }

    /// Attend la fin d'un torrent (utile pour un seeding/attente explicite).
    pub async fn wait_until_completed(&self, id: usize) -> Result<()> {
        let handle = self.handles.lock().await.get(&id).cloned();
        if let Some(h) = handle {
            h.wait_until_completed().await?;
        }
        Ok(())
    }

    async fn snapshot(&self, handle: &Arc<ManagedTorrent>) -> TorrentProgress {
        let id = handle.id();
        let stats = handle.stats();

        // Débits et pairs fournis directement par le moteur (fiables).
        let (speed_bps, up_speed_bps, peers_live, peers_seen) = match &stats.live {
            Some(l) => (
                l.download_speed.as_bytes() as f64,
                l.upload_speed.as_bytes() as f64,
                l.snapshot.peer_stats.live,
                l.snapshot.peer_stats.seen,
            ),
            None => (0.0, 0.0, 0, 0),
        };

        // Détail par fichier (nom, taille, progression) — façon uTorrent.
        // `with_metadata` échoue tant qu'un magnet n'a pas résolu ses métadonnées
        // (on renvoie alors une liste vide, sans planter).
        let files: Vec<TorrentFile> = handle
            .with_metadata(|m| {
                m.file_infos
                    .iter()
                    .enumerate()
                    .map(|(i, fi)| TorrentFile {
                        name: fi.relative_filename.to_string_lossy().to_string(),
                        len: fi.len,
                        downloaded: stats.file_progress.get(i).copied().unwrap_or(0),
                    })
                    .collect::<Vec<TorrentFile>>()
            })
            .unwrap_or_default();

        TorrentProgress {
            id,
            info_hash: format!("{:?}", handle.info_hash()),
            name: handle.name().unwrap_or_else(|| "torrent".to_string()),
            downloaded: stats.progress_bytes,
            total: stats.total_bytes,
            uploaded: stats.uploaded_bytes,
            speed_bps,
            up_speed_bps,
            peers_live,
            peers_seen,
            files,
            finished: stats.finished,
            paused: handle.is_paused(),
            state: format!("{:?}", stats.state),
            error: stats.error,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Options « hors-ligne » : aucun socket réseau n'est lié (pour la CI/bac à sable).
    fn offline_opts() -> SessionOptions {
        SessionOptions {
            dht: None,
            listen: None,
            persistence: None,
            disable_trackers: true,
            disable_local_service_discovery: true,
            ..Default::default()
        }
    }

    // Vérifie que la session se crée et que la liste est vide au départ.
    //
    // `#[ignore]` : librqbit lie toujours au moins un socket UDP (client tracker
    // UDP), interdit dans ce bac à sables CI (os error 97). Sur une vraie machine :
    //   cargo test -p raketa-torrent -- --ignored
    #[ignore = "nécessite la création de sockets UDP (indisponible en CI/bac à sable)"]
    #[tokio::test]
    async fn cree_une_session_vide() {
        let dir = tempfile::tempdir().unwrap();
        let mgr = TorrentManager::new_with_opts(dir.path().to_path_buf(), offline_opts())
            .await
            .expect("session créée");
        assert!(mgr.list().await.is_empty());
    }
}
