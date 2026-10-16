import { useState } from "react";
import { openBrowser } from "../../lib/api";

// Accès rapides courants (sites légitimes de contenus volumineux).
const QUICK_LINKS = [
  { label: "Archive.org", url: "https://archive.org" },
  { label: "Linux ISOs", url: "https://distrowatch.com" },
  { label: "SuperPSX", url: "https://www.superpsx.com" },
];

// Panneau Navigateur : ouvre un navigateur intégré qui capture les
// téléchargements vers le moteur RAKETA et bloque les popups.
export function BrowserPanel() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function go(target?: string) {
    let u = (target ?? url).trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try {
      setError(null);
      await openBrowser(u);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="add-panel" aria-label="Navigateur intégré">
      <div className="add-row">
        <input
          type="text"
          className="input url-input"
          placeholder="Adresse du site (ex. superpsx.com)…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          aria-label="Adresse à ouvrir"
        />
        <button className="btn primary" onClick={() => go()}>
          Ouvrir
        </button>
      </div>

      <div className="quick-links">
        {QUICK_LINKS.map((q) => (
          <button key={q.url} className="btn ghost tiny" onClick={() => go(q.url)}>
            {q.label}
          </button>
        ))}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <p className="browser-note">
        🧲 Les téléchargements lancés dans cette fenêtre sont <strong>captés par
        RAKETA</strong> (moteur rapide multi-segments). Les popups/pubs intrusives
        sont bloqués si l'option est active dans les Paramètres.
        <br />
        <span className="hint">
          RAKETA est un téléchargeur généraliste : ne téléchargez que des contenus
          auxquels vous avez droit.
        </span>
      </p>
    </section>
  );
}
