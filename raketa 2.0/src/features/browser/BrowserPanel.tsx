import { useState } from "react";
import { openBrowser, openExternalUrl } from "../../lib/api";

// Accès rapides vers des sites légitimes (démo du grabber et contenus libres).
const QUICK_LINKS = [
  { label: "YouTube", url: "https://www.youtube.com" },
  { label: "Archive.org", url: "https://archive.org" },
  { label: "Linux ISOs", url: "https://distrowatch.com" },
];

// Panneau Navigateur : ouvre un navigateur intégré qui capture les
// téléchargements vers le moteur RAKETA et bloque les popups.
export function BrowserPanel() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function normalize(target?: string): string {
    let u = (target ?? url).trim();
    if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }

  async function go(target?: string) {
    const u = normalize(target);
    if (!u) return;
    try {
      setError(null);
      await openBrowser(u);
    } catch (e) {
      setError(String(e));
    }
  }

  async function goExternal() {
    const u = normalize();
    if (!u) return;
    try {
      setError(null);
      await openExternalUrl(u);
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
        <button
          className="btn ghost"
          onClick={goExternal}
          title="Ouvrir dans Chrome/Edge (pour les sites à vérification de sécurité)"
        >
          Navigateur système
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
        Sur une vidéo (YouTube, etc.), le bouton <strong>« Télécharger cette
        vidéo »</strong> apparaît sur le lecteur, avec le choix <strong>vidéo ou
        audio (MP3)</strong>. Le bouton <strong>« Récupérer »</strong> (en haut)
        détecte aussi les fichiers de la page. Tout est <strong>capté par
        RAKETA</strong> (moteur rapide multi-segments).
        <br />
        La barre du haut s'auto-masque pour laisser le site en pleine hauteur :
        amenez la souris tout en haut, ou cliquez la languette
        <strong> « ▾ RAKETA »</strong>, pour la retrouver.
        <br />
        ⚠️ Si une <strong>« Vérification de sécurité » tourne sans finir</strong>,
        cliquez <strong>« Navigateur système »</strong> pour ouvrir le site dans
        Chrome/Edge.
        <br />
        <span className="hint">
          RAKETA est un téléchargeur généraliste : ne téléchargez que des contenus
          auxquels vous avez droit.
        </span>
      </p>
    </section>
  );
}
