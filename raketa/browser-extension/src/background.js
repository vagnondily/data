// Service worker de l'extension RAKETA (Manifest V3) — ébauche de la phase P6.
//
// Rôle : intercepter les téléchargements du navigateur et proposer de les
// transférer vers l'hôte natif RAKETA via Native Messaging. L'utilisateur
// garde le contrôle : aucune interception silencieuse, consentement requis
// avant tout transfert de cookies ou d'en-têtes sensibles (section 12).

const NATIVE_HOST = "com.smartserviceandroy.raketa";

// Clic sur l'icône : envoie l'onglet courant (best-effort) à l'hôte natif.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.url) return;
  await sendToHost({ type: "capture", url: tab.url, title: tab.title ?? "" });
});

// Interception des téléchargements déclenchés par le navigateur.
chrome.downloads.onCreated.addListener(async (item) => {
  // On ne capture que http/https (jamais blob:/data: ni fichiers locaux).
  if (!/^https?:\/\//i.test(item.finalUrl || item.url || "")) return;

  // Ébauche : on laisse le navigateur gérer pour l'instant, mais on notifie
  // l'hôte natif qu'un transfert est disponible. L'arbitrage « prendre la main »
  // sera ajouté avec une confirmation utilisateur explicite.
  await sendToHost({
    type: "download-available",
    url: item.finalUrl || item.url,
    filename: item.filename || "",
    mime: item.mime || "",
  });
});

async function sendToHost(message) {
  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, message);
    console.debug("[RAKETA] réponse hôte natif", response);
  } catch (err) {
    // L'application n'est peut-être pas installée : on reste silencieux et
    // l'application reste utilisable manuellement (critère « Extension absente »).
    console.debug("[RAKETA] hôte natif indisponible", err?.message);
  }
}
