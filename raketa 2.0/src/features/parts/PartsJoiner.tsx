import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  detectPartGroups,
  joinParts,
  onJoinProgress,
  openFile,
  revealInFolder,
  type JoinProgress,
  type PartGroup,
} from "../../lib/api";
import { Icon } from "../../components/Icon";
import { formatBytes } from "../../lib/format";

interface Props {
  // Dossier analysé par défaut (dossier de téléchargement courant).
  defaultDir: string;
  onClose: () => void;
}

interface JoinResult {
  path?: string;
  error?: string;
}

// Combineur de parties : repère les fichiers téléchargés « en plusieurs
// morceaux » (par leur nom) et reconstitue UN seul fichier. Les découpes
// binaires (.001/.002, volumes 7-Zip) sont concaténées ; les archives
// multi-volumes (RAR/ZIP) sont signalées et s'ouvrent pour extraction (les
// concaténer les corromprait).
export function PartsJoiner({ defaultDir, onClose }: Props) {
  const [dir, setDir] = useState(defaultDir);
  const [groups, setGroups] = useState<PartGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [progress, setProgress] = useState<Record<string, JoinProgress>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, JoinResult>>({});
  const [delParts, setDelParts] = useState(false);
  const unlistenRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    onJoinProgress((p) => setProgress((prev) => ({ ...prev, [p.output]: p })))
      .then((fn) => (unlistenRef.current = fn))
      .catch(() => {});
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  const scan = useCallback(async (d: string) => {
    if (!d) return;
    setScanning(true);
    try {
      setGroups(await detectPartGroups(d));
    } catch {
      setGroups([]);
    } finally {
      setScanning(false);
      setScanned(true);
    }
  }, []);

  useEffect(() => {
    if (defaultDir) void scan(defaultDir);
  }, [defaultDir, scan]);

  async function pickFolder() {
    const sel = await open({ directory: true, defaultPath: dir || undefined });
    if (typeof sel === "string") {
      setDir(sel);
      setResults({});
      setProgress({});
      void scan(sel);
    }
  }

  async function doJoin(g: PartGroup) {
    setBusy((b) => ({ ...b, [g.base]: true }));
    setResults((r) => {
      const n = { ...r };
      delete n[g.base];
      return n;
    });
    try {
      const path = await joinParts({
        parts: g.parts.map((p) => p.path),
        dir,
        outputName: g.output_name,
        deleteParts: delParts,
      });
      setResults((r) => ({ ...r, [g.base]: { path } }));
      if (delParts) void scan(dir); // parties supprimées : on réanalyse
    } catch (e) {
      setResults((r) => ({ ...r, [g.base]: { error: String(e) } }));
    } finally {
      setBusy((b) => ({ ...b, [g.base]: false }));
    }
  }

  const concatCount = groups.filter((g) => g.kind === "concat").length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal parts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>
            <Icon name="layers" size={18} /> Combineur de parties
          </h2>
          <button className="btn tiny" onClick={onClose}>
            Fermer ✕
          </button>
        </div>

        <p className="hint">
          RAKETA repère les fichiers téléchargés en plusieurs morceaux (d'après
          leur nom) et les réunit en un seul fichier. Plusieurs ensembles peuvent
          coexister : ils sont identifiés séparément.
        </p>

        <div className="parts-dir">
          <span className="parts-dir-path mono" title={dir}>
            {dir || "Aucun dossier sélectionné"}
          </span>
          <button className="btn ghost tiny" onClick={pickFolder}>
            <Icon name="folder" size={15} /> Changer de dossier
          </button>
          <button className="btn tiny" onClick={() => scan(dir)} disabled={scanning || !dir}>
            <Icon name="rotate" size={15} /> {scanning ? "Analyse…" : "Analyser"}
          </button>
        </div>

        {concatCount > 0 && (
          <label className="parts-delopt">
            <input
              type="checkbox"
              checked={delParts}
              onChange={(e) => setDelParts(e.target.checked)}
            />
            <span>Supprimer les parties d'origine après une jonction réussie</span>
          </label>
        )}

        <div className="parts-list">
          {scanning && groups.length === 0 && <p className="hint">Analyse du dossier…</p>}

          {!scanning && scanned && groups.length === 0 && (
            <div className="empty-state small">
              <div className="empty-icon">
                <Icon name="layers" size={34} />
              </div>
              <p className="empty-title">Aucun fichier en plusieurs parties</p>
              <p className="empty-hint">
                Rien à combiner dans ce dossier. Choisissez le dossier qui contient
                vos morceaux (ex. <span className="mono">film.mkv.001</span>,{" "}
                <span className="mono">film.mkv.002</span>…).
              </p>
            </div>
          )}

          {groups.map((g) => {
            const prog = progress[g.output_name];
            const isBusy = !!busy[g.base];
            const res = results[g.base];
            const pct =
              prog && prog.total > 0 ? Math.min(100, Math.round((prog.written / prog.total) * 100)) : 0;
            const isArchive = g.kind === "archive";
            return (
              <div className={`parts-group ${isArchive ? "archive" : ""}`} key={g.base}>
                <div className="parts-group-head">
                  <Icon name={isArchive ? "inbox" : "layers"} size={18} />
                  <span className="parts-base" title={g.base}>
                    {g.output_name}
                  </span>
                  <span className={`parts-kind ${isArchive ? "arch" : "concat"}`}>
                    {isArchive ? "Archive multi-volume" : "À concaténer"}
                  </span>
                </div>
                <div className="parts-meta">
                  <span>{g.parts.length} partie(s)</span>
                  <span>{formatBytes(g.total_size)}</span>
                  {g.missing !== null && (
                    <span className="parts-missing">
                      ⚠ partie n°{g.missing} manquante
                    </span>
                  )}
                </div>

                {isArchive ? (
                  <>
                    <p className="hint parts-archive-note">
                      Ces volumes forment une archive : ouvrez le premier volume avec
                      votre logiciel d'archive (7-Zip, WinRAR…) pour en extraire le
                      contenu. Les concaténer ne donnerait pas un fichier valide.
                    </p>
                    <div className="parts-actions">
                      <button
                        className="btn tiny primary"
                        onClick={() => openFile(g.parts[0].path).catch(() => {})}
                      >
                        <Icon name="external" size={14} /> Ouvrir le 1er volume
                      </button>
                      <button
                        className="btn tiny"
                        onClick={() => revealInFolder(g.parts[0].path).catch(() => {})}
                      >
                        <Icon name="folder" size={14} /> Dossier
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {(isBusy || (prog && !prog.done)) && (
                      <div className="parts-prog">
                        <div className="parts-prog-track">
                          <div className="parts-prog-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="parts-prog-pct">{pct}%</span>
                      </div>
                    )}
                    {res?.path ? (
                      <div className="parts-done">
                        <span className="parts-done-ok">
                          <Icon name="check-circle" size={15} /> Fichier reconstitué
                        </span>
                        <div className="parts-actions">
                          <button
                            className="btn tiny primary"
                            onClick={() => openFile(res.path!).catch(() => {})}
                          >
                            <Icon name="external" size={14} /> Ouvrir
                          </button>
                          <button
                            className="btn tiny"
                            onClick={() => revealInFolder(res.path!).catch(() => {})}
                          >
                            <Icon name="folder" size={14} /> Dossier
                          </button>
                        </div>
                      </div>
                    ) : res?.error ? (
                      <p className="error-text">{res.error}</p>
                    ) : (
                      <div className="parts-actions">
                        <button
                          className="btn tiny primary"
                          onClick={() => doJoin(g)}
                          disabled={isBusy}
                        >
                          <Icon name="layers" size={14} />{" "}
                          {isBusy ? "Jonction…" : "Joindre en un fichier"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
