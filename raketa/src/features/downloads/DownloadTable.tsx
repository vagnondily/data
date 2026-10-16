import {
  cancelDownload,
  pauseDownload,
  resumeDownload,
  type DownloadDto,
} from "../../lib/api";
import { iconFor } from "../../lib/category";
import {
  formatBytes,
  formatDate,
  formatEta,
  formatSpeed,
  percent,
  statusLabel,
} from "../../lib/format";

interface Props {
  downloads: DownloadDto[];
  speeds: Record<string, number>;
  onChanged: () => void;
  onOpenDetail: (d: DownloadDto) => void;
}

// Tableau dense façon IDM : toutes les infos en colonnes, d'un coup d'œil.
export function DownloadTable({ downloads, speeds, onChanged, onOpenDetail }: Props) {
  const totalSpeed = downloads
    .filter((d) => d.status === "downloading")
    .reduce((sum, d) => sum + (speeds[d.id] ?? 0), 0);
  const active = downloads.filter((d) => d.status === "downloading").length;

  async function act(fn: () => Promise<void>) {
    await fn();
    onChanged();
  }

  if (downloads.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">🌵</div>
        <p className="empty-title">Aucun téléchargement ici</p>
        <p className="empty-hint">Collez une URL ci-dessus ou choisissez une autre catégorie.</p>
      </div>
    );
  }

  return (
    <div className="dl-table-wrap">
      <table className="dl-table">
        <thead>
          <tr>
            <th className="col-icon"></th>
            <th className="col-name">Nom du fichier</th>
            <th className="col-size">Taille</th>
            <th className="col-status">Statut</th>
            <th className="col-progress">Progression</th>
            <th className="col-speed">Débit</th>
            <th className="col-eta">Temps restant</th>
            <th className="col-date">Ajouté</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {downloads.map((d) => {
            const pct = percent(d.downloaded_bytes, d.total_bytes);
            const spd = speeds[d.id] ?? 0;
            const isActive = d.status === "downloading";
            const isPaused = d.status === "paused";
            return (
              <tr key={d.id} className={`row-${d.status}`} onDoubleClick={() => onOpenDetail(d)}>
                <td className="col-icon">{iconFor(d.display_name)}</td>
                <td className="col-name">
                  <span className="cell-name clickable" title={d.display_name} onClick={() => onOpenDetail(d)}>
                    {d.display_name}
                  </span>
                </td>
                <td className="col-size">{formatBytes(d.total_bytes ?? d.downloaded_bytes)}</td>
                <td className="col-status">
                  <span className={`pill-${d.status}`}>{statusLabel(d.status)}</span>
                </td>
                <td className="col-progress">
                  <div className="mini-track">
                    <div
                      className={`mini-fill ${pct === null ? "indeterminate" : ""}`}
                      style={pct !== null ? { width: `${pct}%` } : undefined}
                    />
                  </div>
                  <span className="mini-pct">{pct !== null ? `${pct}%` : "—"}</span>
                </td>
                <td className="col-speed">{isActive ? formatSpeed(spd) : "—"}</td>
                <td className="col-eta">
                  {isActive ? formatEta(d.downloaded_bytes, d.total_bytes, spd) : "—"}
                </td>
                <td className="col-date">{formatDate(d.created_at)}</td>
                <td className="col-actions">
                  <div className="row-actions">
                    {isActive && (
                      <button className="icon-act" title="Pause" onClick={() => act(() => pauseDownload(d.id))}>
                        ⏸
                      </button>
                    )}
                    {isPaused && (
                      <button className="icon-act" title="Reprendre" onClick={() => act(() => resumeDownload(d.id))}>
                        ▶
                      </button>
                    )}
                    {(isActive || isPaused) && (
                      <button className="icon-act" title="Annuler" onClick={() => act(() => cancelDownload(d.id))}>
                        ✕
                      </button>
                    )}
                    <button className="icon-act" title="Détails" onClick={() => onOpenDetail(d)}>
                      ⓘ
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="dl-statusbar">
        <span>{downloads.length} téléchargement(s)</span>
        <span>{active} actif(s)</span>
        <span>Débit total : {formatSpeed(totalSpeed)}</span>
      </div>
    </div>
  );
}
