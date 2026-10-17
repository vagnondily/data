import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  checkUpdate,
  getAppVersion,
  getSettings,
  installFfmpeg,
  mediaToolsStatus,
  onFfmpegProgress,
  openExternalUrl,
  parseCustomCategories,
  RELEASE_URL,
  setSettings,
  type FfmpegProgress,
  type Settings,
  type ToolsStatus,
  type UpdateInfo,
} from "../../lib/api";
import { formatBytes } from "../../lib/format";

// Ligne d'édition d'une catégorie personnalisée (extensions en texte).
interface CatRow {
  name: string;
  extsText: string;
}

interface Props {
  onSaved?: () => void;
}

// Panneau Paramètres : vitesse, file, dossier, planificateur, catégories,
// son de fin, outils média (ffmpeg) et mises à jour.
export function SettingsPanel({ onSaved }: Props) {
  const [s, setS] = useState<Settings | null>(null);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");
  const [upd, setUpd] = useState<UpdateInfo | null | "checking" | "uptodate">(null);
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const [ffmpegProg, setFfmpegProg] = useState<FfmpegProgress | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onFfmpegProgress((p) => setFfmpegProg(p))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  async function doCheckUpdate() {
    setUpd("checking");
    try {
      setUpd((await checkUpdate()) ?? "uptodate");
    } catch {
      setUpd("uptodate");
    }
  }

  function refreshTools() {
    mediaToolsStatus()
      .then(setTools)
      .catch(() => {});
  }

  useEffect(() => {
    getSettings()
      .then((v) => {
        setS(v);
        setCats(
          parseCustomCategories(v.custom_categories).map((c) => ({
            name: c.name,
            extsText: c.exts.join(", "),
          })),
        );
      })
      .catch((e) => setError(String(e)));
    getAppVersion()
      .then(setVersion)
      .catch(() => {});
    refreshTools();
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

  // Recompose le JSON des catégories perso à partir des lignes d'édition.
  function syncCats(rows: CatRow[]) {
    setCats(rows);
    const parsed = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        exts: r.extsText
          .split(/[,\s]+/)
          .map((e) => e.trim().toLowerCase().replace(/^\./, ""))
          .filter(Boolean),
      }));
    update("custom_categories", JSON.stringify(parsed));
  }

  async function save() {
    if (!s) return;
    try {
      setError(null);
      await setSettings(s);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(String(e));
    }
  }

  async function chooseFolder() {
    const sel = await open({ directory: true, multiple: false });
    if (typeof sel === "string") update("default_dir", sel);
  }

  async function doInstallFfmpeg() {
    setFfmpegBusy(true);
    setError(null);
    setFfmpegProg({ downloaded: 0, total: null, phase: "download", message: null });
    try {
      await installFfmpeg();
      refreshTools();
    } catch (e) {
      setError(String(e));
    } finally {
      setFfmpegBusy(false);
      setFfmpegProg(null);
    }
  }

  return (
    <section className="add-panel settings" aria-label="Paramètres">
      <div className="update-box">
        <div className="update-info">
          <strong>🚀 Mises à jour</strong>
          <span className="hint">Version installée : {version || "…"}</span>
          {upd === "checking" && <span className="hint">Vérification…</span>}
          {upd === "uptodate" && <span className="badge ok">Vous êtes à jour ✓</span>}
          {upd && typeof upd === "object" && (
            <span className="badge warn">Nouvelle version : build {upd.build}</span>
          )}
        </div>
        <div className="update-actions">
          <button className="btn ghost" onClick={doCheckUpdate}>
            Vérifier maintenant
          </button>
          {upd && typeof upd === "object" ? (
            <button className="btn primary" onClick={() => openExternalUrl(upd.url)}>
              Télécharger la mise à jour
            </button>
          ) : (
            <button className="btn primary" onClick={() => openExternalUrl(RELEASE_URL)}>
              Télécharger la dernière version
            </button>
          )}
        </div>
      </div>

      <h3 className="settings-h">Transferts</h3>

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

      <h3 className="settings-h">Planificateur</h3>

      <div className="setting-row">
        <label>Activer le planificateur</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.scheduler_enabled}
            onChange={(e) => update("scheduler_enabled", e.target.checked)}
          />
          <span className="hint">Reprend / suspend la file automatiquement.</span>
        </label>
      </div>
      <div className="setting-row">
        <label>Reprendre la file à</label>
        <input
          type="time"
          className="input small"
          value={s.start_time}
          disabled={!s.scheduler_enabled}
          onChange={(e) => update("start_time", e.target.value)}
        />
        <span className="hint">Ex. 02:00 (heures creuses). Vide = jamais.</span>
      </div>
      <div className="setting-row">
        <label>Suspendre la file à</label>
        <input
          type="time"
          className="input small"
          value={s.stop_time}
          disabled={!s.scheduler_enabled}
          onChange={(e) => update("stop_time", e.target.value)}
        />
        <span className="hint">Ex. 08:00. Vide = jamais.</span>
      </div>

      <h3 className="settings-h">Limite de vitesse nocturne</h3>
      <div className="setting-row">
        <label>Activer</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.night_limit_enabled}
            onChange={(e) => update("night_limit_enabled", e.target.checked)}
          />
          <span className="hint">Débit réduit sur une plage horaire.</span>
        </label>
      </div>
      <div className="setting-row">
        <label>Débit nocturne</label>
        <input
          type="number"
          min={0}
          className="input small"
          value={s.night_limit_kbps}
          disabled={!s.night_limit_enabled}
          onChange={(e) => update("night_limit_kbps", Math.max(0, Number(e.target.value)))}
        />
        <span className="hint">Ko/s · 0 = illimité (pleine vitesse la nuit).</span>
      </div>
      <div className="setting-row">
        <label>Plage</label>
        <span className="time-range">
          <input
            type="time"
            className="input small"
            value={s.night_start}
            disabled={!s.night_limit_enabled}
            onChange={(e) => update("night_start", e.target.value)}
          />
          <span className="hint">→</span>
          <input
            type="time"
            className="input small"
            value={s.night_end}
            disabled={!s.night_limit_enabled}
            onChange={(e) => update("night_end", e.target.value)}
          />
        </span>
      </div>

      <h3 className="settings-h">Catégories personnalisées</h3>
      <p className="hint">
        Ajoute tes propres catégories (nom + extensions) : elles apparaissent
        dans la barre latérale des téléchargements.
      </p>
      {cats.map((row, i) => (
        <div className="setting-row cat-edit" key={i}>
          <input
            type="text"
            className="input small"
            placeholder="Nom (ex. PS4)"
            value={row.name}
            onChange={(e) => {
              const next = [...cats];
              next[i] = { ...row, name: e.target.value };
              syncCats(next);
            }}
          />
          <input
            type="text"
            className="input"
            placeholder="Extensions : pkg, iso, bin"
            value={row.extsText}
            onChange={(e) => {
              const next = [...cats];
              next[i] = { ...row, extsText: e.target.value };
              syncCats(next);
            }}
          />
          <button
            className="btn ghost tiny danger"
            onClick={() => syncCats(cats.filter((_, j) => j !== i))}
          >
            Supprimer
          </button>
        </div>
      ))}
      <button
        className="btn ghost"
        onClick={() => syncCats([...cats, { name: "", extsText: "" }])}
      >
        + Ajouter une catégorie
      </button>

      <h3 className="settings-h">Notifications & outils</h3>
      <div className="setting-row">
        <label>Son de fin</label>
        <label className="switch">
          <input
            type="checkbox"
            checked={s.completion_sound}
            onChange={(e) => update("completion_sound", e.target.checked)}
          />
          <span className="hint">Petit carillon à la fin d'un téléchargement.</span>
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
      <div className="setting-row">
        <label>ffmpeg (vidéo HD / MP3)</label>
        {tools?.ffmpeg ? (
          <span className="badge ok">Installé ✓</span>
        ) : (
          <button className="btn ghost" onClick={doInstallFfmpeg} disabled={ffmpegBusy}>
            {ffmpegBusy ? "Installation en cours…" : "Installer ffmpeg (~80 Mo)"}
          </button>
        )}
        <span className="hint">Active le 1080p et plus, et l'audio MP3 dans l'onglet Médias.</span>
      </div>
      {ffmpegBusy && ffmpegProg && (
        <div className="setting-row ffmpeg-progress-row">
          <div className="ffmpeg-progress">
            <div className="progress-track">
              <div
                className={`progress-fill ${ffmpegProg.phase === "download" && ffmpegProg.total ? "" : "indeterminate"}`}
                style={
                  ffmpegProg.phase === "download" && ffmpegProg.total
                    ? { width: `${Math.round((ffmpegProg.downloaded / ffmpegProg.total) * 100)}%` }
                    : undefined
                }
              />
            </div>
            <span className="hint">
              {ffmpegProg.phase === "extract"
                ? "Extraction en cours…"
                : ffmpegProg.phase === "done"
                  ? "Terminé ✓"
                  : `Téléchargement… ${formatBytes(ffmpegProg.downloaded)}${ffmpegProg.total ? " / " + formatBytes(ffmpegProg.total) : ""}`}
            </span>
          </div>
        </div>
      )}

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
