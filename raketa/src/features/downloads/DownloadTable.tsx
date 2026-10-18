import { useState } from "react";
import {
  cancelDownload,
  openFile,
  pauseDownload,
  redownload,
  removeDownload,
  resumeDownload,
  revealInFolder,
  type DownloadDto,
} from "../../lib/api";
import { iconFor } from "../../lib/category";
import { Icon } from "../../components/Icon";
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
        <div className="empty-icon">
          <Icon name="cactus" size={40} />
        </div>
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
            <th className="col-eta">Restant</th>
            <th className="col-date">Ajouté</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {downloads.map((d) => {
            const pct = percent(d.downloaded_bytes, d.total_bytes);
            const spd = speeds[d.id] ?? 0;
            const isActive = d.status === "downloading" || d.status === "probing";
            const isPaused = d.status === "paused";
            // En file d'attente (créneaux pleins) : on peut l'annuler/arrêter.
            const isQueued = d.status === "queued";
            // Échec/annulation : « Réessayer » reprend la MÊME tâche (même id,
            // donc le fichier partiel .rkt-part est repris s'il est valide) au
            // lieu d'en créer une nouvelle qui repartirait de zéro.
            const canRetry = d.status === "error" || d.status === "cancelled";
            const isDone = d.status === "completed";
            return (
              <tr
                key={d.id}
                className={`row-${d.status}`}
                onDoubleClick={() => onOpenDetail(d)}
                onContextMenu={(e) => openMenu(e, d)}
              >
                <td className="col-icon">
                  <Icon name={iconFor(d.display_name)} size={17} />
                </td>
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
                        <Icon name="pause" size={15} />
                      </button>
                    )}
                    {isPaused && (
                      <button className="icon-act" title="Reprendre" onClick={() => act(() => resumeDownload(d.id))}>
                        <Icon name="play" size={15} />
                      </button>
                    )}
                    {(isActive || isPaused || isQueued) && (
                      <button className="icon-act" title="Arrêter" onClick={() => act(() => cancelDownload(d.id))}>
                        <Icon name="stop" size={15} />
                      </button>
                    )}
                    {canRetry && (
                      <button
                        className="icon-act"
                        title="Réessayer"
                        onClick={() => act(() => resumeDownload(d.id))}
                      >
                        <Icon name="rotate" size={15} />
                      </button>
                    )}
                    {isDone && (
                      <button
                        className="icon-act"
                        title="Re-télécharger"
                        onClick={() => act(async () => { await redownload(d.id); })}
                      >
                        <Icon name="rotate" size={15} />
                      </button>
                    )}
                    <button className="icon-act danger" title="Supprimer" onClick={() => act(() => removeDownload(d.id, false))}>
                      <Icon name="trash" size={15} />
                    </button>
                    <button className="icon-act" title="Détails" onClick={() => onOpenDetail(d)}>
                      <Icon name="info" size={15} />
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
  const isActive = d.status === "downloading" || d.status === "probing";
  const isPaused = d.status === "paused";
  const isQueued = d.status === "queued";
  const isDone = d.status === "completed";
  const canRetry = d.status === "error" || d.status === "cancelled";

  // Clamp pour rester dans la fenêtre.
  const style: React.CSSProperties = {
    top: Math.min(menu.y, window.innerHeight - 320),
    left: Math.min(menu.x, window.innerWidth - 240),
  };

  return (
    <div className="ctx-menu" style={style}>
      {isActive && (
        <button onClick={() => act(() => pauseDownload(d.id))}>
          <Icon name="pause" size={16} /> Pause
        </button>
      )}
      {isPaused && (
        <button onClick={() => act(() => resumeDownload(d.id))}>
          <Icon name="play" size={16} /> Reprendre
        </button>
      )}
      {(isActive || isPaused || isQueued) && (
        <button onClick={() => act(() => cancelDownload(d.id))}>
          <Icon name="stop" size={16} /> Arrêter
        </button>
      )}
      {isDone && d.file_exists && (
        <button onClick={() => act(() => openFile(d.destination))}>
          <Icon name="external" size={16} /> Ouvrir le fichier
        </button>
      )}
      <button onClick={() => act(() => revealInFolder(d.destination))}>
        <Icon name="folder" size={16} /> Ouvrir le dossier
      </button>
      <button onClick={() => act(async () => { try { await navigator.clipboard.writeText(d.url); } catch { /* presse-papiers indisponible */ } })}>
        <Icon name="clipboard" size={16} /> Copier le lien
      </button>
      {canRetry && (
        <button onClick={() => act(() => resumeDownload(d.id))}>
          <Icon name="rotate" size={16} /> Réessayer
        </button>
      )}
      {isDone && (
        <button onClick={() => act(async () => { await redownload(d.id); })}>
          <Icon name="rotate" size={16} /> Re-télécharger
        </button>
      )}
      <div className="ctx-sep" />
      <button onClick={() => { onOpenDetail(d); }}>
        <Icon name="info" size={16} /> Propriétés
      </button>
      <div className="ctx-sep" />
      <button onClick={() => act(() => removeDownload(d.id, false))}>
        <Icon name="x" size={16} /> Retirer de la liste
      </button>
      <button className="danger" onClick={() => act(() => removeDownload(d.id, true))}>
        <Icon name="trash" size={16} /> Supprimer + fichier
      </button>
    </div>
  );
}
