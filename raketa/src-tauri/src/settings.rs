//! Paramètres applicatifs persistés en base et appliqués au moteur à chaud.

use raketa_core::{Engine, Store};
use serde::{Deserialize, Serialize};

/// Préférences utilisateur de RAKETA.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Connexions parallèles par téléchargement (vitesse).
    pub connections: usize,
    /// Nombre maximal de téléchargements simultanés (file d'attente).
    pub max_simultaneous: usize,
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
    /// Jouer un son à la fin d'un téléchargement.
    pub completion_sound: bool,
    /// Planificateur : suspendre/reprendre la file à heures fixes.
    pub scheduler_enabled: bool,
    /// Heure de reprise de la file (format « HH:MM », vide = jamais).
    pub start_time: String,
    /// Heure de suspension de la file (format « HH:MM », vide = jamais).
    pub stop_time: String,
    /// Limite de vitesse nocturne (fenêtre horaire dédiée).
    pub night_limit_enabled: bool,
    /// Débit nocturne en Ko/s (0 = illimité) appliqué dans la fenêtre.
    pub night_limit_kbps: u64,
    /// Début de la fenêtre nocturne (« HH:MM »).
    pub night_start: String,
    /// Fin de la fenêtre nocturne (« HH:MM »).
    pub night_end: String,
    /// Catégories personnalisées (JSON opaque géré par l'interface).
    pub custom_categories: String,
    /// Réduire dans la zone de notification au lieu de fermer.
    pub minimize_to_tray: bool,
    /// Démarrer RAKETA automatiquement avec Windows.
    pub autostart: bool,
    /// Garder la fenêtre au-dessus des autres (always-on-top), persistant.
    pub always_on_top: bool,
}

impl Settings {
    pub fn defaults(default_dir: String) -> Self {
        Self {
            connections: 8,
            max_simultaneous: 3,
            speed_limit_kbps: 0,
            default_dir,
            auto_categorize: false,
            // Mode « compatibilité agressif » (détourne les popups, réactive le
            // clic droit) : OFF par défaut car il casse certains sites (connexions
            // en popup, applications web). L'utilisateur l'active au besoin.
            block_popups: false,
            clipboard_watch: false,
            completion_sound: true,
            scheduler_enabled: false,
            start_time: String::new(),
            stop_time: String::new(),
            night_limit_enabled: false,
            night_limit_kbps: 0,
            night_start: "00:00".into(),
            night_end: "07:00".into(),
            custom_categories: "[]".into(),
            minimize_to_tray: true,
            autostart: false,
            always_on_top: false,
        }
    }

    /// Charge les paramètres depuis la base (valeurs par défaut si absentes).
    pub fn load(store: &Store, default_dir: String) -> Self {
        let mut s = Self::defaults(default_dir);
        if let Ok(map) = store.all_settings() {
            if let Some(v) = map.get("connections").and_then(|v| v.parse().ok()) {
                s.connections = v;
            }
            if let Some(v) = map.get("max_simultaneous").and_then(|v| v.parse().ok()) {
                s.max_simultaneous = v;
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
            if let Some(v) = map.get("completion_sound") {
                s.completion_sound = v == "true";
            }
            if let Some(v) = map.get("scheduler_enabled") {
                s.scheduler_enabled = v == "true";
            }
            if let Some(v) = map.get("start_time") {
                s.start_time = v.clone();
            }
            if let Some(v) = map.get("stop_time") {
                s.stop_time = v.clone();
            }
            if let Some(v) = map.get("night_limit_enabled") {
                s.night_limit_enabled = v == "true";
            }
            if let Some(v) = map.get("night_limit_kbps").and_then(|v| v.parse().ok()) {
                s.night_limit_kbps = v;
            }
            if let Some(v) = map.get("night_start") {
                if !v.is_empty() {
                    s.night_start = v.clone();
                }
            }
            if let Some(v) = map.get("night_end") {
                if !v.is_empty() {
                    s.night_end = v.clone();
                }
            }
            if let Some(v) = map.get("custom_categories") {
                if !v.is_empty() {
                    s.custom_categories = v.clone();
                }
            }
            if let Some(v) = map.get("minimize_to_tray") {
                s.minimize_to_tray = v == "true";
            }
            if let Some(v) = map.get("autostart") {
                s.autostart = v == "true";
            }
            if let Some(v) = map.get("always_on_top") {
                s.always_on_top = v == "true";
            }
        }
        s
    }

    /// Persiste les paramètres en base.
    pub fn save(&self, store: &Store) -> Result<(), String> {
        let put = |k: &str, v: String| store.set_setting(k, &v).map_err(|e| e.to_string());
        put("connections", self.connections.to_string())?;
        put("max_simultaneous", self.max_simultaneous.to_string())?;
        put("speed_limit_kbps", self.speed_limit_kbps.to_string())?;
        put("default_dir", self.default_dir.clone())?;
        put("auto_categorize", self.auto_categorize.to_string())?;
        put("block_popups", self.block_popups.to_string())?;
        put("clipboard_watch", self.clipboard_watch.to_string())?;
        put("completion_sound", self.completion_sound.to_string())?;
        put("scheduler_enabled", self.scheduler_enabled.to_string())?;
        put("start_time", self.start_time.clone())?;
        put("stop_time", self.stop_time.clone())?;
        put("night_limit_enabled", self.night_limit_enabled.to_string())?;
        put("night_limit_kbps", self.night_limit_kbps.to_string())?;
        put("night_start", self.night_start.clone())?;
        put("night_end", self.night_end.clone())?;
        put("custom_categories", self.custom_categories.clone())?;
        put("minimize_to_tray", self.minimize_to_tray.to_string())?;
        put("autostart", self.autostart.to_string())?;
        put("always_on_top", self.always_on_top.to_string())?;
        Ok(())
    }

    /// Applique les réglages de vitesse au moteur (à chaud).
    pub fn apply_to_engine(&self, engine: &Engine) {
        engine.set_connections(self.connections);
        engine.set_rate_limit(self.speed_limit_kbps.saturating_mul(1024));
    }
}
