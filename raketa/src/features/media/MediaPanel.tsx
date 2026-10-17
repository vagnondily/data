import { useState } from "react";
import {
  installFfmpeg,
  mediaCancel,
  mediaDownload,
  mediaProbe,
  openFile,
  revealInFolder,
  type MediaInfo,
  type MediaProgress,
} from "../../lib/api";
import { formatBytes, formatSpeed, percent } from "../../lib/format";

// Un média en cours/terminé, suivi côté App (survit aux changements d'onglet).
export interface MediaItem {
  id: string;
  title: string;
  thumbnail: string | null;
  p: MediaProgress;
}

interface Props {
  items: MediaItem[];
  onStarted: (item: MediaItem) => void;
}

function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  if (m < 60) return `${m}:${sec.toString().padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${(m % 60).toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

// Panneau « YouTube & médias » : analyse une URL puis télécharge la qualité
// choisie via yt-dlp (provisionné automatiquement au premier usage).
export function MediaPanel({ items, onStarted }: Props) {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [quality, setQuality] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegBusy, setFfmpegBusy] = useState(false);

  async function addFfmpeg() {
    setFfmpegBusy(true);
    setError(null);
    try {
      await installFfmpeg();
      // Relance l'analyse pour proposer les qualités HD / MP3.
      await analyse();
    } catch (e) {
      setError(String(e));
    } finally {
      setFfmpegBusy(false);
    }
  }

  async function analyse() {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const i = await mediaProbe(u);
      setInfo(i);
      setQuality(i.formats[0]?.quality ?? "auto");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const id = await mediaDownload(url.trim(), quality, "");
      onStarted({
        id,
        title: info.title,
        thumbnail: info.thumbnail,
        p: { id, downloaded: 0, total: null, speed_bps: 0, status: "downloading", detail: null },
      });
      setInfo(null);
      setUrl("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="media-panel" aria-label="Téléchargeur YouTube et médias">
      <div className="add-panel">
        <div className="add-row">
          <input
            type="text"
            className="input url-input"
            placeholder="Colle un lien YouTube, Vimeo, Dailymotion…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyse()}
            aria-label="Lien de la vidéo"
          />
          <button className="btn primary" onClick={analyse} disabled={busy || !url.trim()}>
            {busy && !info ? "Analyse…" : "Analyser"}
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>

      {info && (
        <div className="media-card">
          {info.thumbnail && (
            <img className="media-thumb" src={info.thumbnail} alt="" />
          )}
          <div className="media-meta">
            <h3 className="media-title">{info.title}</h3>
            <p className="media-sub">
              {info.uploader ?? "—"}
              {info.duration ? ` · ${fmtDuration(info.duration)}` : ""}
            </p>
            <div className="media-controls">
              <select
                className="input"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                aria-label="Qualité"
              >
                {info.formats.map((f) => (
                  <option key={f.quality} value={f.quality}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={start} disabled={busy}>
                Télécharger
              </button>
            </div>
            {!info.ffmpeg && (
              <p className="hint ffmpeg-hint">
                ⚙️ ffmpeg absent : qualité limitée à 720p et audio en M4A.{" "}
                <button className="btn ghost tiny" onClick={addFfmpeg} disabled={ffmpegBusy}>
                  {ffmpegBusy ? "Installation… (~80 Mo)" : "Installer ffmpeg (1080p+/MP3)"}
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="media-list">
        {items.length === 0 && !info && (
          <p className="empty-hint">
            Aucun média en cours. Colle un lien puis clique sur « Analyser ».
          </p>
        )}
        {items.map((m) => {
          const pct = percent(m.p.downloaded, m.p.total);
          const done = m.p.status === "completed";
          return (
            <div key={m.id} className={`media-row ${m.p.status}`}>
              {m.thumbnail && <img className="media-row-thumb" src={m.thumbnail} alt="" />}
              <div className="media-row-body">
                <div className="media-row-title" title={m.title}>{m.title}</div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${m.p.status}`}
                    style={{ width: `${done ? 100 : pct ?? 0}%` }}
                  />
                </div>
                <div className="media-row-stats">
                  {done ? (
                    <span className="ok">✓ Terminé · {formatBytes(m.p.downloaded)}</span>
                  ) : m.p.status === "error" ? (
                    <span className="err">{m.p.detail ?? "Erreur"}</span>
                  ) : m.p.status === "cancelled" ? (
                    <span className="err">Annulé</span>
                  ) : (
                    <span>
                      {formatBytes(m.p.downloaded)}
                      {m.p.total ? ` / ${formatBytes(m.p.total)}` : ""} ·{" "}
                      {formatSpeed(m.p.speed_bps)}
                    </span>
                  )}
                </div>
              </div>
              <div className="media-row-actions">
                {done && m.p.detail ? (
                  <>
                    <button className="btn tiny" onClick={() => openFile(m.p.detail!)}>
                      Ouvrir
                    </button>
                    <button className="btn tiny ghost" onClick={() => revealInFolder(m.p.detail!)}>
                      Dossier
                    </button>
                  </>
                ) : m.p.status === "downloading" ? (
                  <button className="btn tiny danger" onClick={() => mediaCancel(m.id)}>
                    Annuler
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="browser-note">
        <span className="hint">
          RAKETA est un téléchargeur généraliste : ne téléchargez que des contenus
          auxquels vous avez droit.
        </span>
      </p>
    </section>
  );
}
