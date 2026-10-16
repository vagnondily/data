import { useState } from "react";
import {
  cancelDownload,
  openFile,
  pauseDownload,
  removeDownload,
  resumeDownload,
  revealInFolder,
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

interface Menu {
  x: number;
  y: number;
  d: DownloadDto;
}

// Tableau dense façon IDM : toutes les infos en colonnes + menu clic droit.
export function DownloadTable({ downloads, speeds, onChanged, onOpenDetail }: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);

  const totalSpeed = downloads
    .filter((d) => d.status === "downloading")
    .reduce((sum, d) => sum + (speeds[d.id] ?? 0), 0);
  const active = downloads.filter((d) => d.status === "downloading").length;

  async function act(fn: () => Promise<void>) {
    setMenu(null);
    await fn();
    onChanged();
  }

  function openMenu(e: React.MouseEvent, d: DownloadDto) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, d });
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
              <tr
                key={d.id}
                className={`row-${d.status}`}
                onDoubleClick={() => onOpenDetail(d)}
                onContextMenu={(e) => openMenu(e, d)}
              >
                <td className="col-icon">{iconFor(d.display_name)}</td>
                <td className="col-name">
                  <span className="cell-name clickable" title={d.display_name} onClick={() => onOpenDetail(d)}>
                    {d.display_name}
                  </span>
                </td>
                <td className="col-size">{formatBytes(d.total_bytes ?? d.downloaded_bytes)}</td>
                <td className="col-status">
                  {d.status === "completed" && !d.file_exists ? (
                    <span className="pill-error" title="Le fichier a été supprimé du disque">
                      Fichier manquant
                    </span>
                  ) : (
                    <span className={`pill-${d.status}`}>{statusLabel(d.status)}</span>
                  )}
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
                      <button className="icon-act" title="Arrêter" onClick={() => act(() => cancelDownload(d.id))}>
                        ⏹
                      </button>
                    )}
                    <button className="icon-act" title="Supprimer" onClick={() => act(() => removeDownload(d.id, false))}>
                      🗑
                    </button>
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

      {menu && (
        <>
          <div className="ctx-overlay" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <ContextMenu
            menu={menu}
            onOpenDetail={(dd) => {
              setMenu(null);
              onOpenDetail(dd);
            }}
            act={act}
          />
        </>
      )}
    </div>
  );
}

function ContextMenu({
  menu,
  onOpenDetail,
  act,
}: {
  menu: Menu;
  onOpenDetail: (d: DownloadDto) => void;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const d = menu.d;
  const isActive = d.status === "downloading";
  const isPaused = d.status === "paused";
  const isDone = d.status === "completed";

  // Clamp pour rester dans la fenêtre.
  const style: React.CSSProperties = {
    top: Math.min(menu.y, window.innerHeight - 320),
    left: Math.min(menu.x, window.innerWidth - 240),
  };

  return (
    <div className="ctx-menu" style={style}>
      {isActive && <button onClick={() => act(() => pauseDownload(d.id))}>⏸ Pause</button>}
      {isPaused && <button onClick={() => act(() => resumeDownload(d.id))}>▶ Reprendre</button>}
      {(isActive || isPaused) && (
        <button onClick={() => act(() => cancelDownload(d.id))}>⏹ Arrêter</button>
      )}
      {isDone && d.file_exists && (
        <button onClick={() => act(() => openFile(d.destination))}>📂 Ouvrir le fichier</button>
      )}
      <button onClick={() => act(() => revealInFolder(d.destination))}>🗂️ Ouvrir le dossier</button>
      <div className="ctx-sep" />
      <button onClick={() => { onOpenDetail(d); }}>ⓘ Propriétés</button>
      <div className="ctx-sep" />
      <button onClick={() => act(() => removeDownload(d.id, false))}>🗑 Retirer de la liste</button>
      <button className="danger" onClick={() => act(() => removeDownload(d.id, true))}>
        ❌ Supprimer + fichier
      </button>
    </div>
  );
}
