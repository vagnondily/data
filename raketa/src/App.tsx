import { useCallback, useEffect, useRef, useState } from "react";
import {
  listDownloads,
  onProgress,
  type DownloadDto,
  type Progress,
} from "./lib/api";
import { Stats } from "./features/dashboard/Stats";
import { AddDownload } from "./features/downloads/AddDownload";
import { DownloadList } from "./features/downloads/DownloadList";

export function App() {
  const [downloads, setDownloads] = useState<DownloadDto[]>([]);
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

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Abonnement aux événements de progression du moteur.
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
        // Si un transfert vient de se terminer, on recharge pour récupérer le SHA.
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
      </header>

      <main className="app-main">
        <Stats downloads={downloads} speeds={speeds} />
        <AddDownload onAdded={refresh} />
        <DownloadList downloads={downloads} speeds={speeds} onChanged={refresh} />
      </main>

      <footer className="app-footer">
        <span>RAKETA v0.1 — MVP moteur · reprise · intégrité</span>
      </footer>
    </div>
  );
}
