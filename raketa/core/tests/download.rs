//! Tests d'intégration du moteur (section 14 — critères d'acceptation).
//!
//! Un petit serveur HTTP/1.1 local sert un contenu connu, avec support des
//! requêtes `Range`, et peut simuler une coupure réseau à mi-parcours. On vérifie
//! que RAKETA télécharge correctement, reprend sans corruption, respecte un nom
//! malveillant et gère un serveur sans `Range`.

use raketa_core::model::{Control, DownloadTask};
use raketa_core::{hash, Engine, EngineConfig, Outcome};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

/// Contenu de test déterministe (~512 Ko).
fn payload() -> Vec<u8> {
    (0..512 * 1024).map(|i| (i % 251) as u8).collect()
}

fn sha_hex(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Options du faux serveur.
#[derive(Clone)]
struct ServerOpts {
    /// Annonce et honore `Accept-Ranges: bytes`.
    support_ranges: bool,
    /// Coupe la connexion après ~la moitié du contenu (une seule fois).
    cut_once: Arc<AtomicBool>,
}

/// Démarre un serveur à usage unique sur un port éphémère ; renvoie son URL base.
fn start_server(opts: ServerOpts) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let body = payload();

    thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let body = body.clone();
            let opts = opts.clone();
            thread::spawn(move || handle(stream, body, opts));
        }
    });

    format!("http://{addr}/fichier.bin")
}

fn handle(mut stream: TcpStream, body: Vec<u8>, opts: ServerOpts) {
    // Lecture de la requête (jusqu'à l'en-tête vide).
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]);

    // Analyse d'un éventuel en-tête Range: bytes=START-END (END optionnel).
    let range = req
        .lines()
        .find(|l| l.to_lowercase().starts_with("range:"))
        .and_then(|l| l.split('=').nth(1))
        .map(|r| {
            let mut it = r.trim().split('-');
            let s = it.next().and_then(|x| x.trim().parse::<u64>().ok());
            let e = it.next().and_then(|x| x.trim().parse::<u64>().ok());
            (s, e)
        });

    let total = body.len() as u64;

    let (status, start, end) = match (opts.support_ranges, range) {
        (true, Some((Some(s), e))) if s < total => {
            // Borne haute honorée (défaut : fin du fichier).
            let end = e.unwrap_or(total - 1).min(total - 1);
            ("206 Partial Content", s, end)
        }
        (true, Some((Some(s), _))) if s >= total => {
            // 416 : plage non satisfiable.
            let resp = format!(
                "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{total}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
            let _ = stream.write_all(resp.as_bytes());
            return;
        }
        _ => ("200 OK", 0u64, total - 1),
    };

    let slice = &body[start as usize..=(end as usize)];
    let content_len = slice.len() as u64;

    // En-têtes.
    let mut headers = format!("HTTP/1.1 {status}\r\n");
    headers.push_str("Content-Type: application/octet-stream\r\n");
    headers.push_str("ETag: \"v1-raketa\"\r\n");
    if opts.support_ranges {
        headers.push_str("Accept-Ranges: bytes\r\n");
    }
    if status.starts_with("206") {
        headers.push_str(&format!("Content-Range: bytes {start}-{end}/{total}\r\n"));
    }
    headers.push_str(&format!("Content-Length: {content_len}\r\n"));
    headers.push_str("Connection: close\r\n\r\n");
    if stream.write_all(headers.as_bytes()).is_err() {
        return;
    }

    // Corps : coupure simulée une seule fois, à mi-parcours.
    if opts.cut_once.swap(false, Ordering::SeqCst) {
        let half = slice.len() / 2;
        let _ = stream.write_all(&slice[..half]);
        let _ = stream.flush();
        // On ferme brutalement : le client doit percevoir une fin inattendue.
        return;
    }

    let _ = stream.write_all(slice);
    let _ = stream.flush();
}

