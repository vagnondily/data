import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDownload,
  listDownloads,
  listTorrents,
  onClipboardUrl,
  onProgress,
  onTorrentProgress,
  type DownloadDto,
  type Progress,
  type TorrentProgress,
} from "./lib/api";
import { Stats } from "./features/dashboard/Stats";
import { AddDownload } from "./features/downloads/AddDownload";
import { DownloadList } from "./features/downloads/DownloadList";
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
  }, [refresh, refreshTorrents]);

  // Progression des téléchargements HTTP.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onProgress((p: Progress) => applyProgress(p))
      .then((fn) => (unlisten = fn))
      .catch(() => {});

    function applyProgress(p: Progress) {
      setSpeeds((prev) => ({ ...prev, [p.download_id]: p.speed_bps }));
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

      <main className="app-main">
        {tab === "http" && (
          <>
            <Stats downloads={downloads} speeds={speeds} />
            <AddDownload onAdded={refresh} />
            <DownloadList downloads={downloads} speeds={speeds} onChanged={refresh} />
          </>
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

      <footer className="app-footer">
        <span>RAKETA v0.4 — multi-segments · torrents · navigateur · file d'attente · limiteur</span>
      </footer>
    </div>
  );
}
