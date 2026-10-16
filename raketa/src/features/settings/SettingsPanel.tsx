import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  getAppVersion,
  getSettings,
  openExternalUrl,
  RELEASE_URL,
  setSettings,
  type Settings,
} from "../../lib/api";

// Panneau Paramètres : vitesse, connexions, dossier, rangement, popups, presse-papiers.
export function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getSettings()
      .then(setS)
      .catch((e) => setError(String(e)));
    getAppVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  if (!s) {
    return (
      <section className="add-panel">
        <p className="empty-hint">{error ?? "Chargement des paramètres…"}</p>
      </section>
    );
  }

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS({ ...s, [key]: value });
    setSaved(false);
  };

  async function save() {
    if (!s) return;
    try {
      setError(null);
      await setSettings(s);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function chooseFolder() {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") update("default_dir", sel);
  }

  return (
    <section className="add-panel settings" aria-label="Paramètres">
      <div className="update-box">
        <div className="update-info">
          <strong>🚀 Mises à jour</strong>
          <span className="hint">Version installée : {version || "…"}</span>
        </div>
        <button className="btn primary" onClick={() => openExternalUrl(RELEASE_URL)}>
          Télécharger la dernière version
        </button>
      </div>

      <div className="setting-row">
        <label>Connexions par téléchargement</label>
        <input
          type="number"
          min={1}
          max={32}
          className="input small"
          value={s.connections}
          onChange={(e) => update("connections", Math.max(1, Number(e.target.value)))}
        />
        <span className="hint">Plus de connexions = plus rapide (8 recommandé).</span>
      </div>

      <div className="setting-row">
        <label>Téléchargements simultanés</label>
        <input
          type="number"
          min={1}
          max={20}
          className="input small"
          value={s.max_simultaneous}
          onChange={(e) => update("max_simultaneous", Math.max(1, Number(e.target.value)))}
        />
        <span className="hint">Les suivants attendent dans la file (3 recommandé).</span>
      </div>

      <div className="setting-row">
        <label>Limite de vitesse</label>
        <input
          type="number"
          min={0}
          className="input small"
          value={s.speed_limit_kbps}
          onChange={(e) => update("speed_limit_kbps", Math.max(0, Number(e.target.value)))}
        />
        <span className="hint">Ko/s · <strong>0 = illimité</strong>.</span>
      </div>

      <div className="setting-row">
        <label>Dossier par défaut</label>
        <button className="btn ghost" onClick={chooseFolder}>
          {s.default_dir ? s.default_dir : "Choisir…"}
        </button>
      </div>

      <div className="setting-row">
        <label>Rangement automatique</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.auto_categorize}
            onChange={(e) => update("auto_categorize", e.target.checked)}
          />
          <span className="hint">Classer par catégorie (Jeux, Vidéos, Musique…).</span>
        </label>
      </div>

      <div className="setting-row">
        <label>Bloquer les popups</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.block_popups}
            onChange={(e) => update("block_popups", e.target.checked)}
          />
          <span className="hint">Dans le navigateur intégré (anti-pubs intrusives).</span>
        </label>
      </div>

      <div className="setting-row">
        <label>Surveiller le presse-papiers</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.clipboard_watch}
            onChange={(e) => update("clipboard_watch", e.target.checked)}
          />
          <span className="hint">Proposer d'ajouter les liens copiés (façon IDM).</span>
        </label>
      </div>

      <div className="setting-actions">
        <button className="btn primary" onClick={save}>
          Enregistrer
        </button>
        {saved && <span className="badge ok">Enregistré ✓</span>}
        {error && <span className="error-text">{error}</span>}
      </div>
    </section>
  );
}