fn noop_progress() -> raketa_core::ProgressFn {
    Arc::new(|_p| {})
}

#[tokio::test]
async fn telechargement_simple_integrite_ok() {
    let url = start_server(ServerOpts {
        support_ranges: true,
        cut_once: Arc::new(AtomicBool::new(false)),
    });
    let dir = tempfile::tempdir().unwrap();
    let data = payload();

    let engine = Engine::new().unwrap();
    let task = DownloadTask {
        id: "t1".into(),
        url,
        dest_dir: dir.path().display().to_string(),
        filename: None,
        // On impose l'empreinte attendue : le moteur DOIT la valider.
        expected_sha256: Some(sha_hex(&data)),
        auth: None,
    };

    let outcome = engine
        .download(&task, Control::new(), noop_progress())
        .await
        .expect("téléchargement réussi");

    match outcome {
        Outcome::Completed { path, bytes, sha256 } => {
            assert_eq!(bytes, data.len() as u64);
            assert_eq!(sha256.unwrap(), sha_hex(&data));
            // Le fichier final existe et correspond octet pour octet.
            let on_disk = std::fs::read(&path).unwrap();
            assert_eq!(on_disk, data, "le fichier doit être identique à la référence");
            // Plus aucun fichier .part ne traîne.
            assert!(!std::path::Path::new(&format!("{path}.rkt-part")).exists());
        }
        other => panic!("attendu Completed, obtenu {other:?}"),
    }
}

#[tokio::test]
async fn reprise_apres_coupure_sans_corruption() {
    // Le serveur coupe la connexion une fois à mi-chemin ; le moteur doit
    // reprendre via Range et produire un fichier identique à la référence.
    let url = start_server(ServerOpts {
        support_ranges: true,
        cut_once: Arc::new(AtomicBool::new(true)),
    });
    let dir = tempfile::tempdir().unwrap();
    let data = payload();

    let engine = Engine::new().unwrap();
    let task = DownloadTask {
        id: "t2".into(),
        url,
        dest_dir: dir.path().display().to_string(),
        filename: Some("resume.bin".into()),
        expected_sha256: Some(sha_hex(&data)),
        auth: None,
    };

    let outcome = engine
        .download(&task, Control::new(), noop_progress())
        .await
        .expect("le moteur doit reprendre et terminer");

    if let Outcome::Completed { path, bytes, sha256 } = outcome {
        assert_eq!(bytes, data.len() as u64);
        assert_eq!(sha256.unwrap(), sha_hex(&data));
        let on_disk = std::fs::read(&path).unwrap();
        assert_eq!(on_disk, data, "reprise sans corruption");
    } else {
        panic!("attendu Completed");
    }
}

// Config forçant le multi-segments même sur un petit fichier de test.
fn seg_config() -> EngineConfig {
    EngineConfig {
        connections: 4,
        segment_threshold: 64 * 1024,
        min_segment_size: 16 * 1024,
        ..Default::default()
    }
}

fn no_part_files(dir: &std::path::Path) -> bool {
    std::fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .all(|e| !e.file_name().to_string_lossy().contains(".rkt-part"))
}

#[tokio::test]
async fn telechargement_multisegments_integrite_ok() {
    // 4 segments parallèles ; le résultat doit être identique et vérifié.
    let url = start_server(ServerOpts {
        support_ranges: true,
        cut_once: Arc::new(AtomicBool::new(false)),
    });
    let dir = tempfile::tempdir().unwrap();
    let data = payload();

    let engine = Engine::with_config(seg_config()).unwrap();
    let task = DownloadTask {
        id: "seg1".into(),
        url,
        dest_dir: dir.path().display().to_string(),
        filename: Some("multi.bin".into()),
        expected_sha256: Some(sha_hex(&data)),
        auth: None,
    };

    let outcome = engine
        .download(&task, Control::new(), noop_progress())
        .await
        .expect("multi-segments réussi");

    if let Outcome::Completed { path, bytes, sha256 } = outcome {
        assert_eq!(bytes, data.len() as u64);
        assert_eq!(sha256.unwrap(), sha_hex(&data));
        assert_eq!(std::fs::read(&path).unwrap(), data, "fichier identique à la référence");
        assert!(no_part_files(dir.path()), "les fichiers .part.N doivent être nettoyés");
    } else {
        panic!("attendu Completed");
    }
}

