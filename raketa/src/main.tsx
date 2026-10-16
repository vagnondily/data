import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/styles.css";

// Désactive le menu contextuel natif (WebView2) dans l'app, sauf dans les
// champs de saisie (pour garder le copier/coller). RAKETA affiche son propre
// menu sur les lignes de téléchargement.
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
