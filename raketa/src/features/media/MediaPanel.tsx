import { useEffect, useState } from "react";
import {
  installFfmpeg,
  mediaCancel,
  mediaDownload,
  mediaProbe,
  onFfmpegProgress,
  openFile,
  revealInFolder,
  type FfmpegProgress,
  type MediaInfo,
  type MediaProgress,
} from "../../lib/api";
import { Icon } from "../../components/Icon";
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

function mediaPill(status: string): string {
  if (status === "completed") return "pill-completed";
  if (status === "error" || status === "cancelled") return "pill-error";
  return "pill-downloading";
}
function mediaLabel(status: string): string {
  return status === "completed"
    ? "Terminé"
    : status === "error"
      ? "Erreur"
      : status === "cancelled"
        ? "Annulé"
        : "Téléchargement";
}

// Panneau « Médias » : analyse une URL (YouTube, Vimeo, Dailymotion et ~1000
// autres sources) puis télécharge la qualité choisie via yt-dlp.
export function MediaPanel({ items, onStarted }: Props) {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [quality, setQuality] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const [ffmpegProg, setFfmpegProg] = useState<FfmpegProgress | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onFfmpegProgress((p) => setFfmpegProg(p))
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  async function addFfmpeg() {
    setFfmpegBusy(true);
    setError(null);
    setFfmpegProg({ downloaded: 0, total: null, phase: "download", message: null });
    try {
      await installFfmpeg();
      await analyse();
    } catch (e) {
      setError(String(e));
    } finally {
      setFfmpegBusy(false);
      setFfmpegProg(null);
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
    <section className="media-panel" aria-label="Téléchargeur de médias">
      <div className="add-panel">
        <div className="add-row">
          <input
            type="text"
            className="input url-input"
            placeholder="Collez un lien vidéo (YouTube, Vimeo, Dailymotion…)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyse()}
            aria-label="Lien de la vidéo"
          />
          <button className="btn primary" onClick={analyse} disabled={busy || !url.trim()}>
            <Icon name="youtube" size={16} /> {busy && !info ? "Analyse…" : "Analyser"}
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>

      {info && (
        <div className="media-card">
          {info.thumbnail ? (
            <img className="media-thumb" src={info.thumbnail} alt="" />
          ) : (
            <div className="media-thumb media-thumb-ph"><Icon name="film" size={28} /></div>
          )}
          <div className="media-meta">
            <h3 className="media-title">{info.title}</h3>
            <p className="media-sub">
              {info.uploader ?? "Source inconnue"}
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
                <Icon name="download" size={16} /> Télécharger
              </button>
            </div>
            {!info.ffmpeg && (
              <div className="media-ffmpeg">
                <p className="hint">
                  Qualité limitée à 720p (audio M4A). Installez ffmpeg pour le 1080p et
                  plus, et l'audio MP3.
                </p>
                {ffmpegBusy && ffmpegProg ? (
                  <div className="ffmpeg-progress">
                    <div className="progress-track">
                      <div
                        className={`progress-fill ${ffmpegProg.phase === "download" && ffmpegProg.total ? "" : "indeterminate"}`}
                        style={ffmpegProg.phase === "download" && ffmpegProg.total ? { width: `${Math.round((ffmpegProg.downloaded / ffmpegProg.total) * 100)}%` } : undefined}
                      />
                    </div>
                    <span className="hint">
                      {ffmpegProg.phase === "extract" ? "Extraction…" : ffmpegProg.phase === "done" ? "Terminé" : `Téléchargement de ffmpeg… ${formatBytes(ffmpegProg.downloaded)}${ffmpegProg.total ? " / " + formatBytes(ffmpegProg.total) : ""}`}
                    </span>
                  </div>
                ) : (
                  <button className="btn ghost tiny" onClick={addFfmpeg} disabled={ffmpegBusy}>
                    <Icon name="cpu" size={14} /> Installer ffmpeg (~80 Mo)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {items.length === 0 && !info ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="youtube" size={38} /></div>
          <p className="empty-title">Aucun média</p>
          <p className="empty-hint">Collez un lien vidéo puis cliquez sur « Analyser ».</p>
        </div>
      ) : (
        <div className="media-list">
          {items.map((m) => {
            const pct = percent(m.p.downloaded, m.p.total);
            const done = m.p.status === "completed";
            return (
              <div key={m.id} className={`media-row ${m.p.status}`}>
                {m.thumbnail ? (
                  <img className="media-row-thumb" src={m.thumbnail} alt="" />
                ) : (
                  <div className="media-row-thumb media-thumb-ph"><Icon name="film" size={18} /></div>
                )}
                <div className="media-row-body">
                  <div className="media-row-head">
                    <span className="media-row-title" title={m.title}>{m.title}</span>
                    <span className={`${mediaPill(m.p.status)} media-row-pill`}>{mediaLabel(m.p.status)}</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-fill ${done ? "completed" : m.p.status === "error" || m.p.status === "cancelled" ? "error" : ""}`}
                      style={{ width: `${done ? 100 : pct ?? 0}%` }}
                    />
                  </div>
                  <div className="media-row-stats">
                    {done ? (
                      <span>{formatBytes(m.p.downloaded)}</span>
                    ) : m.p.status === "error" ? (
                      <span className="err">{m.p.detail ?? "Échec du téléchargement"}</span>
                    ) : m.p.status === "cancelled" ? (
                      <span className="err">Annulé</span>
                    ) : (
                      <span>
                        {formatBytes(m.p.downloaded)}
                        {m.p.total ? ` / ${formatBytes(m.p.total)}` : ""} · {formatSpeed(m.p.speed_bps)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="media-row-actions">
                  {done && m.p.detail ? (
                    <>
                      <button className="btn tiny" onClick={() => openFile(m.p.detail!)}>
                        <Icon name="external" size={14} /> Ouvrir
                      </button>
                      <button className="btn tiny ghost" onClick={() => revealInFolder(m.p.detail!)}>
                        <Icon name="folder" size={14} />
                      </button>
                    </>
                  ) : m.p.status === "downloading" ? (
                    <button className="btn tiny danger" onClick={() => mediaCancel(m.id)}>
                      <Icon name="stop" size={14} /> Annuler
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="panel-note hint">
        RAKETA est un logiciel à usage général : ne téléchargez que des contenus
        auxquels vous avez droit.
      </p>
    </section>
  );
}
