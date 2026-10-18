import { useMemo, useState } from "react";
import type { DownloadDto, TorrentProgress } from "../../lib/api";
import type { MediaItem } from "../media/MediaPanel";
import { Icon } from "../../components/Icon";
import { formatBytes, formatEta, formatSpeed, percent } from "../../lib/format";

interface Props {
  downloads: DownloadDto[];
  speeds: Record<string, number>;
  torrents: TorrentProgress[];
  media: MediaItem[];
}

// Bandeau « vue d'ensemble » global : agrège l'état de TOUS les transferts
// (HTTP + torrents + médias) en un seul coup d'œil, quel que soit l'onglet
// courant — débit combiné, progression globale, répartition par type et par
// statut. Repliable (mémorisé localement) pour ne pas gêner.
export function GlobalOverview({ downloads, speeds, torrents, media }: Props) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem("raketa.overview.collapsed") !== "1";
    } catch {
      return true;
    }
  });

  const a = useMemo(() => {
    let httpActive = 0;
    let httpSpeed = 0;
    let dlBytes = 0;
    let totBytes = 0;
    // La progression globale n'a de sens que si TOUTES les tailles actives sont
    // connues ; sinon on n'affiche pas de barre/pourcentage global (honnête).
    let knownTotal = true;
    let queued = 0;
    let paused = 0;
    let completed = 0;
    let errored = 0;

    for (const d of downloads) {
      if (d.status === "downloading" || d.status === "probing") {
        httpActive++;
        httpSpeed += speeds[d.id] ?? 0;
        dlBytes += d.downloaded_bytes;
        if (d.total_bytes) totBytes += d.total_bytes;
        else knownTotal = false;
      } else if (d.status === "queued") queued++;
      else if (d.status === "paused") paused++;
      else if (d.status === "completed") completed++;
      else if (d.status === "error") errored++;
    }

    let torrActive = 0;
    let torrSpeed = 0;
    let upSpeed = 0;
    for (const t of torrents) {
      upSpeed += t.up_speed_bps ?? 0;
      if (t.finished) completed++;
      else if (t.paused) paused++;
      else if (t.error) errored++;
      else {
        torrActive++;
        torrSpeed += t.speed_bps ?? 0;
        dlBytes += t.downloaded;
        if (t.total > 0) totBytes += t.total;
        else knownTotal = false;
      }
    }

    let medActive = 0;
    let medSpeed = 0;
    for (const m of media) {
      const st = m.p.status;
      if (st === "downloading" || st === "processing") {
        medActive++;
        medSpeed += m.p.speed_bps ?? 0;
        dlBytes += m.p.downloaded;
        if (m.p.total) totBytes += m.p.total;
        else knownTotal = false;
      } else if (st === "queued") queued++;
      else if (st === "completed") completed++;
      else if (st === "error") errored++;
    }

    const active = httpActive + torrActive + medActive;
    const speed = httpSpeed + torrSpeed + medSpeed;
    const pct = knownTotal && totBytes > 0 ? percent(dlBytes, totBytes) : null;
    const eta =
      active > 0 && knownTotal && totBytes > 0 ? formatEta(dlBytes, totBytes, speed) : "—";

    return {
      active,
      speed,
      upSpeed,
      queued,
      paused,
      completed,
      errored,
      dlBytes,
      totBytes: knownTotal ? totBytes : null,
      pct,
      eta,
      httpActive,
      torrActive,
      medActive,
    };
  }, [downloads, speeds, torrents, media]);

  // Rien à montrer tant qu'aucun transfert n'existe.
  if (downloads.length + torrents.length + media.length === 0) return null;

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem("raketa.overview.collapsed", next ? "0" : "1");
    } catch {
      /* stockage indisponible */
    }
  }

  return (
    <section className={`overview ${open ? "" : "collapsed"}`} aria-label="Vue d'ensemble">
      <button
        className="overview-toggle"
        onClick={toggle}
        title={open ? "Replier la vue d'ensemble" : "Déplier la vue d'ensemble"}
        aria-expanded={open}
      >
        <Icon name="chevron-down" size={14} className={open ? "" : "caret-up"} />
        <span className="overview-toggle-label">Vue d'ensemble</span>
        {!open && (
          <span className="overview-toggle-sum">
            {a.active > 0 ? (
              <>
                <Icon name="download" size={12} /> {formatSpeed(a.speed)} · {a.active} actif(s)
              </>
            ) : (
              "au repos"
            )}
          </span>
        )}
      </button>

      {open && (
        <div className="overview-body">
          <div className="ov-card ov-accent">
            <span className="ov-label">Débit total</span>
            <span className="ov-value">{formatSpeed(a.speed)}</span>
            {a.upSpeed > 0 && (
              <span className="ov-sub">
                <Icon name="rotate" size={11} /> {formatSpeed(a.upSpeed)} envoi
              </span>
            )}
          </div>

          <div className="ov-card">
            <span className="ov-label">Actifs</span>
            <span className="ov-value">{a.active}</span>
            <span className="ov-sub">
              {a.httpActive > 0 && <>HTTP {a.httpActive} </>}
              {a.torrActive > 0 && <>· Torrent {a.torrActive} </>}
              {a.medActive > 0 && <>· Média {a.medActive}</>}
              {a.active === 0 && "aucun"}
            </span>
          </div>

          <div className="ov-card ov-grow">
            <span className="ov-label">
              Progression globale
              {a.pct !== null && <span className="ov-pct">{a.pct}%</span>}
            </span>
            <div className="ov-track">
              <div
                className={`ov-fill ${a.pct === null ? "indeterminate" : ""}`}
                style={a.pct !== null ? { width: `${a.pct}%` } : undefined}
              />
            </div>
            <span className="ov-sub">
              {formatBytes(a.dlBytes)}
              {a.totBytes !== null ? ` / ${formatBytes(a.totBytes)}` : ""}
              {a.active > 0 && a.eta !== "—" ? ` · reste ${a.eta}` : ""}
            </span>
          </div>

          <div className="ov-card ov-chips">
            {a.queued > 0 && <span className="ov-chip queued">{a.queued} en file</span>}
            {a.paused > 0 && <span className="ov-chip paused">{a.paused} en pause</span>}
            <span className="ov-chip completed">{a.completed} terminé(s)</span>
            {a.errored > 0 && <span className="ov-chip error">{a.errored} en erreur</span>}
          </div>
        </div>
      )}
    </section>
  );
}
