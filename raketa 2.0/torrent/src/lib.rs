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
use librqbit::{
    AddTorrent, AddTorrentOptions, ManagedTorrent, Session, SessionOptions,
    SessionPersistenceConfig,
};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;
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
    /// Chemin du contenu sur le disque (dossier de sortie + nom du torrent) :
    /// le fichier pour un torrent mono-fichier, le dossier racine sinon. Sert
    /// aux actions « Ouvrir le fichier » / « Ouvrir le dossier ».
    pub content_path: String,
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
    /// Diagnostic de santé des sources, calculé automatiquement (vérificateur) :
    /// `checking` (recherche en cours), `healthy` (sources trouvées),
    /// `no_source` (aucun seeder — torrent probablement mort), `no_connection`
    /// (des pairs existent mais aucune connexion — souvent le pare-feu),
    /// `complete`, `paused`, `error`. Permet de dire clairement POURQUOI un
    /// torrent reste à 0 %, au lieu de laisser l'utilisateur dans le flou.
    pub health: String,
    pub error: Option<String>,
}

/// Torrent suivi : la poignée librqbit + l'instant d'ajout (base de temps du
/// vérificateur de santé), et le maximum de pairs jamais découverts (rend le
/// diagnostic STABLE : une fois des pairs vus, on ne repasse plus à « aucune
/// source » quand le compteur retombe à 0 → plus de clignotement du bouton).
struct Tracked {
    handle: Arc<ManagedTorrent>,
    added_at: Instant,
    seen_max: Arc<AtomicU32>,
}

/// Gestionnaire de torrents : encapsule une session librqbit.
pub struct TorrentManager {
    session: Arc<Session>,
    /// Torrents actifs, par identifiant interne.
    handles: Mutex<HashMap<usize, Tracked>>,
}

