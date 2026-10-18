import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addTorrent,
  addTorrentFile,
  firewallAuthorize,
  openFile,
  pauseTorrent,
  removeTorrent,
  resumeTorrent,
  revealInFolder,
  type TorrentProgress,
} from "../../lib/api";
import { Icon } from "../../components/Icon";
import { formatBytes, formatEta, formatSpeed, percent } from "../../lib/format";

interface Props {
  torrents: TorrentProgress[];
  onChanged: () => void;
}

// État lisible pour l'utilisateur, en clair.
function stateLabel(t: TorrentProgress): string {
  if (t.finished) return "Terminé";
  if (t.paused) return "En pause";
  if (t.error) return "Erreur";
  if (t.peers_live > 0) return "Téléchargement";
  if (t.health === "no_source") return "Aucune source";
  if (t.health === "no_connection") return "Bloqué (pare-feu ?)";
  const s = t.state.toLowerCase();
  if (s.includes("initial")) return "Initialisation…";
  return "Recherche de pairs…";
}

function pillClass(t: TorrentProgress): string {
  if (t.finished) return "pill-completed";
  // « Aucune source » est un vrai blocage : on le signale en rouge.
  if (t.error || t.health === "no_source") return "pill-error";
  if (t.paused) return "pill-paused";
  return "pill-downloading";
}

// Message clair du vérificateur de santé : explique POURQUOI un torrent ne
// démarre pas (aucun seeder vs pare-feu), au lieu d'un éternel « 0 % ».
function healthNote(t: TorrentProgress): { tone: "err" | "muted"; text: string } | null {
  if (t.finished || t.paused || t.error) return null;
  switch (t.health) {
    case "no_source":
      return {
        tone: "err",
        text: "Aucune source : ce torrent n'a aucun seeder actif (il est probablement « mort »). Essayez un autre lien, ou un torrent mieux partagé.",
      };
    case "no_connection":
      return {
        tone: "muted",
        text: "Des pairs ont été repérés mais aucune connexion ne s'établit. Essayez d'autoriser RAKETA dans le pare-feu. Si rien ne change, c'est souvent le réseau de l'opérateur (NAT/CGNAT) qui bloque l'entrant — le téléchargement peut quand même avancer si des seeders sont joignables.",
      };
    case "checking":
      return { tone: "muted", text: "Recherche de sources (trackers & DHT)…" };
    default:
      return null;
  }
}

