import { useCallback, useEffect, useRef, useState } from "react";
import {
  listDownloads,
  listTorrents,
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

type Tab = "http" | "torrents";

export function App() {
  const [tab, setTab] = useState<Tab>("http");
  const [downloads, setDownloads] = useState<DownloadDto[]>([]);
  const [torrents, setTorrents] = useState<TorrentProgress[]>([]);
  // Débits instantanés par identifiant (non persistés).
  const [speeds, setSpeeds] = useState<Record<string, number>>({});
  const downloadsRef = useRef<DownloadDto[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await listDownloads();
      downloadsRef.current = list;
      setDownloads(list);
    } catch {
      // En dev web (hors Tauri), l'invocation échoue : on ignore silencieusement.
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
      .then((fn) => {
        unlisten = fn;
      })
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
          void listDownloads()
            .then((list) => setDownloads(list))
            .catch(() => {});
        }
        return next;
      });
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Progression des torrents (liste complète poussée périodiquement).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onTorrentProgress((list) => setTorrents(list))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">🚀</span>
          <div className="brand-text">
            <h1>RAKETA</h1>
            <p>Smart Service Androy · Gestionnaire de téléchargement</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          <button
            className={`tab ${tab === "http" ? "active" : ""}`}
            onClick={() => setTab("http")}
          >
            Téléchargements
          </button>
          <button
            className={`tab ${tab === "torrents" ? "active" : ""}`}
            onClick={() => setTab("torrents")}
          >
            Torrents
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === "http" ? (
          <>
            <Stats downloads={downloads} speeds={speeds} />
            <AddDownload onAdded={refresh} />
            <DownloadList downloads={downloads} speeds={speeds} onChanged={refresh} />
          </>
        ) : (
          <TorrentPanel torrents={torrents} onChanged={refreshTorrents} />
        )}
      </main>

      <footer className="app-footer">
        <span>RAKETA v0.2 — multi-segments · torrents · reprise · intégrité</span>
      </footer>
    </div>
  );
}