impl TorrentManager {
    /// Crée un gestionnaire dont les fichiers atterrissent dans `download_dir`.
    ///
    /// Le DHT, les trackers et l'écoute entrante sont actifs (configuration de
    /// production : indispensable pour les magnets et une bonne vitesse).
    pub async fn new(download_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&download_dir)?;
        // Persistance activée : la session mémorise les torrents ajoutés et les
        // restaure au prochain démarrage ; `fastresume` restaure rapidement
        // l'état des pièces déjà téléchargées. Sans cela, les torrents
        // « disparaissaient » à chaque redémarrage de RAKETA (dossier JSON
        // spécifique à l'OS, hors du dossier de téléchargement).
        let opts = SessionOptions {
            persistence: Some(SessionPersistenceConfig::Json { folder: None }),
            fastresume: true,
            ..Default::default()
        };
        let session = Session::new_with_opts(download_dir, opts).await?;
        let mgr = Self::from_session(session);
        mgr.adopt_persisted().await;
        Ok(mgr)
    }

    /// Enregistre dans notre table les torrents que la session a restaurés
    /// depuis la persistance au démarrage. Sans cela, ils tourneraient bien
    /// dans le moteur mais resteraient invisibles côté interface, car `list()`
    /// ne présente que les torrents présents dans `handles`.
    async fn adopt_persisted(&self) {
        let restored: Vec<Arc<ManagedTorrent>> = self
            .session
            .with_torrents(|it| it.map(|(_, h)| h.clone()).collect());
        let mut handles = self.handles.lock().await;
        for handle in restored {
            handles.entry(handle.id()).or_insert_with(|| Tracked {
                handle,
                added_at: Instant::now(),
                seen_max: Arc::new(AtomicU32::new(0)),
            });
        }
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
        self.handles.lock().await.insert(
            id,
            Tracked {
                handle,
                added_at: Instant::now(),
                seen_max: Arc::new(AtomicU32::new(0)),
            },
        );
        Ok(id)
    }

    /// Met un torrent en pause.
    pub async fn pause(&self, id: usize) -> Result<()> {
        if let Some(h) = self.handles.lock().await.get(&id).map(|t| t.handle.clone()) {
            self.session.pause(&h).await?;
        }
        Ok(())
    }

    /// Reprend un torrent en pause.
    pub async fn resume(&self, id: usize) -> Result<()> {
        if let Some(h) = self.handles.lock().await.get(&id).map(|t| t.handle.clone()) {
            self.session.unpause(&h).await?;
        }
        Ok(())
    }

    /// Supprime un torrent (et optionnellement ses fichiers).
    pub async fn remove(&self, id: usize, delete_files: bool) -> Result<()> {
        if let Some(t) = self.handles.lock().await.remove(&id) {
            self.session.delete(t.handle.info_hash().into(), delete_files).await?;
        }
        Ok(())
    }

    /// Progression d'un torrent, avec débit lissé calculé entre deux appels.
    pub async fn progress(&self, id: usize) -> Option<TorrentProgress> {
        let (handle, added_at, seen_max) = {
            let g = self.handles.lock().await;
            let t = g.get(&id)?;
            (t.handle.clone(), t.added_at, t.seen_max.clone())
        };
        Some(self.snapshot(&handle, added_at, &seen_max).await)
    }

    /// Progression de tous les torrents gérés.
    pub async fn list(&self) -> Vec<TorrentProgress> {
        let tracked: Vec<(Arc<ManagedTorrent>, Instant, Arc<AtomicU32>)> = self
            .handles
            .lock()
            .await
            .values()
            .map(|t| (t.handle.clone(), t.added_at, t.seen_max.clone()))
            .collect();
        let mut out = Vec::with_capacity(tracked.len());
        for (h, added_at, seen_max) in tracked {
            out.push(self.snapshot(&h, added_at, &seen_max).await);
        }
        out
    }

    /// Attend la fin d'un torrent (utile pour un seeding/attente explicite).
    pub async fn wait_until_completed(&self, id: usize) -> Result<()> {
        let handle = self.handles.lock().await.get(&id).map(|t| t.handle.clone());
        if let Some(h) = handle {
            h.wait_until_completed().await?;
        }
        Ok(())
    }

    async fn snapshot(
        &self,
        handle: &Arc<ManagedTorrent>,
        added_at: Instant,
        seen_max: &AtomicU32,
    ) -> TorrentProgress {
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

        // Vérificateur de santé des sources. On laisse une période de grâce au
        // démarrage (résolution des métadonnées d'un magnet, annonce aux
        // trackers/DHT) avant de conclure à l'absence de source.
        // Maximum de pairs jamais découverts (sticky) : évite de requalifier en
        // « aucune source » un torrent qui a déjà vu des pairs mais dont le
        // compteur retombe à 0 d'un tick à l'autre (cause du clignotement).
        let prev_max = seen_max.fetch_max(peers_seen, Ordering::Relaxed);
        let max_seen = prev_max.max(peers_seen);

        let paused = handle.is_paused();
        let elapsed = added_at.elapsed().as_secs();
        let health = if paused {
            "paused"
        } else if stats.error.is_some() {
            "error"
        } else if stats.finished {
            "complete"
        } else if peers_live > 0 || speed_bps > 0.0 {
            // Au moins un pair connecté ou des données qui arrivent : sain.
            "healthy"
        } else if elapsed < 30 {
            // Toujours en train de chercher : pas d'alarme prématurée.
            "checking"
        } else if max_seen == 0 {
            // Aucun pair jamais découvert via trackers/DHT ⇒ probablement mort.
            "no_source"
        } else {
            // Des pairs ont été vus mais aucune connexion ⇒ souvent le pare-feu
            // (ou un NAT/CGNAT côté opérateur qui bloque l'entrant).
            "no_connection"
        }
        .to_string();

        // `name` sert à l'affichage (repli « torrent » tant que les métadonnées
        // d'un magnet ne sont pas résolues). `content_path` reste VIDE dans ce cas :
        // sans le vrai nom, le chemin serait faux (dossier/« torrent » inexistant),
        // et l'UI masque les boutons Ouvrir/Dossier quand il est vide.
        let real_name = handle.name();
        let name = real_name.clone().unwrap_or_else(|| "torrent".to_string());
        let content_path = real_name
            .map(|n| handle.output_folder().join(n).to_string_lossy().to_string())
            .unwrap_or_default();

        TorrentProgress {
            id,
            info_hash: format!("{:?}", handle.info_hash()),
            name,
            content_path,
            downloaded: stats.progress_bytes,
            total: stats.total_bytes,
            uploaded: stats.uploaded_bytes,
            speed_bps,
            up_speed_bps,
            peers_live,
            peers_seen,
            files,
            finished: stats.finished,
            paused,
            state: format!("{:?}", stats.state),
            health,
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
