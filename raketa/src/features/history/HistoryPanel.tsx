import { useCallback, useEffect, useState } from "react";
import {
  addDownload,
  clearHistory,
  confirmDelete,
  deleteHistoryEntry,
  listHistory,
  mediaDownload,
  openFile,
  revealInFolder,
  type HistoryItem,
} from "../../lib/api";
import { iconFor } from "../../lib/category";
import { Icon } from "../../components/Icon";
import { formatBytes, formatDate } from "../../lib/format";

interface Props {
  // Bascule vers l'onglet Téléchargements après un re-téléchargement HTTP.
  onRedownloaded?: () => void;
}

// Dossier parent d'un chemin de fichier (pour re-télécharger au même endroit).
function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i > 0 ? path.slice(0, i) : "";
}

// Panneau Historique : informations de base des fichiers téléchargés, avec
// re-téléchargement (si un fichier a été supprimé) et effacement d'entrée.
export function HistoryPanel({ onRedownloaded }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listHistory()
      .then(setItems)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function redownload(h: HistoryItem) {
    setBusy(h.id);
    setNote(null);
    try {
      if (h.source === "media") {
        await mediaDownload(h.url, "auto", parentDir(h.destination));
        setNote(`« ${h.display_name} » relancé dans l'onglet Médias.`);
      } else {
        await addDownload({ url: h.url, destDir: parentDir(h.destination) });
        setNote(`« ${h.display_name} » relancé dans l'onglet Téléchargements.`);
        onRedownloaded?.();
      }
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(h: HistoryItem) {
    if (!(await confirmDelete(`Retirer « ${h.display_name} » de l'historique ?`))) return;
    await deleteHistoryEntry(h.id).catch(() => {});
    refresh();
  }

  async function wipe() {
    if (!(await confirmDelete("Vider TOUT l'historique des téléchargements ?\n\nCette action est irréversible."))) return;
    await clearHistory().catch(() => {});
    refresh();
  }

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Icon name="clock" size={38} />
        </div>
        <p className="empty-title">Historique vide</p>
        <p className="empty-hint">
          Les fichiers téléchargés apparaîtront ici — vous pourrez les
          re-télécharger même après les avoir supprimés du disque.
        </p>
      </div>
    );
  }

  return (
    <section className="history-panel" aria-label="Historique des téléchargements">
      <div className="history-head">
        <span className="history-count">{items.length} fichier(s) dans l'historique</span>
        <button className="btn ghost tiny danger" onClick={wipe}>
          <Icon name="trash" size={15} /> Vider l'historique
        </button>
      </div>

      {note && <p className="hint history-note">{note}</p>}

      <div className="history-list">
        {items.map((h) => (
          <div key={h.id} className={`history-row ${h.file_exists ? "" : "missing"}`}>
            <span className="history-icon">
              <Icon name={h.source === "media" ? "youtube" : iconFor(h.display_name)} size={18} />
            </span>
            <div className="history-body">
              <div className="history-name" title={h.display_name}>
                {h.display_name}
              </div>
              <div className="history-meta">
                <span>{formatBytes(h.total_bytes ?? undefined)}</span>
                <span>{formatDate(h.completed_at)}</span>
                <span className="history-src">{h.source === "media" ? "Média" : "HTTP"}</span>
                {!h.file_exists && <span className="history-missing">Fichier supprimé</span>}
              </div>
              <div className="history-url" title={h.url_display}>{h.url_display}</div>
            </div>
            <div className="history-actions">
              <button
                className="btn tiny primary"
                onClick={() => redownload(h)}
                disabled={busy === h.id}
                title="Re-télécharger ce fichier"
              >
                <Icon name="download" size={15} />
                {busy === h.id ? "…" : "Re-télécharger"}
              </button>
              {h.file_exists && (
                <>
                  <button className="btn tiny" onClick={() => openFile(h.destination)} title="Ouvrir le fichier">
                    <Icon name="external" size={15} />
                  </button>
                  <button className="btn tiny" onClick={() => revealInFolder(h.destination)} title="Ouvrir le dossier">
                    <Icon name="folder" size={15} />
                  </button>
                </>
              )}
              <button className="btn tiny danger" onClick={() => remove(h)} title="Effacer de l'historique">
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
