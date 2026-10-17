// Bouton flottant « Télécharger cette vidéo » (façon IDM), injecté sur les pages
// qui contiennent une vidéo (YouTube, Dailymotion, Vimeo, balises <video>…).
// Au clic, l'URL de la page est envoyée au service worker de l'extension, qui
// la transmet à RAKETA (yt-dlp). Fonction généraliste : aucun site n'est ciblé
// en particulier ; ne téléchargez que des contenus auxquels vous avez droit.
(function () {
  if (window.__raketaGrab) return;
  window.__raketaGrab = true;

  let dismissed = false;
  let lastUrl = location.href;

  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;top:12px;right:12px;z-index:2147483647;background:#1f6feb;color:#fff;padding:10px 14px;border-radius:8px;font:600 13px Segoe UI,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.5);";
    document.documentElement.appendChild(t);
    setTimeout(() => {
      try {
        t.remove();
      } catch (e) {
        /* déjà retiré */
      }
    }, 2600);
  }

  function send() {
    try {
      chrome.runtime.sendMessage(
        { type: "raketa-grab", url: location.href, kind: "media" },
        () => void chrome.runtime.lastError,
      );
      toast("Envoyé à RAKETA");
    } catch (e) {
      /* extension non disponible */
    }
  }

  // Le plus grand lecteur visible (vidéo native ou iframe de lecteur connu).
  function biggest() {
    let best = null;
    let area = 0;
    const consider = (el) => {
      const r = el.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area && r.width >= 220 && r.height >= 120 && r.bottom > 40 && r.top < innerHeight) {
        area = a;
        best = r;
      }
    };
    try {
      document.querySelectorAll("video").forEach(consider);
    } catch (e) {
      /* ignore */
    }
    if (!best) {
      try {
        document.querySelectorAll("iframe[src]").forEach((f) => {
          if (/youtube|youtube-nocookie|vimeo|dailymotion|player/i.test(f.src)) consider(f);
        });
      } catch (e) {
        /* ignore */
      }
    }
    return best;
  }

  function ensure() {
    let btn = document.getElementById("__raketa_float");
    if (dismissed) {
      if (btn) btn.remove();
      return;
    }
    const r = biggest();
    if (!r) {
      if (btn) btn.style.display = "none";
      return;
    }
    if (!btn) {
      btn = document.createElement("div");
      btn.id = "__raketa_float";
      btn.style.cssText =
        "position:fixed;z-index:2147483647;display:flex;align-items:center;gap:10px;background:rgba(31,111,235,.97);color:#fff;font:600 13px Segoe UI,Arial,sans-serif;padding:8px 12px;border-radius:9px;box-shadow:0 6px 18px rgba(0,0,0,.5);cursor:pointer;";
      const dl = document.createElement("span");
      dl.textContent = "⬇ Télécharger cette vidéo";
      const x = document.createElement("span");
      x.textContent = "✕";
      x.title = "Masquer";
      x.style.cssText = "opacity:.85;font-weight:700;padding:0 2px;";
      dl.onclick = send;
      x.onclick = (e) => {
        e.stopPropagation();
        dismissed = true;
        btn.remove();
      };
      btn.appendChild(dl);
      btn.appendChild(x);
      document.documentElement.appendChild(btn);
    }
    btn.style.display = "flex";
    btn.style.top = Math.max(8, r.top + 10) + "px";
    btn.style.left = r.left + r.width / 2 + "px";
    btn.style.transform = "translateX(-50%)";
  }

  // Réapparaît quand la page change (navigations SPA de YouTube & co.).
  function tick() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      dismissed = false;
    }
    ensure();
  }

  setInterval(tick, 1200);
  window.addEventListener("scroll", ensure, true);
  window.addEventListener("resize", ensure);

  // Grabber « autres téléchargements » : à la demande (menu contextuel), on
  // collecte les liens de fichiers de la page et on les envoie à RAKETA.
  const FILE_RE =
    /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|iso|img|bin|exe|msi|apk|xapk|dmg|pkg|deb|rpm|pdf|docx?|xlsx?|pptx?|mp3|flac|wav|m4a|aac|ogg|opus|mp4|mkv|avi|mov|webm|wmv|flv|ts|epub|mobi|psd|ai|csv|srt)(\?|#|$)/i;
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "collect-files") return;
      const seen = {};
      let n = 0;
      document.querySelectorAll("a[href]").forEach((a) => {
        const h = a.href || "";
        if (/^https?:/i.test(h) && FILE_RE.test(h) && !seen[h]) {
          seen[h] = 1;
          n++;
          chrome.runtime.sendMessage(
            { type: "raketa-grab", url: h, kind: "auto" },
            () => void chrome.runtime.lastError,
          );
        }
      });
      toast(n > 0 ? "Envoi de " + n + " fichier(s) à RAKETA" : "Aucun fichier détecté sur la page");
    });
  } catch (e) {
    /* hors extension */
  }
})();
