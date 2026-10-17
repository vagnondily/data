import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { addBatch, addDownload } from "../../lib/api";
import { Icon } from "../../components/Icon";

interface Props {
  onAdded: () => void;
  // URL pré-remplie (ex. depuis le presse-papiers).
  prefillUrl?: string;
  // Mode d'ajout contrôlé par le parent (menu Téléchargement).
  mode?: "single" | "batch";
  onModeChange?: (m: "single" | "batch") => void;
}

// Zone de commande : coller une URL, choisir la destination, lancer (section 11.1).
export function AddDownload({ onAdded, prefillUrl, mode = "single", onModeChange }: Props) {
  const [url, setUrl] = useState(prefillUrl ?? "");
  const [destDir, setDestDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const batchMode = mode === "batch";
  const setBatchMode = (b: boolean) => onModeChange?.(b ? "batch" : "single");
  const [batchText, setBatchText] = useState("");
  // Authentification (liens protégés par mot de passe).
  const [showAuth, setShowAuth] = useState(false);
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");

  async function chooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") setDestDir(selected);
  }

  async function submit() {
    setError(null);
    if (!url.trim()) {
      setError("Saisissez une URL.");
      return;
    }
    // Dossier optionnel : vide → le dossier par défaut des Paramètres est utilisé.
    try {
      setBusy(true);
      await addDownload({
        url: url.trim(),
        destDir: destDir.trim(),
        username: showAuth ? authUser.trim() : undefined,
        password: showAuth ? authPass : undefined,
      });
      setUrl("");
      setAuthUser("");
      setAuthPass("");
      onAdded();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitBatch() {
    if (!batchText.trim()) return;
    try {
      setBusy(true);
      setError(null);
      const n = await addBatch(batchText.trim(), destDir.trim());
      setBatchText("");
      onAdded();
      if (n === 0) setError("Aucune URL valide détectée.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="add-panel" aria-label="Ajouter un téléchargement">
      <div className="mode-switch">
        <button
          className={`chip ${!batchMode ? "active" : ""}`}
          onClick={() => setBatchMode(false)}
        >
          URL unique
        </button>
        <button
          className={`chip ${batchMode ? "active" : ""}`}
          onClick={() => setBatchMode(true)}
        >
          Lot / motif [1-100]
        </button>
      </div>

      {batchMode ? (
        <>
          <textarea
            className="input batch-area"
            placeholder={"Une URL ou un motif par ligne, ex. :\nhttps://ex.com/f[001-050].zip\nhttps://ex.com/autre.iso"}
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            rows={4}
          />
          <div className="add-row">
            <button className="btn ghost" onClick={chooseFolder} disabled={busy}>
              <Icon name="folder" size={16} />
              {destDir ? shorten(destDir) : "Dossier par défaut"}
            </button>
            <button className="btn primary" onClick={submitBatch} disabled={busy}>
              <Icon name="download" size={16} /> Télécharger le lot
            </button>
          </div>
        </>
      ) : (
        <div className="add-row">
          <input
            type="url"
            className="input url-input"
            placeholder="Collez une URL https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            aria-label="URL à télécharger"
          />
          <button className="btn ghost" onClick={chooseFolder} disabled={busy}>
            <Icon name="folder" size={16} />
            {destDir ? shorten(destDir) : "Dossier par défaut"}
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            <Icon name="download" size={16} /> Télécharger
          </button>
        </div>
      )}

      {!batchMode && (
        <div className="auth-block">
          <button
            type="button"
            className="auth-toggle"
            onClick={() => setShowAuth((v) => !v)}
            aria-expanded={showAuth}
          >
            {showAuth ? "▾" : "▸"} Authentification (lien protégé par mot de passe)
          </button>
          {showAuth && (
            <div className="auth-fields">
              <input
                type="text"
                className="input"
                placeholder="Nom d'utilisateur"
                value={authUser}
                autoComplete="off"
                onChange={(e) => setAuthUser(e.target.value)}
              />
              <input
                type="password"
                className="input"
                placeholder="Mot de passe"
                value={authPass}
                autoComplete="off"
                onChange={(e) => setAuthPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  );
}

function shorten(path: string): string {
  if (path.length <= 28) return path;
  return "…" + path.slice(-26);
}