#[tokio::test]
async fn multisegments_reprise_sous_parallelisme() {
    // Une des connexions parallèles est coupée : le segment concerné doit
    // reprendre via Range et l'assemblage rester correct.
    let url = start_server(ServerOpts {
        support_ranges: true,
        cut_once: Arc::new(AtomicBool::new(true)),
    });
    let dir = tempfile::tempdir().unwrap();
    let data = payload();

    let engine = Engine::with_config(seg_config()).unwrap();
    let task = DownloadTask {
        id: "seg2".into(),
        url,
        dest_dir: dir.path().display().to_string(),
        filename: Some("multi-resume.bin".into()),
        expected_sha256: Some(sha_hex(&data)),
        auth: None,
    };

    let outcome = engine
        .download(&task, Control::new(), noop_progress())
        .await
        .expect("reprise multi-segments réussie");

    if let Outcome::Completed { path, .. } = outcome {
        assert_eq!(std::fs::read(&path).unwrap(), data, "assemblage sans corruption");
    } else {
        panic!("attendu Completed");
    }
}

#[tokio::test]
async fn serveur_sans_range_mono_flux() {
    // Serveur qui ignore Range : téléchargement mono-flux, sans corruption.
    let url = start_server(ServerOpts {
        support_ranges: false,
        cut_once: Arc::new(AtomicBool::new(false)),
    });
    let dir = tempfile::tempdir().unwrap();
    let data = payload();

    let engine = Engine::new().unwrap();
    let task = DownloadTask {
        id: "t3".into(),
        url,
        dest_dir: dir.path().display().to_string(),
        filename: None,
        expected_sha256: None,
        auth: None,
    };

    let outcome = engine
        .download(&task, Control::new(), noop_progress())
        .await
        .unwrap();

    if let Outcome::Completed { path, .. } = outcome {
        let on_disk = std::fs::read(&path).unwrap();
        assert_eq!(on_disk, data);
    } else {
        panic!("attendu Completed");
    }
}

#[tokio::test]
async fn nom_malveillant_reste_dans_le_dossier() {
    // Un nom de fichier type « path traversal » ne doit jamais sortir du dossier.
    let url = start_server(ServerOpts {
        support_ranges: true,
        cut_once: Arc::new(AtomicBool::new(false)),
    });
    let dir = tempfile::tempdir().unwrap();

    let engine = Engine::new().unwrap();
    let task = DownloadTask {
        id: "t4".into(),
        url,
        dest_dir: dir.path().display().to_string(),
        filename: Some("../../../../etc/passwd".into()),
        expected_sha256: None,
        auth: None,
    };

    let outcome = engine
        .download(&task, Control::new(), noop_progress())
        .await
        .unwrap();

    if let Outcome::Completed { path, .. } = outcome {
        let p = std::path::Path::new(&path);
        // Le fichier final est bien DANS le dossier de destination.
        assert!(p.starts_with(dir.path()), "le fichier doit rester dans {dir:?}");
        assert_eq!(p.file_name().unwrap().to_str().unwrap(), "passwd");
    } else {
        panic!("attendu Completed");
    }
}

#[tokio::test]
async fn hash_fichier_coherent() {
    let dir = tempfile::tempdir().unwrap();
    let f = dir.path().join("x.bin");
    let data = payload();
    std::fs::write(&f, &data).unwrap();
    let digest = hash::sha256_file(&f).await.unwrap();
    assert_eq!(digest, sha_hex(&data));
}
