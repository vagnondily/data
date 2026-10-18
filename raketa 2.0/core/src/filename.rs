//! Choix d'un nom de fichier sûr (section 9.1, étape 3 + sécurité section 12).
//!
//! Objectifs :
//! - jamais de « path traversal » (`..`, séparateurs, chemins absolus) ;
//! - neutraliser les caractères interdits sous Windows ;
//! - éviter l'écrasement silencieux (FR-07) via un suffixe « (n) ».

use std::path::{Path, PathBuf};

/// Caractères interdits dans un nom de fichier Windows.
const FORBIDDEN: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

/// Noms réservés sous Windows (insensibles à la casse, avec ou sans extension).
const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Nettoie un nom de fichier candidat pour qu'il soit sûr et portable.
pub fn sanitize(raw: &str) -> String {
    // On ne garde que le dernier segment : neutralise tout chemin.
    let base = raw
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(raw)
        .trim()
        .trim_matches('.'); // Windows refuse les noms terminés par un point.

    let mut cleaned: String = base
        .chars()
        .map(|c| {
            if FORBIDDEN.contains(&c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();

    if cleaned.is_empty() {
        cleaned = "fichier".to_string();
    }

    // Protège les noms réservés en préfixant un underscore.
    let stem = cleaned.split('.').next().unwrap_or(&cleaned).to_lowercase();
    if RESERVED.contains(&stem.as_str()) {
        cleaned = format!("_{cleaned}");
    }

    // Borne la longueur (255 est la limite usuelle d'un composant de chemin).
    if cleaned.len() > 200 {
        cleaned.truncate(200);
    }

    cleaned
}

/// Dérive un nom de fichier à partir d'un en-tête Content-Disposition.
///
/// Gère `filename="..."` et `filename*=UTF-8''...` (RFC 5987, décodage simple).
pub fn from_content_disposition(header: &str) -> Option<String> {
    // Variante étendue prioritaire : filename*=charset'lang'valeur
    if let Some(idx) = header.to_lowercase().find("filename*=") {
        let rest = &header[idx + "filename*=".len()..];
        let value = rest.split(';').next().unwrap_or(rest).trim();
        // On saute « charset'lang' » puis on décode le pourcentage.
        let encoded = value.splitn(3, '\'').nth(2).unwrap_or(value);
        let decoded = percent_decode(encoded);
        let name = sanitize(&decoded);
        if !name.is_empty() {
            return Some(name);
        }
    }

    if let Some(idx) = header.to_lowercase().find("filename=") {
        let rest = &header[idx + "filename=".len()..];
        let value = rest
            .split(';')
            .next()
            .unwrap_or(rest)
            .trim()
            .trim_matches('"');
        let name = sanitize(value);
        if !name.is_empty() {
            return Some(name);
        }
    }

    None
}

/// Dérive un nom de fichier depuis le chemin d'une URL.
pub fn from_url(url: &str) -> String {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let last = path.rsplit('/').next().unwrap_or("");
    let decoded = percent_decode(last);
    let name = sanitize(&decoded);
    if name.is_empty() || !name.contains('.') && name == "fichier" {
        "telechargement".to_string()
    } else {
        name
    }
}

/// Résout un chemin final en évitant d'écraser un fichier existant (FR-07).
///
/// `rapport.pdf` → `rapport (1).pdf` → `rapport (2).pdf`, etc.
pub fn unique_destination(dir: &Path, filename: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }

    let (stem, ext) = match filename.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (filename.to_string(), String::new()),
    };

    for n in 1..100_000 {
        let candidate = dir.join(format!("{stem} ({n}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    // Repli extrêmement improbable.
    dir.join(format!("{stem}-{}{ext}", uuid::Uuid::new_v4()))
}

/// Décodage « percent-encoding » minimal (suffisant pour les noms de fichiers).
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutralise_le_path_traversal() {
        assert_eq!(sanitize("../../etc/passwd"), "passwd");
        assert_eq!(sanitize("..\\..\\windows\\system32\\cmd.exe"), "cmd.exe");
        assert!(!sanitize("a/b/c").contains('/'));
    }

    #[test]
    fn remplace_les_caracteres_interdits() {
        assert_eq!(sanitize("fichier:test?.txt"), "fichier_test_.txt");
    }

    #[test]
    fn protege_les_noms_reserves() {
        assert_eq!(sanitize("CON"), "_CON");
        assert_eq!(sanitize("nul.txt"), "_nul.txt");
    }

    #[test]
    fn extrait_depuis_content_disposition() {
        assert_eq!(
            from_content_disposition("attachment; filename=\"rapport final.pdf\""),
            Some("rapport final.pdf".to_string())
        );
        assert_eq!(
            from_content_disposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf"),
            Some("résumé.pdf".to_string())
        );
    }

    #[test]
    fn extrait_depuis_url() {
        assert_eq!(from_url("https://ex.com/path/data.zip?token=x"), "data.zip");
        assert_eq!(from_url("https://ex.com/a/b/mon%20fichier.iso"), "mon fichier.iso");
    }
}
