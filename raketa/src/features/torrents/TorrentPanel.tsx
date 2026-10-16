import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addTorrent,
  addTorrentFile,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
  type TorrentProgress,
} from "../../lib/api";
import { formatBytes, formatSpeed, percent } from "../../lib/format";

interface Props {
  torrents: TorrentProgress[];
  onChanged: () => void;
}

// Panneau torrents : ajout par magnet/URL ou fichier .torrent, liste et actions.
export function TorrentPanel({ torrents, onChanged }: Props) {
  const [magnet, setMagnet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitMagnet() {
    const url = magnet.trim();
    if (!url) return;
    try {
      setBusy(true);
      setError(null);
      await addTorrent(url);
      setMagnet("");
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Torrent", extensions: ["torrent"] }],
    });
    if (typeof selected === "string") {
      try {
        setBusy(true);
        setError(null);
        await addTorrentFile(selected);
        onChanged();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <section className="add-panel" aria-label="Torrents">
      <div className="add-row">
        <input
          type="text"
          className="input url-input"
          placeholder="Collez un lien magnet:?xt=… ou une URL .torrent"
          value={magnet}
          onChange={(e) => setMagnet(e.target.value)}
          aria-label="Lien magnet ou URL torrent"
        />
        <button className="btn ghost" onClick={pickFile} disabled={busy}>
          Fichier .torrent
        </button>
        <button className="btn primary" onClick={submitMagnet} disabled={busy}>
          Ajouter
        </button>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      {torrents.length > 0 && (
        <div className="dl-list" style={{ marginTop: 14 }}>
          {torrents.map((t) => {
            const pct = percent(t.downloaded, t.total);
            return (
              <div key={t.id} className={`dl-item ${t.finished ? "status-completed" : ""}`}>
                <div className="dl-main">
                  <div className="dl-head">
                    <span className="dl-name" title={t.name}>
                      🧲 {t.name}
                    </span>
                    <span className={`dl-status ${t.finished ? "pill-completed" : "pill-downloading"}`}>
                      {t.finished ? "Terminé" : t.paused ? "En pause" : t.state}
                    </span>
                  </div>
                  <div className="progress-track" role="progressbar" aria-valuenow={pct ?? 0}>
                    <div
                      className={`progress-fill ${pct === null ? "indeterminate" : ""}`}
                      style={pct !== null ? { width: `${pct}%` } : undefined}
                    />
                  </div>
                  <div className="dl-meta">
                    <span>
                      {formatBytes(t.downloaded)}
                      {t.total ? ` / ${formatBytes(t.total)}` : ""}
                      {pct !== null ? ` · ${pct}%` : ""}
                    </span>
                    {!t.finished && !t.paused && <span>⬇ {formatSpeed(t.speed_bps)}</span>}
                    <span>⬆ {formatBytes(t.uploaded)}</span>
                    {t.error && <span className="error-text">{t.error}</span>}
                  </div>
                </div>
                <div className="dl-actions">
                  {!t.finished &&
                    (t.paused ? (
                      <button className="btn tiny primary" onClick={() => resumeTorrent(t.id).then(onChanged)}>
                        Reprendre
                      </button>
                    ) : (
                      <button className="btn tiny" onClick={() => pauseTorrent(t.id).then(onChanged)}>
                        Pause
                      </button>
                    ))}
                  <button
                    className="btn tiny danger"
                    onClick={() => removeTorrent(t.id, false).then(onChanged)}
                    title="Retirer de la liste (garde les fichiers)"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
