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

  // Titre « propre » de la page pour l'en-tête du menu (façon vrai grabber).
  function pageTitle() {
    let t = (document.title || "").replace(
      /\s*[-–|]\s*(YouTube|Vimeo|Dailymotion|SoundCloud).*$/i,
      "",
    );
    t = t.replace(/^\(\d+\)\s*/, "").trim(); // retire le « (3) » des notifications
    return t.length > 70 ? t.slice(0, 67) + "…" : t;
  }

  // Menu de qualités (style IDM) ancré sous le bouton flottant : en-tête de
  // marque, titre détecté, puis une ligne par qualité. RAKETA mappe chaque
  // qualité vers le bon format yt-dlp.
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
      (r.bottom + 8) +
      "px;left:" +
      r.left +
      "px;min-width:286px;max-width:340px;background:#0f1216;border:1px solid #2a2f37;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.62);overflow:hidden;font-family:Segoe UI,Arial,sans-serif;";

    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:11px 13px;background:linear-gradient(90deg,#1f6feb,#1559c7);color:#fff;";
    head.innerHTML =
      '<span style="font-size:15px">🚀</span><span style="font-weight:700;font-size:13px;letter-spacing:.2px">Télécharger avec RAKETA</span>';
    m.appendChild(head);

    const title = pageTitle();
    if (title) {
      const sub = document.createElement("div");
      sub.textContent = title;
      sub.style.cssText =
        "padding:8px 13px;color:#aeb6c2;font-size:12px;border-bottom:1px solid #20242b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      m.appendChild(sub);
    }

    const list = document.createElement("div");
    list.style.cssText = "padding:6px;display:flex;flex-direction:column;gap:1px;";
    const row = (icon, label, hint, quality) => {
      const b = document.createElement("button");
      b.style.cssText =
        "display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:transparent;color:#e8eaed;border:0;border-radius:8px;padding:9px 10px;cursor:pointer;font:600 13px Segoe UI,Arial,sans-serif;";
      b.onmouseenter = () => (b.style.background = "#1b2430");
      b.onmouseleave = () => (b.style.background = "transparent");
      b.innerHTML =
        '<span style="font-size:15px;width:18px;text-align:center">' +
        icon +
        '</span><span style="flex:1">' +
        label +
        "</span>" +
        (hint
          ? '<span style="color:#7d8694;font-weight:600;font-size:11px">' + hint + "</span>"
          : "");
      b.onclick = () => {
        m.remove();
        send(quality);
      };
      return b;
    };
    list.appendChild(row("🎬", "Meilleure qualité", "auto", "auto"));
    list.appendChild(row("🎬", "4K Ultra HD", "2160p", "2160"));
    list.appendChild(row("🎬", "2K", "1440p", "1440"));
    list.appendChild(row("🎬", "Full HD", "1080p", "1080"));
    list.appendChild(row("🎬", "HD", "720p", "720"));
    list.appendChild(row("🎬", "Standard", "480p", "480"));
    list.appendChild(row("🎵", "Audio seul", "MP3", "audio"));
    m.appendChild(list);

    document.documentElement.appendChild(m);
    // Reste dans l'écran horizontalement.
    const mr = m.getBoundingClientRect();
    if (mr.right > innerWidth - 8) {
      m.style.left = Math.max(8, innerWidth - mr.width - 8) + "px";
    }

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
        "position:fixed;z-index:2147483647;display:flex;align-items:center;gap:9px;background:linear-gradient(90deg,#1f6feb,#1559c7);color:#fff;font:700 13px Segoe UI,Arial,sans-serif;padding:9px 13px;border-radius:11px;box-shadow:0 8px 22px rgba(15,90,220,.5);cursor:pointer;border:1px solid rgba(255,255,255,.14);transition:transform .12s ease,box-shadow .12s ease;";
      btn.onmouseenter = () => {
        btn.style.transform = "translateX(-50%) translateY(-1px)";
        btn.style.boxShadow = "0 12px 28px rgba(15,90,220,.6)";
      };
      btn.onmouseleave = () => {
        btn.style.transform = "translateX(-50%)";
        btn.style.boxShadow = "0 8px 22px rgba(15,90,220,.5)";
      };
      const dl = document.createElement("span");
      dl.innerHTML = '🚀&nbsp; Télécharger cette vidéo <span style="opacity:.8">▾</span>';
      const x = document.createElement("span");
      x.textContent = "✕";
      x.title = "Masquer";
      x.style.cssText = "opacity:.8;font-weight:700;padding:0 2px;margin-left:2px;";
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
