import { useEffect, useState, type ReactNode } from "react";
import {
  downloadEvents,
  type DownloadDto,
  type DownloadEvent,
  type SegmentInfo,
} from "../../lib/api";
import {
  formatBytes,
  formatDate,
  formatEta,
  formatSpeed,
  percent,
  statusLabel,
} from "../../lib/format";

interface Props {
  d: DownloadDto;
  speed: number;
  segments?: SegmentInfo[];
  onClose: () => void;
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    created: "🆕 Ajouté",
    completed: "✅ Terminé",
    error: "⛔ Erreur",
  };
  return map[type] ?? type;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

// Panneau de détails complet d'un téléchargement (section 11.1).
export function DownloadDetail({ d, speed, segments, onClose }: Props) {
  const [events, setEvents] = useState<DownloadEvent[]>([]);
  const pct = percent(d.downloaded_bytes, d.total_bytes);
  const active = d.status === "downloading";

  useEffect(() => {
    downloadEvents(d.id).then(setEvents).catch(() => {});
  }, [d.id, d.status]);

  const rows: Array<{ k: string; v: ReactNode; copy?: string }> = [
    { k: "Nom", v: d.display_name },
    { k: "État", v: statusLabel(d.status) },
    { k: "URL", v: <span className="mono">{d.url}</span>, copy: d.url },
    { k: "Destination", v: <span className="mono">{d.destination}</span>, copy: d.destination },
    { k: "Type", v: d.mime_type ?? "—" },
    {
      k: "Taille",
      v: `${formatBytes(d.downloaded_bytes)}${d.total_bytes ? " / " + formatBytes(d.total_bytes) : ""}${pct !== null ? " · " + pct + "%" : ""}`,
    },
    { k: "Débit", v: active ? formatSpeed(speed) : "—" },
    {
      k: "Temps restant",
      v: active ? formatEta(d.downloaded_bytes, d.total_bytes, speed) : "—",
    },
    {
      k: "SHA-256",
      v: d.sha256 ? <span className="mono">{d.sha256}</span> : "—",
      copy: d.sha256 ?? undefined,
    },
    { k: "Ajouté le", v: formatDate(d.created_at) },
    { k: "Mis à jour", v: formatDate(d.updated_at) },
  ];
  if (d.error_code) {
    rows.push({ k: "Erreur", v: <span className="error-text">{d.error_code}</span> });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 title={d.display_name}>{d.display_name}</h2>
          <button className="btn tiny" onClick={onClose}>
            Fermer ✕
          </button>
        </div>

        <div className="progress-track big" role="progressbar" aria-valuenow={pct ?? 0}>
          <div
            className={`progress-fill ${pct === null ? "indeterminate" : ""}`}
            style={pct !== null ? { width: `${pct}%` } : undefined}
          />
        </div>

        <div className="detail-grid">
          {rows.map((r) => (
            <div className="detail-row" key={r.k}>
              <span className="detail-key">{r.k}</span>
              <span className="detail-val">{r.v}</span>
              {r.copy && (
                <button className="copy-btn" title="Copier" onClick={() => copy(r.copy!)}>
                  ⧉
                </button>
              )}
            </div>
          ))}
        </div>

        {segments && segments.length > 0 && (
          <>
            <h3 className="detail-sub">
              Connexions — {segments.length} segment(s) en parallèle
              {active && (
                <span className="seg-total-speed">
                  {" · "}
                  {formatSpeed(segments.reduce((sum, s) => sum + (s.speed_bps ?? 0), 0))}
                </span>
              )}
            </h3>
            <div className="seg-list">
              {segments.map((s) => {
                const p =
                  s.total > 0 ? Math.min(100, Math.round((s.downloaded / s.total) * 100)) : 0;
                const done = s.total > 0 && s.downloaded >= s.total;
                return (
                  <div className="seg-row" key={s.index}>
                    <span className="seg-num">#{s.index + 1}</span>
                    <div className="seg-track">
                      <div
                        className={`seg-fill ${done ? "done" : ""}`}
                        style={{ width: `${p}%` }}
                      />
                    </div>
                    <span className="seg-speed" title="Débit de ce segment">
                      {done ? "✓" : active ? formatSpeed(s.speed_bps ?? 0) : "—"}
                    </span>
                    <span className="seg-bytes">
                      {formatBytes(s.downloaded)} / {formatBytes(s.total)}
                    </span>
                    <span className="seg-pct">{p}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <h3 className="detail-sub">Historique</h3>
        {events.length === 0 ? (
          <p className="hint">Aucun événement enregistré.</p>
        ) : (
          <ul className="event-list">
            {events.map((e, i) => (
              <li key={i}>
                <span className="event-type">{eventLabel(e.event_type)}</span>
                <span className="event-time">{formatDate(e.timestamp)}</span>
                {e.message && <span className="event-msg">{e.message}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
