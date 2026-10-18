import { useEffect, useState } from "react";
import {
  installFfmpeg,
  mediaCancel,
  mediaDownload,
  mediaProbe,
  mediaPlaylistProbe,
  onFfmpegProgress,
  openFile,
  revealInFolder,
  type FfmpegProgress,
  type MediaInfo,
  type MediaProgress,
  type PlaylistInfo,
} from "../../lib/api";
import { Icon } from "../../components/Icon";
import { formatBytes, formatSpeed, percent } from "../../lib/format";

// Un média en cours/terminé, suivi côté App (survit aux changements d'onglet).
export interface MediaItem {
  id: string;
  title: string;
  thumbnail: string | null;
  p: MediaProgress;
  // Source du téléchargement : mémorisée pour pouvoir le relancer (« Réessayer »).
  // Absente pour les médias récupérés depuis le navigateur (on ne connaît pas
  // l'URL d'origine côté interface) : pas de bouton réessayer dans ce cas.
  url?: string;
  quality?: string;
}

interface Props {
  items: MediaItem[];
  onStarted: (item: MediaItem) => void;
  onDismiss: (id: string) => void;
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
        : status === "processing"
          ? "Finalisation"
          : status === "queued"
            ? "En file"
            : "Téléchargement";
}

// Panneau « Médias » : analyse une URL (YouTube, Vimeo, Dailymotion et ~1000
// autres sources) puis télécharge la qualité choisie via yt-dlp.
export function MediaPanel({ items, onStarted, onDismiss }: Props) {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [quality, setQuality] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ffmpegBusy, setFfmpegBusy] = useState(false);
  const [ffmpegProg, setFfmpegProg] = useState<FfmpegProgress | null>(null);
  const [mediaFilter, setMediaFilter] = useState<"all" | "active" | "completed" | "issues">("all");

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
    setPlaylist(null);
    setSelectedEntries([]);
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

  async function analysePlaylist() {
    const u = url.trim();
    if (!u) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    setPlaylist(null);
    setSelectedEntries([]);
    try {
      const p = await mediaPlaylistProbe(u);
      setPlaylist(p);
      setSelectedEntries(p.entries.filter((e) => e.available).map((e) => e.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleEntry(id: string) {
    setSelectedEntries((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  async function downloadSelected() {
    if (!playlist || selectedEntries.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = playlist.entries.filter((e) => selectedEntries.includes(e.id) && e.available);
      for (const entry of chosen) {
        const id = await mediaDownload(entry.url, quality, "");
        onStarted({
          id,
          title: entry.title,
          thumbnail: entry.thumbnail,
          url: entry.url,
          quality,
          p: { id, downloaded: 0, total: null, speed_bps: 0, percent: null, status: "queued", title: null, detail: null },
        });
      }
      setPlaylist(null);
      setSelectedEntries([]);
      setUrl("");
    } catch (e) {
      setError(`Certains éléments n'ont pas pu être ajoutés : ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!info) return;
    setBusy(true);
    setError(null);
    try {
      const u = url.trim();
      const id = await mediaDownload(u, quality, "");
      onStarted({
        id,
        title: info.title,
        thumbnail: info.thumbnail,
        url: u,
        quality,
        p: { id, downloaded: 0, total: null, speed_bps: 0, percent: null, status: "downloading", title: null, detail: null },
      });
      setInfo(null);
      setUrl("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  // Relance un média en échec/annulé avec la même source (nouvel identifiant) :
  // l'ancienne ligne est retirée pour éviter un doublon.
  async function retry(m: MediaItem) {
    if (!m.url) return;
    try {
      const id = await mediaDownload(m.url, m.quality ?? "auto", "");
      onStarted({
        id,
        title: m.title,
        thumbnail: m.thumbnail,
        url: m.url,
        quality: m.quality,
        p: { id, downloaded: 0, total: null, speed_bps: 0, percent: null, status: "downloading", title: null, detail: null },
      });
      onDismiss(m.id);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="media-panel" aria-label="Téléchargeur de médias">
      <header className="media-hero">
        <div className="media-hero-icon"><Icon name="download" size={23} /></div>
        <div className="media-hero-copy">
          <p className="media-eyebrow">CENTRE DE TÉLÉCHARGEMENT</p>
          <h2>Télécharger un média</h2>
          <p>Collez un lien, choisissez une vidéo ou importez une playlist. Vos téléchargements restent visibles ici.</p>
        </div>
      </header>
      <div className="add-panel media-add-panel">
        <div className="media-input-label"><span className="media-step">1</span><div><strong>Source du média</strong><small>URL d’une vidéo ou d’une playlist publique</small></div></div>
        <div className="add-row">
          <input
            type="text"
            className="input url-input"
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyse()}
            aria-label="Lien de la vidéo"
          />
          <button className="btn primary" onClick={analyse} disabled={busy || !url.trim()}>
            <Icon name="youtube" size={16} /> {busy && !playlist ? "Analyse…" : "Analyser la vidéo"}
          </button>
          <button className="btn" onClick={analysePlaylist} disabled={busy || !url.trim()} title="Lister les vidéos d'une playlist">
            <Icon name="layers" size={16} /> Analyser la playlist
          </button>
        </div>
        {error && <div className="media-error" role="alert"><Icon name="alert-circle" size={17} /><div><strong>Impossible de traiter ce lien</strong><p>{error}</p></div></div>}
      </div>

      {playlist && (
        <div className="media-card playlist-card">
          <div className="media-meta">
            <h3 className="media-title">{playlist.title}</h3>
            <p className="media-sub">{playlist.uploader ?? "Playlist YouTube"} · {playlist.entries.length} éléments · {selectedEntries.length} sélectionnés</p>
            <div className="media-controls">
              <select className="input" value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Qualité des vidéos sélectionnées">
                <option value="auto">Meilleure qualité</option>
                <option value="1080">1080p maximum</option>
                <option value="720">720p maximum</option>
                <option value="480">480p maximum</option>
                <option value="audio">Audio seul</option>
              </select>
              <button className="btn" onClick={() => setSelectedEntries(playlist.entries.filter((e) => e.available).map((e) => e.id))}>Tout sélectionner</button>
              <button className="btn ghost" onClick={() => setSelectedEntries([])}>Tout désélectionner</button>
              <button className="btn primary" onClick={downloadSelected} disabled={busy || selectedEntries.length === 0}>
                <Icon name="download" size={16} /> Ajouter {selectedEntries.length} au téléchargement
              </button>
            </div>
            <div className="playlist-entry-list">
              {playlist.entries.map((entry, index) => (
                <label className={`playlist-entry ${entry.available ? "" : "unavailable"}`} key={`${entry.id}-${index}`}>
                  <input type="checkbox" checked={selectedEntries.includes(entry.id)} disabled={!entry.available} onChange={() => toggleEntry(entry.id)} />
                  {entry.thumbnail ? <img src={entry.thumbnail} alt="" /> : <span className="playlist-entry-thumb"><Icon name="film" size={16} /></span>}
                  <span className="playlist-entry-title">{index + 1}. {entry.title}</span>
                  <span className="playlist-entry-duration">{entry.duration ? fmtDuration(entry.duration) : ""}</span>
                  {!entry.available && <span className="hint">Indisponible</span>}
                </label>
              ))}
            </div>
            <p className="hint">Les playlists Mix/RD peuvent changer au fil du temps. Les éléments indisponibles sont désactivés ; YouTube peut aussi limiter certaines vidéos.</p>
          </div>
        </div>
      )}

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

      {!info && !playlist && items.length === 0 ? (
        <div className="media-empty">
          <div className="media-empty-art"><Icon name="film" size={30} /></div>
          <div><h3>Votre file d’attente est vide</h3><p>Les vidéos en cours, terminées ou en erreur apparaîtront ici.</p></div>
          <span className="media-empty-step">2 · Suivi</span>
        </div>
      ) : null}

      {items.length > 0 && (
        <section className="media-queue" aria-label="File de téléchargements">
          <div className="media-queue-head">
            <div><p className="media-eyebrow">VOTRE ACTIVITÉ</p><h3>File de téléchargements <span>{items.length}</span></h3></div>
            <div className="media-queue-summary">
              <span className="queue-stat active"><i />{items.filter((m) => ["downloading", "queued", "processing"].includes(m.p.status)).length} en cours</span>
              <span className="queue-stat done"><i />{items.filter((m) => m.p.status === "completed").length} terminés</span>
              <span className="queue-stat failed"><i />{items.filter((m) => ["error", "cancelled"].includes(m.p.status)).length} à vérifier</span>
            </div>
          </div>
          <div className="media-filter-bar" role="group" aria-label="Filtrer les téléchargements">
            {([ ["all", "Tout"], ["active", "En cours"], ["completed", "Terminés"], ["issues", "Erreurs"] ] as const).map(([key, label]) => (
              <button key={key} className={`media-filter ${mediaFilter === key ? "selected" : ""}`} onClick={() => setMediaFilter(key)}>{label}<span>{items.filter((m) => key === "all" || (key === "active" ? ["downloading", "queued", "processing"].includes(m.p.status) : key === "completed" ? m.p.status === "completed" : ["error", "cancelled"].includes(m.p.status))).length}</span></button>
            ))}
            {items.some((m) => m.p.status === "completed") && <button className="media-clear-completed" onClick={() => items.filter((m) => m.p.status === "completed").forEach((m) => onDismiss(m.id))}>Effacer les terminés</button>}
          </div>
          <div className="media-list">
          {items.filter((m) => mediaFilter === "all" || (mediaFilter === "active" ? ["downloading", "queued", "processing"].includes(m.p.status) : mediaFilter === "completed" ? m.p.status === "completed" : ["error", "cancelled"].includes(m.p.status))).map((m) => {
            // Priorité au pourcentage de yt-dlp (avance même sans taille totale,
            // ex. flux fragmentés) ; repli sur le calcul octets si absent.
            const pct = m.p.percent ?? percent(m.p.downloaded, m.p.total);
            const done = m.p.status === "completed";
            const processing = m.p.status === "processing";
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
                      className={`progress-fill ${done ? "completed" : processing ? "indeterminate" : m.p.status === "error" || m.p.status === "cancelled" ? "error" : ""}`}
                      style={processing ? undefined : { width: `${done ? 100 : pct ?? 0}%` }}
                    />
                  </div>
                  <div className="media-row-stats">
                    {done ? (
                      <span>{formatBytes(m.p.downloaded)}</span>
                    ) : m.p.status === "error" ? (
                      <span className="err">{m.p.detail ?? "Échec du téléchargement"}</span>
                    ) : m.p.status === "cancelled" ? (
                      <span className="err">Annulé</span>
                    ) : processing ? (
                      <span>Finalisation (fusion vidéo + audio)…</span>
                    ) : (
                      <span>
                        {m.p.total
                          ? `${formatBytes(m.p.downloaded)} / ${formatBytes(m.p.total)}`
                          : m.p.percent != null
                            ? `${Math.round(m.p.percent)} %`
                            : formatBytes(m.p.downloaded)}
                        {m.p.speed_bps > 0 ? ` · ${formatSpeed(m.p.speed_bps)}` : ""}
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
                  ) : m.p.status === "downloading" || m.p.status === "queued" || processing ? (
                    <button className="btn tiny danger" onClick={() => mediaCancel(m.id)}>
                      <Icon name="stop" size={14} /> Annuler
                    </button>
                  ) : (m.p.status === "error" || m.p.status === "cancelled") ? (
                    <>
                      {m.url && (
                        <button className="btn tiny primary" onClick={() => retry(m)} title="Relancer le téléchargement">
                          <Icon name="rotate" size={14} /> Réessayer
                        </button>
                      )}
                      <button className="btn tiny ghost" onClick={() => onDismiss(m.id)} title="Retirer de la liste">
                        <Icon name="x" size={14} />
                      </button>
                    </>
                  ) : null}
                  {done && (
                    <button className="btn tiny ghost" onClick={() => onDismiss(m.id)} title="Retirer de la liste">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
          {items.filter((m) => mediaFilter === "all" || (mediaFilter === "active" ? ["downloading", "queued", "processing"].includes(m.p.status) : mediaFilter === "completed" ? m.p.status === "completed" : ["error", "cancelled"].includes(m.p.status))).length === 0 && <p className="media-filter-empty">Aucun téléchargement dans cette catégorie.</p>}
        </section>
      )}

      <p className="panel-note hint">
        RAKETA est un logiciel à usage général : ne téléchargez que des contenus
        auxquels vous avez droit.
      </p>
    </section>
  );
}
