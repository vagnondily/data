import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  checkUpdate,
  clearLog,
  downloadUpdate,
  firewallAuthorize,
  firewallStatus,
  getAppVersion,
  getSettings,
  installExtension,
  installFfmpeg,
  mediaToolsStatus,
  onFfmpegProgress,
  onUpdateProgress,
  openExternalUrl,
  openLog,
  parseCustomCategories,
  readLog,
  RELEASE_URL,
  runInstaller,
  setSettings,
  type FfmpegProgress,
  type FirewallStatus,
  type LogEntry,
  type Settings,
  type ToolsStatus,
  type UpdateInfo,
} from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { Icon } from "../../components/Icon";

interface CatRow {
  name: string;
  extsText: string;
}

type Section =
  | "general"
  | "transfers"
  | "scheduler"
  | "categories"
  | "tools"
  | "journal"
  | "updates"
  | "about";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "general", label: "Général", icon: "settings" },
  { key: "transfers", label: "Transferts", icon: "download" },
  { key: "scheduler", label: "Planificateur", icon: "clock" },
  { key: "categories", label: "Catégories", icon: "tag" },
  { key: "tools", label: "Outils", icon: "cpu" },
  { key: "journal", label: "Journal", icon: "file-text" },
  { key: "updates", label: "Mises à jour", icon: "rotate" },
  { key: "about", label: "À propos", icon: "info" },
];

// URL de signalement de problème (dépôt public des versions).
const ISSUES_URL = "https://github.com/vagnondily/raketa-releases/issues/new";

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

