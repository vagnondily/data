import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { addBatch, addDownload } from "../../lib/api";

interface Props {
  onAdded: () => void;
  // URL pré-remplie (ex. depuis le presse-papiers).
  prefillUrl?: string;
}

// Zone de commande : coller une URL, choisir la destination, lancer (section 11.1).
export function AddDownload({ onAdded, prefillUrl }: Props) {
  const [url, setUrl] = useState(prefillUrl ?? "");
  const [destDir, setDestDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [batchText, setBatchText] = useState("");

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
    if (!destDir.trim()) {
      setError("Choisissez un dossier de destination.");
      return;
    }
    try {
      setBusy(true);
      await addDownload({ url: url.trim(), destDir: destDir.trim() });
      setUrl("");
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
              {destDir ? "📁 " + shorten(destDir) : "Choisir le dossier"}
            </button>
            <button className="btn primary" onClick={submitBatch} disabled={busy}>
              Télécharger le lot
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
            {destDir ? "📁 " + shorten(destDir) : "Choisir le dossier"}
          </button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            Télécharger
          </button>
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