// Panneau torrents : ajout par magnet/URL ou fichier .torrent, liste détaillée
// (pairs, débits, fichiers) façon uTorrent, et actions.
export function TorrentPanel({ torrents, onChanged }: Props) {
  const [magnet, setMagnet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  // Autorisation pare-feu (connexions entrantes des pairs) : "idle" | "busy" | "done".
  const [fw, setFw] = useState<"idle" | "busy" | "done">("idle");

  async function authorizeFirewall(id: number) {
    setFw("busy");
    try {
      await firewallAuthorize();
      // Re-annonce le torrent (pause puis reprise) pour tenter de reconnecter
      // les pairs maintenant que le pare-feu autorise l'entrant.
      try {
        await pauseTorrent(id);
        await resumeTorrent(id);
      } catch {
        /* non bloquant */
      }
      setFw("done");
      onChanged();
    } catch {
      setFw("idle");
    }
  }

  async function submitMagnet() {
    const url = magnet.trim();
    if (!url) return;
    try {
      setBusy(true);
      setError(null);
      await addTorrent(url);
      setMagnet("");
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Torrent", extensions: ["torrent"] }],
    });
    if (typeof selected === "string") {
      try {
        setBusy(true);
        setError(null);
        await addTorrentFile(selected);
        onChanged();
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <section className="torrent-panel" aria-label="Torrents">
      <div className="add-panel">
        <div className="add-row">
          <input
            type="text"
            className="input url-input"
            placeholder="Collez un lien magnet:?xt=… ou une URL .torrent"
            value={magnet}
            onChange={(e) => setMagnet(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitMagnet()}
            aria-label="Lien magnet ou URL torrent"
          />
          <button className="btn ghost" onClick={pickFile} disabled={busy}>
            <Icon name="folder" size={16} /> Fichier .torrent
          </button>
          <button className="btn primary" onClick={submitMagnet} disabled={busy}>
            <Icon name="plus" size={16} /> Ajouter
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>

      {torrents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon name="magnet" size={38} /></div>
          <p className="empty-title">Aucun torrent</p>
          <p className="empty-hint">
            Ajoutez un lien magnet ou un fichier .torrent pour démarrer.
          </p>
        </div>
      ) : (
        <div className="torrent-list">
          {torrents.map((t) => {
            const pct = percent(t.downloaded, t.total);
            const isOpen = !!expanded[t.id];
            const note = healthNote(t);
            return (
              <div key={t.id} className={`torrent-card ${t.finished ? "done" : ""} ${t.error ? "err" : ""}`}>
                <div className="torrent-top">
                  <span className="torrent-icon"><Icon name="magnet" size={18} /></span>
                  <span className="torrent-name" title={t.name}>{t.name}</span>
                  <span className={`${pillClass(t)} torrent-pill`}>{stateLabel(t)}</span>
                </div>

                <div className="progress-track">
                  <div
                    className={`progress-fill ${pct === null ? "indeterminate" : ""} ${t.finished ? "completed" : ""}`}
                    style={pct !== null ? { width: `${pct}%` } : undefined}
                  />
                </div>

                <div className="torrent-stats">
                  <span className="t-primary">
                    {formatBytes(t.downloaded)}{t.total ? ` / ${formatBytes(t.total)}` : ""}
                    {pct !== null ? ` · ${pct}%` : ""}
                  </span>
                  {!t.finished && (
                    <span title="Débit de téléchargement">
                      <Icon name="download" size={13} /> {formatSpeed(t.speed_bps)}
                    </span>
                  )}
                  <span title="Débit d'envoi (seed)">
                    <Icon name="rotate" size={13} /> {formatSpeed(t.up_speed_bps)}
                  </span>
                  <span title="Pairs connectés / découverts">
                    Pairs : {t.peers_live} / {t.peers_seen}
                  </span>
                  {!t.finished && t.peers_live > 0 && (
                    <span>Restant : {formatEta(t.downloaded, t.total, t.speed_bps)}</span>
                  )}
                </div>

                {t.error && <p className="error-text torrent-err">{t.error}</p>}
                {!t.error && note && (
                  <p className={note.tone === "err" ? "error-text torrent-err" : "hint torrent-hint"}>
                    {note.text}
                  </p>
                )}
                {!t.error && t.health === "no_connection" && (
                  <button
                    className="btn tiny primary torrent-fw-btn"
                    style={{ marginTop: 6, alignSelf: "flex-start" }}
                    onClick={() => authorizeFirewall(t.id)}
                    disabled={fw === "busy"}
                  >
                    <Icon name="shield" size={14} />{" "}
                    {fw === "busy"
                      ? "Autorisation…"
                      : fw === "done"
                        ? "Autorisé ✓ (reconnexion…)"
                        : "Autoriser RAKETA dans le pare-feu"}
                  </button>
                )}

                <div className="torrent-actions">
                  {t.files.length > 0 && (
                    <button
                      className="btn tiny ghost"
                      onClick={() => setExpanded((p) => ({ ...p, [t.id]: !isOpen }))}
                    >
                      <Icon name="chevron-down" size={14} className={isOpen ? "caret-up" : ""} />
                      {isOpen ? "Masquer" : "Fichiers"} ({t.files.length})
                    </button>
                  )}
                  <div className="torrent-actions-right">
                    {t.finished && t.content_path && (
                      <button
                        className="btn tiny primary"
                        onClick={() => openFile(t.content_path).catch(() => {})}
                        title="Ouvrir le fichier (ou le dossier) téléchargé"
                      >
                        <Icon name="external" size={14} /> Ouvrir
                      </button>
                    )}
                    {t.content_path && (
                      <button
                        className="btn tiny"
                        onClick={() => revealInFolder(t.content_path).catch(() => {})}
                        title="Afficher dans l'explorateur de fichiers"
                      >
                        <Icon name="folder" size={14} /> Dossier
                      </button>
                    )}
                    {!t.finished &&
                      (t.paused ? (
                        <button className="btn tiny primary" onClick={() => resumeTorrent(t.id).then(onChanged)}>
                          <Icon name="play" size={14} /> Reprendre
                        </button>
                      ) : (
                        <button className="btn tiny" onClick={() => pauseTorrent(t.id).then(onChanged)}>
                          <Icon name="pause" size={14} /> Pause
                        </button>
                      ))}
                    <button
                      className="btn tiny"
                      onClick={() => removeTorrent(t.id, false).then(onChanged)}
                      title="Retirer de la liste (conserve les fichiers)"
                    >
                      Retirer
                    </button>
                    <button
                      className="btn tiny danger"
                      onClick={() => removeTorrent(t.id, true).then(onChanged)}
                      title="Supprimer le torrent et ses fichiers du disque"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && t.files.length > 0 && (
                  <div className="torrent-files">
                    {t.files.map((f, i) => {
                      const fp = percent(f.downloaded, f.len);
                      return (
                        <div className="torrent-file" key={i}>
                          <span className="tf-name" title={f.name}>{f.name}</span>
                          <span className="tf-bar">
                            <span className="mini-track">
                              <span
                                className="mini-fill"
                                style={{ width: `${fp ?? 0}%` }}
                              />
                            </span>
                          </span>
                          <span className="tf-size">{formatBytes(f.len)}</span>
                          <span className="tf-pct">{fp ?? 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
