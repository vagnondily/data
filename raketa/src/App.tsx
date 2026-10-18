import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDownload,
  addTorrent,
  checkUpdate,
  confirmDelete,
  downloadUpdate,
  getSettings,
  listDownloads,
  dockRight,
  onUpdateProgress,
  runInstaller,
  listTorrents,
  onClipboardUrl,
  onGrabbed,
  onMediaProgress,
  onProgress,
  onTorrentProgress,
  openExternalUrl,
  parseCustomCategories,
  pauseDownload,
  removeDownload,
  restoreWindow,
  resumeDownload,
  setAlwaysOnTop,
  setRateLimitLive,
  setSettings as persistSettings,
  type DownloadDto,
  type MediaProgress,
  type Progress,
  type SegmentInfo,
  type Settings,
  type TorrentProgress,
  type UpdateInfo,
} from "./lib/api";
import { AddDownload } from "./features/downloads/AddDownload";
import { DownloadMenu, type DlChoice } from "./features/downloads/DownloadMenu";
import { DownloadTable } from "./features/downloads/DownloadTable";
import { CategorySidebar } from "./features/downloads/CategorySidebar";
import { DownloadDetail } from "./features/downloads/DownloadDetail";
import { Toolbar } from "./features/downloads/Toolbar";
import { matchesCategory } from "./lib/category";
import { playCompletionSound } from "./lib/sound";
import { Icon } from "./components/Icon";
import { TorrentPanel } from "./features/torrents/TorrentPanel";
import { BrowserPanel } from "./features/browser/BrowserPanel";
import { MediaPanel, type MediaItem } from "./features/media/MediaPanel";
import { HistoryPanel } from "./features/history/HistoryPanel";
import { SettingsModal } from "./features/settings/SettingsModal";
import logoMark from "./assets/logo-mark.svg";

type Tab = "http" | "torrents" | "media" | "history" | "browser";

