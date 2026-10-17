// Service worker de l'extension RAKETA (Manifest V3).
//
// Deux modes, façon IDM :
//  1) Clic droit « Télécharger avec RAKETA » sur un lien / une image / une
//     vidéo / une page.
//  2) Capture automatique : intercepte les téléchargements du navigateur et les
//     renvoie à RAKETA (activable/désactivable depuis la popup).
//
// La communication se fait avec le serveur local de RAKETA (127.0.0.1:47623).

const RAKETA = "http://127.0.0.1:47623";

// --- Envoi d'un lien à RAKETA -------------------------------------------------

// kind : "auto" (lien direct), "media" (vidéo → yt-dlp) ou "torrent".
// quality : "auto" (vidéo) | "audio" (MP3) — seulement pour les médias.
async function sendToRaketa(url, kind, quality) {
  const resp = await fetch(RAKETA + "/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, kind: kind || "auto", quality: quality || "auto" }),
  });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
}

async function raketaRunning() {
  try {
    const r = await fetch(RAKETA + "/ping", { method: "GET" });
    return r.ok;
  } catch {
    return false;
  }
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      title,
      message,
    });
  } catch {
    /* notifications indisponibles */
  }
}

async function capture(url, kind, quality) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await sendToRaketa(url, kind, quality);
    return true;
  } catch {
    notify("RAKETA", "RAKETA n'est pas lancé. Démarre l'application puis réessaie.");
    return false;
  }
}

// --- Menu contextuel ----------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "raketa-download",
    title: "Télécharger avec RAKETA",
    contexts: ["link", "image", "video", "audio", "selection", "page"],
  });
  // Récupère la vidéo de la page (ou du lecteur embarqué) via yt-dlp — façon
  // « grabber » : on vise la page/l'iframe, pas un lien de fichier direct.
  chrome.contextMenus.create({
    id: "raketa-grab-video",
    title: "Récupérer la vidéo avec RAKETA",
    contexts: ["page", "video", "frame", "link"],
  });
  // Grabber « autres téléchargements » : récupère tous les fichiers de la page
  // (archives, ISO, PDF, exe, audio…) en une fois, façon « Download all links ».
  chrome.contextMenus.create({
    id: "raketa-grab-files",
    title: "Récupérer les fichiers de la page (RAKETA)",
    contexts: ["page", "frame"],
  });
  // Capture automatique activée par défaut.
  chrome.storage.local.get({ autoCapture: true }, () => {});
});

// Bouton flottant « Télécharger cette vidéo » (content script) : il nous envoie
// l'URL de la page, qu'on transmet au téléchargeur média de RAKETA.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "raketa-grab" && msg.url) {
    capture(msg.url, msg.kind || "media", msg.quality || "auto");
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "raketa-grab-video") {
    // Page ou lecteur embarqué : yt-dlp sait extraire la vidéo. On évite les
    // blob: (non téléchargeables) en préférant l'iframe puis la page.
    const url = info.frameUrl || info.pageUrl || info.linkUrl;
    if (url) capture(url, "media");
    return;
  }
  if (info.menuItemId === "raketa-grab-files") {
    // Le content script collecte les liens de fichiers et nous les renvoie.
    if (tab && tab.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: "collect-files" }, () => void chrome.runtime.lastError);
    }
    return;
  }
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (url) capture(url);
});

// --- Capture automatique des téléchargements ---------------------------------

// Garde anti-rafale : certaines pages (publicités agressives) déclenchent des
// dizaines de téléchargements d'un coup. On évite d'inonder RAKETA.
let recentCaptures = [];
function burstOk() {
  const now = Date.now();
  recentCaptures = recentCaptures.filter((t) => now - t < 6000);
  if (recentCaptures.length >= 8) return false;
  recentCaptures.push(now);
  return true;
}

chrome.downloads.onCreated.addListener(async (item) => {
  const url = item.finalUrl || item.url || "";
  if (!/^https?:\/\//i.test(url)) return;

  const { autoCapture } = await chrome.storage.local.get({ autoCapture: true });
  if (!autoCapture) return;

  // Trop de téléchargements en quelques secondes → on laisse le navigateur
  // gérer (probable rafale publicitaire), pour ne pas remplir RAKETA de déchets.
  if (!burstOk()) return;

  // On ne « vole » le téléchargement que si RAKETA est joignable.
  if (!(await raketaRunning())) return;

  try {
    await chrome.downloads.cancel(item.id);
    await chrome.downloads.erase({ id: item.id });
  } catch {
    /* déjà terminé / non annulable */
  }
  await capture(url);
});
