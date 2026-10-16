//! Pont navigateur : un petit serveur HTTP local (127.0.0.1) que l'extension
//! Chrome/Edge/Firefox contacte pour envoyer des liens à RAKETA (clic droit
//! « Télécharger avec RAKETA » ou capture automatique des téléchargements).
//!
//! Sécurité : écoute uniquement sur la boucle locale, et n'accepte les ajouts
//! que depuis une origine d'extension (`chrome-extension://` / `moz-extension://`),
//! ce qui empêche une page web quelconque de déclencher des téléchargements.

use crate::manager::AppState;
use std::io::Read;
use tauri::{AppHandle, Manager};

/// Port fixe du pont (connu de l'extension).
pub const BRIDGE_PORT: u16 = 47623;

/// Démarre le serveur du pont dans un thread dédié.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let server = match tiny_http::Server::http(("127.0.0.1", BRIDGE_PORT)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[raketa] pont navigateur indisponible : {e}");
                return;
            }
        };
        eprintln!("[raketa] pont navigateur à l'écoute sur http://127.0.0.1:{BRIDGE_PORT}");

        for mut req in server.incoming_requests() {
            let origin = req
                .headers()
                .iter()
                .find(|h| h.field.equiv("Origin"))
                .map(|h| h.value.as_str().to_string())
                .unwrap_or_default();
            let method = req.method().clone();
            let path = req.url().split('?').next().unwrap_or("").to_string();

            // Préflight CORS.
            if method == tiny_http::Method::Options {
                let _ = req.respond(cors(&origin, 204, ""));
                continue;
            }

            // Détection de présence par l'extension.
            if path == "/ping" {
                let _ = req.respond(cors(&origin, 200, "RAKETA"));
                continue;
            }

            // Ajout d'un lien.
            if path == "/add" && method == tiny_http::Method::Post {
                if !(origin.starts_with("chrome-extension://")
                    || origin.starts_with("moz-extension://"))
                {
                    let _ = req.respond(cors(&origin, 403, "origine non autorisée"));
                    continue;
                }
                let mut body = String::new();
                let _ = req.as_reader().read_to_string(&mut body);
                let v: serde_json::Value =
                    serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);

                match v.get("url").and_then(|x| x.as_str()) {
                    Some(u) if u.starts_with("http://") || u.starts_with("https://") => {
                        let app2 = app.clone();
                        let url = u.to_string();
                        tauri::async_runtime::spawn(async move {
                            let state = app2.state::<AppState>();
                            let _ = crate::commands::add_url(app2.clone(), state.inner(), url).await;
                        });
                        let _ = req.respond(cors(&origin, 200, "ok"));
                    }
                    _ => {
                        let _ = req.respond(cors(&origin, 400, "url manquante ou invalide"));
                    }
                }
                continue;
            }

            let _ = req.respond(cors(&origin, 404, "introuvable"));
        }
    });
}

/// Construit une réponse avec les en-têtes CORS adaptés.
fn cors(origin: &str, code: u16, body: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let allow = if origin.is_empty() { "*" } else { origin };
    let header = |n: &str, v: &str| tiny_http::Header::from_bytes(n.as_bytes(), v.as_bytes()).unwrap();
    tiny_http::Response::from_string(body.to_string())
        .with_status_code(code)
        .with_header(header("Access-Control-Allow-Origin", allow))
        .with_header(header("Access-Control-Allow-Methods", "POST, GET, OPTIONS"))
        .with_header(header("Access-Control-Allow-Headers", "Content-Type"))
        .with_header(header("Content-Type", "text/plain; charset=utf-8"))
}
