import {
  cancelDownload,
  pauseDownload,
  resumeDownload,
  type DownloadDto,
} from "../../lib/api";
import {
  formatBytes,
  formatEta,
  formatSpeed,
  percent,
  statusLabel,
} from "../../lib/format";

interface Props {
  d: DownloadDto;
  speed: number;
  onChanged: () => void;
  onOpenDetail: (d: DownloadDto) => void;
}

// Ligne de téléchargement : nom, progression, débit, temps restant, actions.
export function DownloadItem({ d, speed, onChanged, onOpenDetail }: Props) {
  const pct = percent(d.downloaded_bytes, d.total_bytes);
  const active = d.status === "downloading";
  const paused = d.status === "paused";

  async function act(fn: () => Promise<void>) {
    await fn();
    onChanged();
  }

  return (
    <div className={`dl-item status-${d.status}`}>
      <div className="dl-main">
        <div className="dl-head">
          <span
            className="dl-name clickable"
            title="Voir les détails"
            onClick={() => onOpenDetail(d)}
          >
            {d.display_name}
          </span>
          <span className={`dl-status pill-${d.status}`}>{statusLabel(d.status)}</span>
        </div>

        <div className="progress-track" role="progressbar" aria-valuenow={pct ?? 0}>
          <div
            className={`progress-fill ${pct === null ? "indeterminate" : ""}`}
            style={pct !== null ? { width: `${pct}%` } : undefined}
          />
        </div>

        <div className="dl-meta">
          <span>
            {formatBytes(d.downloaded_bytes)}
            {d.total_bytes ? ` / ${formatBytes(d.total_bytes)}` : ""}
            {pct !== null ? ` · ${pct}%` : ""}
          </span>
          {active && <span>{formatSpeed(speed)}</span>}
          {active && (
            <span>{formatEta(d.downloaded_bytes, d.total_bytes, speed)}</span>
          )}
          {d.status === "error" && d.error_code && (
            <span className="error-text">{d.error_code}</span>
          )}
          {d.status === "completed" && d.sha256 && (
            <span className="sha" title={`SHA-256 : ${d.sha256}`}>
              🔒 {d.sha256.slice(0, 12)}…
            </span>
          )}
        </div>
      </div>

      <div className="dl-actions">
        <button className="btn tiny" onClick={() => onOpenDetail(d)} title="Détails">
          Détails
        </button>
        {active && (
          <button className="btn tiny" onClick={() => act(() => pauseDownload(d.id))}>
            Pause
          </button>
        )}
        {paused && (
          <button
            className="btn tiny primary"
            onClick={() => act(() => resumeDownload(d.id))}
          >
            Reprendre
          </button>
        )}
        {(active || paused) && (
          <button
            className="btn tiny danger"
            onClick={() => act(() => cancelDownload(d.id))}
          >
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
