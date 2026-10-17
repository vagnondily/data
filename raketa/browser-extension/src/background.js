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
async function sendToRaketa(url, kind) {
  const resp = await fetch(RAKETA + "/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, kind: kind || "auto" }),
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

async function capture(url, kind) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await sendToRaketa(url, kind);
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
  // Capture automatique activée par défaut.
  chrome.storage.local.get({ autoCapture: true }, () => {});
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "raketa-grab-video") {
    // Page ou lecteur embarqué : yt-dlp sait extraire la vidéo. On évite les
    // blob: (non téléchargeables) en préférant l'iframe puis la page.
    const url = info.frameUrl || info.pageUrl || info.linkUrl;
    if (url) capture(url, "media");
    return;
  }
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (url) capture(url);
});

// --- Capture automatique des téléchargements ---------------------------------

chrome.downloads.onCreated.addListener(async (item) => {
  const url = item.finalUrl || item.url || "";
  if (!/^https?:\/\//i.test(url)) return;

  const { autoCapture } = await chrome.storage.local.get({ autoCapture: true });
  if (!autoCapture) return;

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
