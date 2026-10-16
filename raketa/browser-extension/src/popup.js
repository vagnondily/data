// Popup de l'extension RAKETA : état de connexion + bascule « capture auto ».

const RAKETA = "http://127.0.0.1:47623";

const statusEl = document.getElementById("status");
const autoEl = document.getElementById("auto");

// État de connexion à l'application.
(async function ping() {
  try {
    const r = await fetch(RAKETA + "/ping");
    if (r.ok) {
      statusEl.textContent = "✓ RAKETA est connecté";
      statusEl.className = "status ok";
      return;
    }
    throw new Error();
  } catch {
    statusEl.textContent = "✗ RAKETA n'est pas lancé";
    statusEl.className = "status ko";
  }
})();

// Bascule de la capture automatique (persistée).
chrome.storage.local.get({ autoCapture: true }, (cfg) => {
  autoEl.checked = cfg.autoCapture;
});
autoEl.addEventListener("change", () => {
  chrome.storage.local.set({ autoCapture: autoEl.checked });
});