// Heure locale au format « HH:MM ».
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// « now » est-il dans la fenêtre [start, end) (gère le passage de minuit) ?
function withinWindow(now: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  const m = (t: string) => {
    const [h, mi] = t.split(":").map(Number);
    return (h || 0) * 60 + (mi || 0);
  };
  const [n, s, e] = [m(now), m(start), m(end)];
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

export function App() {
  const [tab, setTab] = useState<Tab>("http");
  const [downloads, setDownloads] = useState<DownloadDto[]>([]);
  const [torrents, setTorrents] = useState<TorrentProgress[]>([]);
  const [speeds, setSpeeds] = useState<Record<string, number>>({});
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  // Mise à jour dans l'app : état du téléchargement de l'installeur.
  const [updDl, setUpdDl] = useState<"idle" | "downloading" | "ready">("idle");
  const [updPct, setUpdPct] = useState(0);
  const [updPath, setUpdPath] = useState<string | null>(null);
  // Message d'échec de la mise à jour (ex. intégrité) affiché dans la bannière.
  const [updErr, setUpdErr] = useState<string | null>(null);
  // Téléchargements média (YouTube & co.) suivis globalement.
  const [media, setMedia] = useState<MediaItem[]>([]);
  // Détail des segments (connexions) en direct, par identifiant.
  const [segments, setSegments] = useState<Record<string, SegmentInfo[]>>({});
  // Préférences (planificateur, son, catégories perso…) chargées globalement.
  const [settings, setSettings] = useState<Settings | null>(null);
  // Ergonomie fenêtre : épinglée (au-dessus) et mode réduit (ancré à droite).
  const [pinned, setPinned] = useState(false);
  const [compact, setCompact] = useState(false);
  // Mode d'ajout (menu Téléchargement) : lien unique ou en masse.
  const [addMode, setAddMode] = useState<"single" | "batch">("single");
  // Fenêtre de préférences flottante.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Glisser-déposer un lien sur la fenêtre pour lancer un téléchargement.
  const [dragging, setDragging] = useState(false);
  const downloadsRef = useRef<DownloadDto[]>([]);
  const settingsRef = useRef<Settings | null>(null);
  settingsRef.current = settings;

  const customs = useMemo(
    () => (settings ? parseCustomCategories(settings.custom_categories) : []),
    [settings],
  );

  const loadSettings = useCallback(() => {
    getSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  // Joue le son de fin si l'option est active.
  const chime = useCallback(() => {
    if (settingsRef.current?.completion_sound) playCompletionSound();
  }, []);

  // Télécharge l'installeur de la mise à jour DANS l'app (barre de progression),
  // puis propose de l'installer. Repli sur le navigateur en cas d'échec.
  async function startUpdateDownload() {
    if (!update) return;
    setUpdDl("downloading");
    setUpdPct(0);
    setUpdErr(null);
    let un: (() => void) | undefined;
    try {
      un = await onUpdateProgress((p) => {
        if (p.total) setUpdPct(Math.min(100, Math.round((p.downloaded / p.total) * 100)));
      });
      const path = await downloadUpdate(update.url, update.sha256);
      setUpdPath(path);
      setUpdPct(100);
      setUpdDl("ready");
    } catch (e) {
      setUpdDl("idle");
      const msg = String(e);
      // Échec d'intégrité : NE PAS rediriger vers le navigateur — l'installeur
      // servi là serait tout aussi altéré. On prévient clairement, sans repli.
      if (/empreinte|intégrit/i.test(msg)) {
        setUpdErr(
          "Installeur refusé : il ne correspond pas à l'empreinte de sécurité publiée. Réessayez ; si cela persiste, n'installez pas ce fichier.",
        );
      } else if (update) {
        // Échec réseau/téléchargement : repli sur le navigateur (manuel).
        openExternalUrl(update.url);
      }
    } finally {
      if (un) un();
    }
  }

  async function installUpdate() {
    if (updPath) {
      try {
        await runInstaller(updPath);
      } catch {
        /* l'app se ferme normalement juste après */
      }
    }
  }

  // Épingler la fenêtre au-dessus des autres. Le choix est PERSISTANT : on le
  // mémorise dans les préférences pour qu'il survive au redémarrage (c'est la
  // demande « activer always-on-top »).
  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    try {
      await setAlwaysOnTop(next);
    } catch {
      /* hors Tauri */
    }
    const s = settingsRef.current;
    if (s && s.always_on_top !== next) {
      const updated = { ...s, always_on_top: next };
      setSettings(updated);
      persistSettings(updated).catch(() => {});
    }
  }

  // Sélection dans le menu Téléchargement (lien unique / en masse / médias / torrents).
  function selectDownload(c: DlChoice) {
    if (c === "media") setTab("media");
    else if (c === "torrents") setTab("torrents");
    else {
      setAddMode(c);
      setTab("http");
    }
  }

  // Mode réduit : fenêtre étroite ancrée à droite (pour coller des liens), ou
  // retour à la taille normale.
  async function toggleCompact() {
    const next = !compact;
    setCompact(next);
    try {
      if (next) {
        await dockRight();
        setPinned(true);
      } else {
        await restoreWindow();
        // Revient à la préférence persistante d'épinglage (et non toujours OFF).
        const keep = settingsRef.current?.always_on_top ?? false;
        setPinned(keep);
        await setAlwaysOnTop(keep).catch(() => {});
      }
    } catch {
      /* hors Tauri */
    }
  }

  const refresh = useCallback(async () => {
    try {
      const list = await listDownloads();
      downloadsRef.current = list;
      setDownloads(list);
    } catch {
      /* hors Tauri */
    }
  }, []);

  const refreshTorrents = useCallback(async () => {
    try {
      setTorrents(await listTorrents());
    } catch {
      /* hors Tauri */
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshTorrents();
    loadSettings();
    // Vérifie les mises à jour au démarrage (silencieux si à jour / hors ligne).
    checkUpdate()
      .then((u) => u && setUpdate(u))
      .catch(() => {});
  }, [refresh, refreshTorrents, loadSettings]);

  // Restaure « toujours au-dessus » au chargement des préférences (persistant).
  useEffect(() => {
    if (!settings) return;
    setPinned(settings.always_on_top);
    setAlwaysOnTop(settings.always_on_top).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.always_on_top]);

  // Planificateur horaire (façon IDM) : suspend/reprend la file et applique la
  // limite de vitesse nocturne. La fenêtre de l'app étant ouverte tant que des
  // téléchargements tournent, l'horloge vit côté interface.
  useEffect(() => {
    if (!settings) return;
    let nightOn = false;

    const pauseAllNow = async () => {
      const list = await listDownloads().catch(() => [] as DownloadDto[]);
      await Promise.all(
        list
          .filter((d) => d.status === "downloading")
          .map((d) => pauseDownload(d.id).catch(() => {})),
      );
      refresh();
    };
    const resumeAllNow = async () => {
      const list = await listDownloads().catch(() => [] as DownloadDto[]);
      await Promise.all(
        list
          .filter((d) => d.status === "paused")
          .map((d) => resumeDownload(d.id).catch(() => {})),
      );
      refresh();
    };

    const tick = () => {
      const s = settingsRef.current;
      if (!s) return;
      const now = hhmm(new Date());
      if (s.scheduler_enabled) {
        if (s.stop_time && now === s.stop_time) void pauseAllNow();
        if (s.start_time && now === s.start_time) void resumeAllNow();
      }
      if (s.night_limit_enabled) {
        const inWin = withinWindow(now, s.night_start, s.night_end);
        if (inWin && !nightOn) {
          nightOn = true;
          void setRateLimitLive(s.night_limit_kbps).catch(() => {});
        } else if (!inWin && nightOn) {
          nightOn = false;
          void setRateLimitLive(s.speed_limit_kbps).catch(() => {});
        }
      }
    };
    tick();
    const h = window.setInterval(tick, 20000);
    return () => window.clearInterval(h);
  }, [settings, refresh]);

  // Progression des téléchargements HTTP.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onProgress((p: Progress) => applyProgress(p))
      .then((fn) => (unlisten = fn))
      .catch(() => {});

    function applyProgress(p: Progress) {
      setSpeeds((prev) => ({ ...prev, [p.download_id]: p.speed_bps }));
      if (p.segments && p.segments.length > 0) {
        setSegments((prev) => ({ ...prev, [p.download_id]: p.segments! }));
      }
      // À la fin (terminé/erreur/annulé) : on efface les segments figés.
      if (p.status === "completed" || p.status === "error" || p.status === "cancelled") {
        setSegments((prev) => {
          if (!prev[p.download_id]) return prev;
          const next = { ...prev };
          delete next[p.download_id];
          return next;
        });
      }
      setDownloads((prev) => {
        const next = prev.map((d) =>
          d.id === p.download_id
            ? {
                ...d,
                downloaded_bytes: p.downloaded,
                total_bytes: p.total ?? d.total_bytes,
                status: p.status,
              }
            : d,
        );
        if (p.status === "completed" || p.status === "error") {
          void listDownloads().then(setDownloads).catch(() => {});
        }
        return next;
      });
      if (p.status === "completed") chime();
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Progression des torrents.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onTorrentProgress((list) => setTorrents(list))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Progression des téléchargements média (yt-dlp).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onMediaProgress((p: MediaProgress) => {
      setMedia((prev) => {
        // Upsert : si l'élément n'existe pas encore (grab dont l'événement
        // d'ajout est arrivé après), on le crée pour ne perdre aucune
        // progression. Le vrai titre (fourni par yt-dlp) remplace « Média ».
        if (prev.some((m) => m.id === p.id)) {
          return prev.map((m) =>
            m.id === p.id ? { ...m, p, title: p.title || m.title } : m,
          );
        }
        return [{ id: p.id, title: p.title || "Média", thumbnail: null, p }, ...prev];
      });
      if (p.status === "completed") chime();
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Récupération depuis une page (navigateur intégré ou extension) : affiche
  // aussitôt le transfert dans le bon onglet. La fenêtre est ramenée au premier
  // plan côté Rust.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onGrabbed((e) => {
      if (e.kind === "media" && e.id) {
        const id = e.id;
        setMedia((prev) => {
          const found = prev.find((m) => m.id === id);
          if (found) {
            return e.title ? prev.map((m) => (m.id === id ? { ...m, title: e.title! } : m)) : prev;
          }
          return [
            {
              id,
              title: e.title || "Média",
              thumbnail: null,
              p: { id, downloaded: 0, total: null, speed_bps: 0, percent: null, status: "downloading", title: null, detail: null },
            },
            ...prev,
          ];
        });
        setTab("media");
      } else if (e.kind === "torrent") {
        refreshTorrents();
        setTab("torrents");
      } else {
        refresh();
        setTab("http");
      }
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, [refresh, refreshTorrents]);

  // Glisser-déposer : déposer un lien (depuis un navigateur, un document…) sur
  // la fenêtre lance le téléchargement — pratique et sans connaissance technique.
  useEffect(() => {
    let depth = 0;
    const hasLink = (e: DragEvent) =>
      !!e.dataTransfer &&
      (e.dataTransfer.types.includes("text/uri-list") ||
        e.dataTransfer.types.includes("text/plain"));
    const onEnter = (e: DragEvent) => {
      if (!hasLink(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasLink(e)) e.preventDefault();
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      const raw = (dt.getData("text/uri-list") || dt.getData("text/plain") || "").trim();
      const links = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      let added = false;
      for (const u of links) {
        if (/^magnet:/i.test(u)) {
          addTorrent(u).then(refreshTorrents).catch(() => {});
          setTab("torrents");
          added = true;
        } else if (/^https?:\/\//i.test(u)) {
          addDownload({ url: u, destDir: "" }).then(refresh).catch(() => {});
          setTab("http");
          added = true;
        }
      }
      void added;
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [refresh, refreshTorrents]);

  // Capture presse-papiers : propose le lien copié (façon IDM).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onClipboardUrl((url) => setClipUrl(url))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  async function grabClipboard() {
    if (!clipUrl) return;
    try {
      await addDownload({ url: clipUrl, destDir: "" });
      setClipUrl(null);
      setTab("http");
      refresh();
    } catch {
      setClipUrl(null);
    }
  }

  // --- Actions globales de la barre d'outils ---
  async function pasteAndDownload() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\//i.test(t)) {
        await addDownload({ url: t, destDir: "" });
        refresh();
      }
    } catch {
      /* presse-papiers refusé */
    }
  }
  const bulk = (pred: (d: DownloadDto) => boolean, fn: (id: string) => Promise<void>) =>
    Promise.all(downloads.filter(pred).map((d) => fn(d.id).catch(() => {}))).then(refresh);
  const resumeAll = () => bulk((d) => d.status === "paused", (id) => resumeDownload(id));
  const pauseAll = () => bulk((d) => d.status === "downloading", (id) => pauseDownload(id));
  const clearCompleted = async () => {
    if (!(await confirmDelete("Retirer tous les téléchargements terminés de la liste ? (les fichiers sont conservés)"))) return;
    bulk((d) => d.status === "completed", (id) => removeDownload(id, false));
  };
  const clearAll = async () => {
    if (!(await confirmDelete("Retirer TOUS les téléchargements de la liste ? (les fichiers sont conservés)"))) return;
    bulk(() => true, (id) => removeDownload(id, false));
  };

  const counts = {
    active: downloads.filter((d) => d.status === "downloading").length,
    paused: downloads.filter((d) => d.status === "paused").length,
    completed: downloads.filter((d) => d.status === "completed").length,
    total: downloads.length,
  };

  return (
    <div className="app">
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <Icon name="download" size={40} />
            <p>Déposez le lien pour télécharger avec RAKETA</p>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <img className="brand-logo" src={logoMark} alt="RAKETA" />
          <div className="brand-text">
            <h1>RAKE<span className="brand-accent">T</span>A</h1>
            <p>Smart Service Androy · Gestionnaire de téléchargement</p>
          </div>
        </div>
        <div className="header-right">
          <DownloadMenu
            active={
              tab === "media"
                ? "media"
                : tab === "torrents"
                  ? "torrents"
                  : addMode === "batch"
                    ? "batch"
                    : "single"
            }
            highlighted={tab === "http" || tab === "media" || tab === "torrents"}
            onSelect={selectDownload}
          />
          <div className="tool-group" aria-label="Outils">
            <button
              className={`win-btn ${tab === "history" ? "active" : ""}`}
              onClick={() => setTab("history")}
              title="Historique"
              aria-pressed={tab === "history"}
            >
              <Icon name="clock" size={17} />
            </button>
            <button
              className={`win-btn ${tab === "browser" ? "active" : ""}`}
              onClick={() => setTab("browser")}
              title="Navigateur intégré"
              aria-pressed={tab === "browser"}
            >
              <Icon name="globe" size={17} />
            </button>
            <button
              className={`win-btn ${settingsOpen ? "active" : ""}`}
              onClick={() => setSettingsOpen(true)}
              title="Préférences"
              aria-pressed={settingsOpen}
            >
              <Icon name="settings" size={17} />
            </button>
          </div>
          <div className="win-controls">
            <button
              className={`win-btn ${pinned ? "active" : ""}`}
              onClick={togglePin}
              title={pinned ? "Ne plus épingler" : "Épingler au-dessus des autres fenêtres"}
              aria-pressed={pinned}
            >
              <Icon name="pin" size={16} />
            </button>
            <button
              className={`win-btn ${compact ? "active" : ""}`}
              onClick={toggleCompact}
              title={compact ? "Revenir à la fenêtre normale" : "Mode réduit (ancré à droite de l'écran)"}
              aria-pressed={compact}
            >
              <Icon name={compact ? "maximize" : "panel-right"} size={16} />
            </button>
          </div>
        </div>
      </header>

      {update && (
        <div className="update-banner" role="status">
          <span className="update-banner-icon">
            <Icon name="download" size={16} />
          </span>
          <span className="update-banner-text">
            <strong>Nouvelle version disponible</strong>
            <span className="update-banner-sub" style={updErr ? { color: "var(--danger, #e5484d)" } : undefined}>
              {updErr ?? `Build ${update.build} — réinstallez pour les dernières améliorations.`}
            </span>
          </span>
          <div className="update-banner-actions">
            {updDl === "idle" && (
              <button className="btn tiny primary" onClick={startUpdateDownload}>
                <Icon name="download" size={14} /> Télécharger
              </button>
            )}
            {updDl === "downloading" && (
              <span className="update-dl">
                <span className="update-dl-bar">
                  <span className="update-dl-fill" style={{ width: `${updPct}%` }} />
                </span>
                {updPct}%
              </span>
            )}
            {updDl === "ready" && (
              <button className="btn tiny primary" onClick={installUpdate}>
                <Icon name="check" size={14} /> Installer et redémarrer
              </button>
            )}
            <button className="btn tiny ghost" onClick={() => setUpdate(null)}>
              Plus tard
            </button>
          </div>
        </div>
      )}

      <main className="app-main">
        {tab === "http" && (
          <div className="dl-layout">
            <CategorySidebar
              downloads={downloads}
              selected={category}
              onSelect={setCategory}
              customs={customs}
            />
            <div className="dl-main">
              <Toolbar
                counts={counts}
                onPaste={pasteAndDownload}
                onResumeAll={resumeAll}
                onPauseAll={pauseAll}
                onClearCompleted={clearCompleted}
                onClearAll={clearAll}
                onSettings={() => setSettingsOpen(true)}
              />
              <AddDownload onAdded={refresh} mode={addMode} onModeChange={setAddMode} />
              <DownloadTable
                downloads={downloads.filter((d) =>
                  matchesCategory(category, d.display_name, d.status, customs),
                )}
                speeds={speeds}
                onChanged={refresh}
                onOpenDetail={(d) => setDetailId(d.id)}
              />
            </div>
          </div>
        )}
        {tab === "torrents" && (
          <TorrentPanel torrents={torrents} onChanged={refreshTorrents} />
        )}
        {tab === "media" && (
          <MediaPanel
            items={media}
            onStarted={(item) => setMedia((prev) => [item, ...prev])}
            onDismiss={(id) => setMedia((prev) => prev.filter((m) => m.id !== id))}
          />
        )}
        {tab === "history" && (
          <HistoryPanel
            onRedownloaded={() => {
              refresh();
              setTab("http");
            }}
          />
        )}
        {tab === "browser" && <BrowserPanel />}
      </main>

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={loadSettings}
        />
      )}

      {clipUrl && (
        <div className="toast" role="status">
          <span className="toast-text">
            Lien copié : <span className="toast-url">{clipUrl}</span>
          </span>
          <div className="toast-actions">
            <button className="btn tiny primary" onClick={grabClipboard}>
              Télécharger
            </button>
            <button className="btn tiny" onClick={() => setClipUrl(null)}>
              Ignorer
            </button>
          </div>
        </div>
      )}

      {detailId &&
        (() => {
          const d = downloads.find((x) => x.id === detailId);
          if (!d) return null;
          return (
            <DownloadDetail
              d={d}
              speed={speeds[d.id] ?? 0}
              segments={segments[d.id]}
              onClose={() => setDetailId(null)}
            />
          );
        })()}

      <footer className="app-footer">
        <span>RAKETA v0.4 — multi-segments · torrents · navigateur · file d'attente · limiteur</span>
      </footer>
    </div>
  );
}
