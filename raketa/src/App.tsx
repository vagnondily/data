import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDownload,
  checkUpdate,
  listDownloads,
  listTorrents,
  onClipboardUrl,
  onProgress,
  onTorrentProgress,
  openExternalUrl,
  type DownloadDto,
  type Progress,
  type SegmentInfo,
  type TorrentProgress,
  type UpdateInfo,
} from "./lib/api";
import { AddDownload } from "./features/downloads/AddDownload";
import { DownloadTable } from "./features/downloads/DownloadTable";
import { CategorySidebar } from "./features/downloads/CategorySidebar";
import { DownloadDetail } from "./features/downloads/DownloadDetail";
import { matchesCategory, type CatKey } from "./lib/category";
import { TorrentPanel } from "./features/torrents/TorrentPanel";
import { BrowserPanel } from "./features/browser/BrowserPanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import logoMark from "./assets/logo-mark.svg";

type Tab = "http" | "torrents" | "browser" | "settings";

export function App() {
  const [tab, setTab] = useState<Tab>("http");
  const [downloads, setDownloads] = useState<DownloadDto[]>([]);
  const [torrents, setTorrents] = useState<TorrentProgress[]>([]);
  const [speeds, setSpeeds] = useState<Record<string, number>>({});
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [category, setCategory] = useState<CatKey>("all");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  // Détail des segments (connexions) en direct, par identifiant.
  const [segments, setSegments] = useState<Record<string, SegmentInfo[]>>({});
  const downloadsRef = useRef<DownloadDto[]>([]);

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
    // Vérifie les mises à jour au démarrage (silencieux si à jour / hors ligne).
    checkUpdate()
      .then((u) => u && setUpdate(u))
      .catch(() => {});
  }, [refresh, refreshTorrents]);

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img className="brand-logo" src={logoMark} alt="RAKETA" />
          <div className="brand-text">
            <h1>RAKETA</h1>
            <p>Smart Service Androy · Gestionnaire de téléchargement</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          <button className={`tab ${tab === "http" ? "active" : ""}`} onClick={() => setTab("http")}>
            Téléchargements
          </button>
          <button className={`tab ${tab === "torrents" ? "active" : ""}`} onClick={() => setTab("torrents")}>
            Torrents
          </button>
          <button className={`tab ${tab === "browser" ? "active" : ""}`} onClick={() => setTab("browser")}>
            Navigateur
          </button>
          <button className={`tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
            Paramètres
          </button>
        </nav>
      </header>

      {update && (
        <div className="update-banner" role="status">
          <span>
            🚀 <strong>Nouvelle version disponible</strong> (build {update.build}) !
          </span>
          <div className="update-banner-actions">
            <button
              className="btn tiny primary"
              onClick={() => openExternalUrl(update.url)}
            >
              Télécharger
            </button>
            <button className="btn tiny" onClick={() => setUpdate(null)}>
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
            />
            <div className="dl-main">
              <AddDownload onAdded={refresh} />
              <DownloadTable
                downloads={downloads.filter((d) =>
                  matchesCategory(category, d.display_name, d.status),
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
        {tab === "browser" && <BrowserPanel />}
        {tab === "settings" && <SettingsPanel />}
      </main>

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
