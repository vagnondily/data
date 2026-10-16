//! Paramètres applicatifs persistés en base et appliqués au moteur à chaud.

use raketa_core::{Engine, Store};
use serde::{Deserialize, Serialize};

/// Préférences utilisateur de RAKETA.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Connexions parallèles par téléchargement (vitesse).
    pub connections: usize,
    /// Limite de débit globale en Ko/s (0 = illimité).
    pub speed_limit_kbps: u64,
    /// Dossier de destination par défaut.
    pub default_dir: String,
    /// Ranger automatiquement par catégorie (sous-dossier par type).
    pub auto_categorize: bool,
    /// Bloquer les popups dans le navigateur intégré.
    pub block_popups: bool,
    /// Surveiller le presse-papiers pour proposer les URLs copiées.
    pub clipboard_watch: bool,
}

impl Settings {
    pub fn defaults(default_dir: String) -> Self {
        Self {
            connections: 8,
            speed_limit_kbps: 0,
            default_dir,
            auto_categorize: false,
            block_popups: true,
            clipboard_watch: false,
        }
    }

    /// Charge les paramètres depuis la base (valeurs par défaut si absentes).
    pub fn load(store: &Store, default_dir: String) -> Self {
        let mut s = Self::defaults(default_dir);
        if let Ok(map) = store.all_settings() {
            if let Some(v) = map.get("connections").and_then(|v| v.parse().ok()) {
                s.connections = v;
            }
            if let Some(v) = map.get("speed_limit_kbps").and_then(|v| v.parse().ok()) {
                s.speed_limit_kbps = v;
            }
            if let Some(v) = map.get("default_dir") {
                if !v.is_empty() {
                    s.default_dir = v.clone();
                }
            }
            if let Some(v) = map.get("auto_categorize") {
                s.auto_categorize = v == "true";
            }
            if let Some(v) = map.get("block_popups") {
                s.block_popups = v == "true";
            }
            if let Some(v) = map.get("clipboard_watch") {
                s.clipboard_watch = v == "true";
            }
        }
        s
    }

    /// Persiste les paramètres en base.
    pub fn save(&self, store: &Store) -> Result<(), String> {
        let put = |k: &str, v: String| store.set_setting(k, &v).map_err(|e| e.to_string());
        put("connections", self.connections.to_string())?;
        put("speed_limit_kbps", self.speed_limit_kbps.to_string())?;
        put("default_dir", self.default_dir.clone())?;
        put("auto_categorize", self.auto_categorize.to_string())?;
        put("block_popups", self.block_popups.to_string())?;
        put("clipboard_watch", self.clipboard_watch.to_string())?;
        Ok(())
    }

    /// Applique les réglages de vitesse au moteur (à chaud).
    pub fn apply_to_engine(&self, engine: &Engine) {
        engine.set_connections(self.connections);
        engine.set_rate_limit(self.speed_limit_kbps.saturating_mul(1024));
    }
}