// Fenêtre de préférences flottante, organisée en sections. Se ferme avec
// Échap, le bouton de fermeture ou un clic sur le fond assombri.
export function SettingsModal({ onClose, onSaved }: Props) {
  const [s, setS] = useState<Settings | null>(null);
  const [cats, setCats] = useState<CatRow[]>([]);
  const [section, setSection] = useState<Section>("general");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");
  const [upd, setUpd] = useState<UpdateInfo | null | "checking" | "uptodate" | "error">(null);
  const [updMsg, setUpdMsg] = useState<string | null>(null);
  // Téléchargement de la mise à jour DANS l'app (comme la bannière principale).
  const [updDl, setUpdDl] = useState<"idle" | "downloading" | "ready" | "failed">("idle");
  const [updPct, setUpdPct] = useState(0);
  const [updPath, setUpdPath] = useState<string>("");

  async function startUpdateInApp(info: UpdateInfo) {
    setUpdDl("downloading");
    setUpdPct(0);
    setUpdMsg(null);
    let un: (() => void) | undefined;
    try {
      un = await onUpdateProgress((p) => {
        if (p.total) setUpdPct(Math.min(100, Math.round((p.downloaded / p.total) * 100)));
      });
      const path = await downloadUpdate(info.url, info.sha256);
      setUpdPath(path);
      setUpdPct(100);
      setUpdDl("ready");
    } catch (e) {
      const msg = String(e);
      setUpdDl("failed");
      // Échec d'intégrité : surtout ne pas rediriger vers le même installeur.
      if (/empreinte|intégrit/i.test(msg)) {
        setUpdMsg("Installeur refusé : il ne correspond pas à l'empreinte de sécurité. N'installez pas ce fichier.");
      } else {
        setUpdMsg(msg.replace(/^Error:\s*/, ""));
      }
    } finally {
      if (un) un();
    }
  }
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const [ffmpegProg, setFfmpegProg] = useState<FfmpegProgress | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [fw, setFw] = useState<FirewallStatus | null>(null);
  // Installation guidée de l'extension (téléchargement + décompression).
  const [extState, setExtState] = useState<"idle" | "working" | "ready" | "error">("idle");
  const [extPath, setExtPath] = useState<string>("");
  const [extErr, setExtErr] = useState<string>("");
  const [fwBusy, setFwBusy] = useState(false);

  const refreshLog = () => {
    readLog()
      .then((l) => setLog(l.slice().reverse()))
      .catch(() => {});
  };

  useEffect(() => {
    if (section === "journal") refreshLog();
  }, [section]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onFfmpegProgress((p) => setFfmpegProg(p))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

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
    getAppVersion().then(setVersion).catch(() => {});
    mediaToolsStatus().then(setTools).catch(() => {});
    firewallStatus().then(setFw).catch(() => {});
  }, []);

  async function doAuthorizeFirewall() {
    setFwBusy(true);
    try {
      await firewallAuthorize();
      const s = await firewallStatus();
      setFw(s);
    } catch {
      /* invite UAC refusée : on laisse l'utilisateur réessayer */
    } finally {
      setFwBusy(false);
    }
  }

  if (!s) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <p className="empty-hint" style={{ padding: 24 }}>
            {error ?? "Chargement des préférences…"}
          </p>
        </div>
      </div>
    );
  }

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setS({ ...s, [key]: value });
    setSaved(false);
  };

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

  async function doCheckUpdate() {
    setUpd("checking");
    setUpdMsg(null);
    try {
      // null → à jour ; objet → nouvelle version disponible.
      setUpd((await checkUpdate()) ?? "uptodate");
    } catch (e) {
      // Erreur réseau ou aucune version publiée : on ne prétend pas « à jour ».
      setUpd("error");
      setUpdMsg(String(e).replace(/^Error:\s*/, ""));
    }
  }

  async function doInstallFfmpeg() {
    setFfmpegBusy(true);
    setError(null);
    setFfmpegProg({ downloaded: 0, total: null, phase: "download", message: null });
    try {
      await installFfmpeg();
      mediaToolsStatus().then(setTools).catch(() => {});
    } catch (e) {
      setError(String(e));
    } finally {
      setFfmpegBusy(false);
      setFfmpegProg(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Préférences">
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="settings-modal-head">
          <h2>Préférences</h2>
          <button className="icon-act" onClick={onClose} aria-label="Fermer">
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="settings-modal-body">
          <nav className="settings-nav">
            {SECTIONS.map((sec) => (
              <button
                key={sec.key}
                className={`settings-nav-item ${section === sec.key ? "active" : ""}`}
                onClick={() => setSection(sec.key)}
              >
                <Icon name={sec.icon} size={16} />
                <span>{sec.label}</span>
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {section === "general" && (
              <>
                <div className="setting-row">
                  <label>Dossier de téléchargement</label>
                  <button className="btn ghost" onClick={chooseFolder}>
                    <Icon name="folder" size={16} /> {s.default_dir || "Choisir…"}
                  </button>
                </div>
                <div className="setting-row">
                  <label>Classer automatiquement</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.auto_categorize} onChange={(e) => update("auto_categorize", e.target.checked)} />
                    <span className="hint">Ranger les fichiers par catégorie (Vidéos, Jeux…).</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Son de fin</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.completion_sound} onChange={(e) => update("completion_sound", e.target.checked)} />
                    <span className="hint">Émettre un signal sonore à la fin d'un téléchargement.</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Surveiller le presse-papiers</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.clipboard_watch} onChange={(e) => update("clipboard_watch", e.target.checked)} />
                    <span className="hint">Proposer d'ajouter les liens copiés automatiquement.</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Mode anti-popups agressif</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.block_popups} onChange={(e) => update("block_popups", e.target.checked)} />
                    <span className="hint">
                      Navigateur intégré : détourne les popups et réactive le clic droit.
                      Désactivé par défaut — peut gêner certains sites (connexions en
                      popup, applications web). À n'activer que si besoin.
                    </span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Réduire dans la zone de notification</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.minimize_to_tray} onChange={(e) => update("minimize_to_tray", e.target.checked)} />
                    <span className="hint">Fermer la fenêtre garde RAKETA actif près de l'horloge.</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Démarrer avec Windows</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.autostart} onChange={(e) => update("autostart", e.target.checked)} />
                    <span className="hint">Lancer RAKETA automatiquement à l'ouverture de session.</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Pare-feu Windows</label>
                  {fw?.allowed ? (
                    <span className="badge ok">Autorisé</span>
                  ) : (
                    <button className="btn ghost" onClick={doAuthorizeFirewall} disabled={fwBusy}>
                      <Icon name="shield" size={15} />{" "}
                      {fwBusy ? "Autorisation…" : "Autoriser RAKETA"}
                    </button>
                  )}
                  <span className="hint">
                    Autorise les connexions entrantes des pairs (meilleures vitesses torrent).
                    Une seule confirmation administrateur suffit.
                  </span>
                </div>
              </>
            )}

            {section === "transfers" && (
              <>
                <div className="setting-row">
                  <label>Connexions par téléchargement</label>
                  <input type="number" min={1} max={32} className="input small" value={s.connections} onChange={(e) => update("connections", Math.max(1, Number(e.target.value)))} />
                  <span className="hint">Davantage de connexions accélèrent le transfert. Recommandé : 8.</span>
                </div>
                <div className="setting-row">
                  <label>Téléchargements simultanés</label>
                  <input type="number" min={1} max={20} className="input small" value={s.max_simultaneous} onChange={(e) => update("max_simultaneous", Math.max(1, Number(e.target.value)))} />
                  <span className="hint">Les suivants patientent dans la file. Recommandé : 3.</span>
                </div>
                <div className="setting-row">
                  <label>Limite de vitesse</label>
                  <input type="number" min={0} className="input small" value={s.speed_limit_kbps} onChange={(e) => update("speed_limit_kbps", Math.max(0, Number(e.target.value)))} />
                  <span className="hint">En Ko/s. 0 = illimité.</span>
                </div>
              </>
            )}

            {section === "scheduler" && (
              <>
                <h3 className="settings-h">Planificateur</h3>
                <div className="setting-row">
                  <label>Activer</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.scheduler_enabled} onChange={(e) => update("scheduler_enabled", e.target.checked)} />
                    <span className="hint">Reprendre et suspendre la file à heures fixes.</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Reprendre la file à</label>
                  <input type="time" className="input small" value={s.start_time} disabled={!s.scheduler_enabled} onChange={(e) => update("start_time", e.target.value)} />
                  <span className="hint">Vide = jamais.</span>
                </div>
                <div className="setting-row">
                  <label>Suspendre la file à</label>
                  <input type="time" className="input small" value={s.stop_time} disabled={!s.scheduler_enabled} onChange={(e) => update("stop_time", e.target.value)} />
                  <span className="hint">Vide = jamais.</span>
                </div>
                <h3 className="settings-h">Limite de vitesse nocturne</h3>
                <div className="setting-row">
                  <label>Activer</label>
                  <label className="switch">
                    <input type="checkbox" checked={s.night_limit_enabled} onChange={(e) => update("night_limit_enabled", e.target.checked)} />
                    <span className="hint">Appliquer un débit réduit sur une plage horaire.</span>
                  </label>
                </div>
                <div className="setting-row">
                  <label>Débit nocturne</label>
                  <input type="number" min={0} className="input small" value={s.night_limit_kbps} disabled={!s.night_limit_enabled} onChange={(e) => update("night_limit_kbps", Math.max(0, Number(e.target.value)))} />
                  <span className="hint">En Ko/s. 0 = pleine vitesse.</span>
                </div>
                <div className="setting-row">
                  <label>Plage horaire</label>
                  <span className="time-range">
                    <input type="time" className="input small" value={s.night_start} disabled={!s.night_limit_enabled} onChange={(e) => update("night_start", e.target.value)} />
                    <span className="hint">→</span>
                    <input type="time" className="input small" value={s.night_end} disabled={!s.night_limit_enabled} onChange={(e) => update("night_end", e.target.value)} />
                  </span>
                </div>
              </>
            )}

            {section === "categories" && (
              <>
                <p className="hint">
                  Créez des catégories personnalisées (nom + extensions). Elles apparaissent
                  dans la barre latérale des téléchargements.
                </p>
                {cats.map((row, i) => (
                  <div className="setting-row cat-edit" key={i}>
                    <input type="text" className="input small" placeholder="Nom (ex. PS4)" value={row.name} onChange={(e) => { const next = [...cats]; next[i] = { ...row, name: e.target.value }; syncCats(next); }} />
                    <input type="text" className="input" placeholder="Extensions : pkg, iso, bin" value={row.extsText} onChange={(e) => { const next = [...cats]; next[i] = { ...row, extsText: e.target.value }; syncCats(next); }} />
                    <button className="btn ghost tiny danger" onClick={() => syncCats(cats.filter((_, j) => j !== i))}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}
                <button className="btn ghost" onClick={() => syncCats([...cats, { name: "", extsText: "" }])}>
                  <Icon name="plus" size={15} /> Ajouter une catégorie
                </button>
              </>
            )}

            {section === "tools" && (
              <>
                <div className="setting-row">
                  <label>ffmpeg</label>
                  {tools?.ffmpeg ? (
                    <span className="badge ok">Installé</span>
                  ) : (
                    <button className="btn ghost" onClick={doInstallFfmpeg} disabled={ffmpegBusy}>
                      {ffmpegBusy ? "Installation en cours…" : "Installer ffmpeg (~80 Mo)"}
                    </button>
                  )}
                  <span className="hint">Requis pour la vidéo 1080p et plus, et l'audio MP3.</span>
                </div>
                {ffmpegBusy && ffmpegProg && (
                  <div className="setting-row">
                    <div className="ffmpeg-progress">
                      <div className="progress-track">
                        <div className={`progress-fill ${ffmpegProg.phase === "download" && ffmpegProg.total ? "" : "indeterminate"}`} style={ffmpegProg.phase === "download" && ffmpegProg.total ? { width: `${Math.round((ffmpegProg.downloaded / ffmpegProg.total) * 100)}%` } : undefined} />
                      </div>
                      <span className="hint">
                        {ffmpegProg.phase === "extract" ? "Extraction…" : ffmpegProg.phase === "done" ? "Terminé" : `Téléchargement… ${formatBytes(ffmpegProg.downloaded)}${ffmpegProg.total ? " / " + formatBytes(ffmpegProg.total) : ""}`}
                      </span>
                    </div>
                  </div>
                )}
                <div className="setting-row">
                  <label>yt-dlp</label>
                  <span className={`badge ${tools?.yt_dlp ? "ok" : "warn"}`}>{tools?.yt_dlp ? "Installé" : "À l'usage"}</span>
                  <span className="hint">Installé automatiquement au premier téléchargement de média.</span>
                </div>
                <div className="setting-row">
                  <label>Extension navigateur</label>
                  <button
                    className="btn primary"
                    disabled={extState === "working"}
                    onClick={async () => {
                      setExtState("working");
                      setExtErr("");
                      try {
                        const p = await installExtension();
                        setExtPath(p);
                        setExtState("ready");
                      } catch (e) {
                        setExtErr(String(e));
                        setExtState("error");
                      }
                    }}
                  >
                    <Icon name="globe" size={15} />{" "}
                    {extState === "working" ? "Préparation…" : "Préparer l'extension (Chrome/Edge)"}
                  </button>
                  {extState === "ready" ? (
                    <div className="hint ext-steps">
                      <strong>Dossier prêt (ouvert dans l'explorateur) :</strong>
                      <code className="ext-path">{extPath}</code>
                      <ol>
                        <li>
                          Ouvrez <code>chrome://extensions</code> (ou{" "}
                          <code>edge://extensions</code>).
                        </li>
                        <li>Activez le « Mode développeur » (en haut à droite).</li>
                        <li>
                          Cliquez « Charger l'extension non empaquetée » et choisissez le dossier
                          ci-dessus.
                        </li>
                      </ol>
                      <button
                        className="btn tiny ghost"
                        onClick={() => {
                          navigator.clipboard?.writeText("chrome://extensions").catch(() => {});
                        }}
                      >
                        Copier « chrome://extensions »
                      </button>
                    </div>
                  ) : extState === "error" ? (
                    <span className="hint" style={{ color: "var(--danger, #e5484d)" }}>
                      {extErr} — vous pouvez aussi télécharger l'extension manuellement.{" "}
                      <button className="btn tiny ghost" onClick={() => openExternalUrl(RELEASE_URL)}>
                        Page des versions
                      </button>
                    </span>
                  ) : (
                    <span className="hint">
                      Télécharge et décompresse l'extension pour vous, puis ouvre le dossier à
                      charger. Elle ajoute le bouton « Télécharger cette vidéo » sur les pages et
                      capture les téléchargements. Alternative sans installation : le navigateur
                      intégré de RAKETA.
                    </span>
                  )}
                </div>
              </>
            )}

            {section === "journal" && (
              <>
                <div className="journal-head">
                  <span className="hint">
                    Événements et erreurs récents, utiles pour diagnostiquer un problème.
                  </span>
                  <div className="journal-actions">
                    <button className="btn ghost tiny" onClick={refreshLog}>
                      <Icon name="rotate" size={14} /> Actualiser
                    </button>
                    <button className="btn ghost tiny" onClick={() => openLog()}>
                      <Icon name="external" size={14} /> Ouvrir le fichier
                    </button>
                    <button
                      className="btn ghost tiny"
                      onClick={() => {
                        const text = log
                          .slice()
                          .reverse()
                          .map((e) => `${new Date(e.ts * 1000).toLocaleString()}\t${e.level}\t${e.message}`)
                          .join("\n");
                        navigator.clipboard.writeText(text).catch(() => {});
                      }}
                    >
                      <Icon name="clipboard" size={14} /> Copier
                    </button>
                    <button className="btn ghost tiny danger" onClick={() => clearLog().then(refreshLog)}>
                      <Icon name="trash" size={14} /> Effacer
                    </button>
                  </div>
                </div>
                <div className="journal-list">
                  {log.length === 0 ? (
                    <p className="empty-hint">Aucune entrée pour le moment.</p>
                  ) : (
                    log.map((e, i) => (
                      <div className={`journal-row lvl-${e.level.toLowerCase()}`} key={i}>
                        <span className="journal-ts">{new Date(e.ts * 1000).toLocaleString()}</span>
                        <span className="journal-lvl">{e.level}</span>
                        <span className="journal-msg" title={e.message}>{e.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {section === "updates" && (
              <>
                <div className="setting-row">
                  <label>Version installée</label>
                  <span className="badge">{version || "…"}</span>
                </div>
                <div className="setting-row">
                  <label>Rechercher des mises à jour</label>
                  <button className="btn ghost" onClick={doCheckUpdate}>Vérifier maintenant</button>
                  {upd === "checking" && <span className="hint">Vérification…</span>}
                  {upd === "uptodate" && <span className="badge ok">À jour</span>}
                  {upd === "error" && <span className="badge warn">Impossible de vérifier</span>}
                  {upd && typeof upd === "object" && <span className="badge warn">Nouvelle version : build {upd.build}</span>}
                </div>
                {upd === "error" && (
                  <p className="hint" style={{ marginTop: -4 }}>
                    {updMsg ?? "Vérification indisponible."} Vous pouvez télécharger la
                    dernière version manuellement ci-dessous.
                  </p>
                )}
                <div className="setting-row">
                  <label>Télécharger</label>
                  {upd && typeof upd === "object" ? (
                    updDl === "downloading" ? (
                      <span className="update-dl">
                        <span className="update-dl-bar">
                          <span className="update-dl-fill" style={{ width: `${updPct}%` }} />
                        </span>
                        {updPct}%
                      </span>
                    ) : updDl === "ready" ? (
                      <button className="btn primary" onClick={() => runInstaller(updPath)}>
                        <Icon name="check" size={14} /> Installer et redémarrer
                      </button>
                    ) : (
                      <button className="btn primary" onClick={() => startUpdateInApp(upd)}>
                        <Icon name="download" size={14} /> Télécharger dans RAKETA
                      </button>
                    )
                  ) : (
                    <button className="btn ghost" onClick={() => openExternalUrl(RELEASE_URL)}>Ouvrir la page des versions</button>
                  )}
                </div>
                {updDl === "failed" && updMsg && (
                  <p className="hint" style={{ marginTop: -4, color: "var(--danger, #e5484d)" }}>
                    {updMsg}
                  </p>
                )}
              </>
            )}

            {section === "about" && (
              <div className="about-box">
                <div className="about-brand">
                  <h3>RAKETA</h3>
                  <p className="hint">Gestionnaire de téléchargement — Smart Service Androy</p>
                  <p className="hint">Version {version || "…"}</p>
                </div>
                <p className="hint">
                  Téléchargement multi-connexions, torrents, médias (yt-dlp), navigateur
                  intégré et historique. Logiciel à usage général : ne téléchargez que des
                  contenus auxquels vous avez droit.
                </p>
                <div className="about-actions">
                  <button className="btn ghost" onClick={() => openExternalUrl(ISSUES_URL)}>
                    <Icon name="info" size={15} /> Signaler un problème
                  </button>
                  <button className="btn ghost" onClick={() => openExternalUrl(RELEASE_URL)}>
                    <Icon name="download" size={15} /> Page des versions
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="settings-modal-foot">
          {error && <span className="error-text">{error}</span>}
          {saved && <span className="badge ok">Enregistré</span>}
          <span className="settings-foot-spacer" />
          <button className="btn ghost" onClick={onClose}>Fermer</button>
          <button className="btn primary" onClick={save}>Enregistrer</button>
        </footer>
      </div>
    </div>
  );
}
