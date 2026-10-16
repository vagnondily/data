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

async function sendToRaketa(url) {
  const resp = await fetch(RAKETA + "/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
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

async function capture(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    await sendToRaketa(url);
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
  // Capture automatique activée par défaut.
  chrome.storage.local.get({ autoCapture: true }, () => {});
});

chrome.contextMenus.onClicked.addListener((info) => {
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
