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

  function send(quality) {
    try {
      chrome.runtime.sendMessage(
        { type: "raketa-grab", url: location.href, kind: "media", quality: quality || "auto" },
        () => void chrome.runtime.lastError,
      );
      toast("Envoyé à RAKETA");
    } catch (e) {
      /* extension non disponible */
    }
  }

  // Petit menu Vidéo / Audio ancré sous le bouton flottant.
  function showMenu(anchor) {
    const old = document.getElementById("__raketa_fmenu");
    if (old) {
      old.remove();
      return;
    }
    const r = anchor.getBoundingClientRect();
    const m = document.createElement("div");
    m.id = "__raketa_fmenu";
    m.style.cssText =
      "position:fixed;z-index:2147483647;top:" +
      (r.bottom + 6) +
      "px;left:" +
      r.left +
      "px;background:#14161a;border:1px solid #272b33;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.5);padding:6px;display:flex;flex-direction:column;gap:4px;min-width:210px;font:600 13px Segoe UI,Arial,sans-serif;";
    const opt = (label, quality) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "text-align:left;background:#1c1f25;color:#e8eaed;border:1px solid #272b33;border-radius:7px;padding:9px 10px;cursor:pointer;font:600 13px Segoe UI,Arial,sans-serif;";
      b.onclick = () => {
        m.remove();
        send(quality);
      };
      return b;
    };
    m.appendChild(opt("🎬 Vidéo (meilleure qualité)", "auto"));
    m.appendChild(opt("🎵 Audio seul (MP3)", "audio"));
    document.documentElement.appendChild(m);
    setTimeout(() => {
      document.addEventListener("mousedown", function h(e) {
        if (!m.contains(e.target) && e.target !== anchor) {
          try {
            m.remove();
          } catch (_) {
            /* déjà retiré */
          }
          document.removeEventListener("mousedown", h);
        }
      });
    }, 0);
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
      dl.onclick = (e) => {
        e.stopPropagation();
        showMenu(btn);
      };
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
      const urls = [];
      document.querySelectorAll("a[href]").forEach((a) => {
        const h = a.href || "";
        if (/^https?:/i.test(h) && FILE_RE.test(h) && !seen[h]) {
          seen[h] = 1;
          urls.push(h);
        }
      });
      if (urls.length === 0) {
        toast("Aucun fichier détecté sur la page");
        return;
      }
      // Confirmation au-delà de quelques fichiers : évite d'envoyer en masse
      // des liens publicitaires sur les pages qui en débordent.
      if (urls.length > 5 && !confirm("Récupérer " + urls.length + " fichiers avec RAKETA ?")) return;
      urls.forEach((h) =>
        chrome.runtime.sendMessage(
          { type: "raketa-grab", url: h, kind: "auto" },
          () => void chrome.runtime.lastError,
        ),
      );
      toast("Envoi de " + urls.length + " fichier(s) à RAKETA");
    });
  } catch (e) {
    /* hors extension */
  }
})();
