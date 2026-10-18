//! Détection et regroupement de fichiers « en plusieurs parties », puis
//! jonction (concaténation) des découpes binaires.
//!
//! Deux familles **très différentes** — et les confondre corrompt les données,
//! donc on les sépare proprement :
//!
//!  - **Découpe binaire** (`fichier.001/.002/…`, style HJSplit, ou volumes
//!    7-Zip `archive.7z.001`) : la **concaténation dans l'ordre** reconstitue
//!    exactement l'octet près le fichier d'origine. C'est le vrai « joindre les
//!    parties pour avoir un seul fichier ».
//!  - **Archives multi-volumes** (`.part01.rar`, `.r00`, `.z01`) : ce sont des
//!    archives distinctes qu'un logiciel d'archive doit **extraire**. Les
//!    concaténer produirait un fichier invalide. On les repère et on les
//!    signale (« à extraire »), **sans jamais les concaténer**.
//!
//! La détection est **pure** (aucune E/S) donc testable : on lui passe la liste
//! `(chemin, nom, taille)` d'un dossier et elle rend les groupes identifiés par
//! le NOM de fichier — plusieurs groupes distincts peuvent coexister (5 parties
//! d'un fichier A et 10 d'un fichier B en même temps).

use serde::Serialize;

/// Nature d'un groupe de parties.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PartKind {
    /// Parties à **concaténer** pour reconstituer le fichier final.
    Concat,
    /// Archive en plusieurs volumes : à **extraire** (jamais concaténer).
    Archive,
}

/// Un fichier-partie individuel.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PartFile {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// Un groupe de parties partageant la même base de nom.
#[derive(Debug, Clone, Serialize)]
pub struct PartGroup {
    /// Base commune (sans l'indice de partie).
    pub base: String,
    /// Nom de fichier résultant proposé (pour une concaténation) ou archive
    /// principale à ouvrir (pour un volume).
    pub output_name: String,
    pub kind: PartKind,
    /// Parties ordonnées : ordre de reconstruction (Concat) ou volume principal
    /// en tête (Archive).
    pub parts: Vec<PartFile>,
    pub total_size: u64,
    /// Indice de la première partie manquante si la suite n'est pas contiguë
    /// (`None` = complète). Pour prévenir « il manque la partie N ».
    pub missing: Option<u64>,
}

/// Classement d'un nom de fichier isolé.
#[derive(Debug, Clone, PartialEq, Eq)]
enum Cls {
    /// `base.NNN` (découpe binaire numérique). idx = valeur du suffixe.
    Concat { base: String, idx: u64 },
    /// `base.partN.rar` (volume RAR récent). idx = numéro de volume.
    RarPart { base: String, idx: u64 },
    /// `base.rar` (idx -1, 1er volume) ou `base.rNN` (idx = NN) — RAR ancien.
    RarOld { base: String, idx: i64 },
    /// `base.zip` (idx -1, archive principale) ou `base.zNN` (idx = NN).
    SplitZip { base: String, idx: i64 },
}

fn all_ascii_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

/// Classe un nom de fichier dans une des familles « multi-parties », ou `None`.
fn classify(name: &str) -> Option<Cls> {
    // 1) Découpe numérique : dernier segment après « . » entièrement numérique
    //    (2 à 4 chiffres). Couvre .001/.002, archive.7z.001, film.mkv.001…
    if let Some(dot) = name.rfind('.') {
        let (base, suffix) = (&name[..dot], &name[dot + 1..]);
        if !base.is_empty() && (2..=4).contains(&suffix.len()) && all_ascii_digits(suffix) {
            if let Ok(idx) = suffix.parse::<u64>() {
                return Some(Cls::Concat {
                    base: base.to_string(),
                    idx,
                });
            }
        }
    }

    let lower = name.to_ascii_lowercase();

    // 2) Volume RAR récent : base.partN.rar
    if lower.ends_with(".rar") {
        let stem = &name[..name.len() - 4]; // retire « .rar »
        let stem_lower = &lower[..lower.len() - 4];
        if let Some(pos) = stem_lower.rfind(".part") {
            let digits = &stem[pos + 5..];
            if all_ascii_digits(digits) {
                if let Ok(idx) = digits.parse::<u64>() {
                    return Some(Cls::RarPart {
                        base: stem[..pos].to_string(),
                        idx,
                    });
                }
            }
        }
        // 3a) RAR ancien, 1er volume : base.rar
        return Some(Cls::RarOld {
            base: stem.to_string(),
            idx: -1,
        });
    }
    // 3b) RAR ancien, volumes suivants : base.rNN
    if lower.len() >= 4 {
        let tail = &lower[lower.len() - 4..];
        if tail.starts_with(".r") && all_ascii_digits(&tail[2..]) {
            if let Ok(n) = tail[2..].parse::<i64>() {
                return Some(Cls::RarOld {
                    base: name[..name.len() - 4].to_string(),
                    idx: n,
                });
            }
        }
    }

    // 4) ZIP scindé : base.zip (principale) ou base.zNN
    if lower.ends_with(".zip") {
        return Some(Cls::SplitZip {
            base: name[..name.len() - 4].to_string(),
            idx: -1,
        });
    }
    if lower.len() >= 4 {
        let tail = &lower[lower.len() - 4..];
        if tail.starts_with(".z") && all_ascii_digits(&tail[2..]) {
            if let Ok(n) = tail[2..].parse::<i64>() {
                return Some(Cls::SplitZip {
                    base: name[..name.len() - 4].to_string(),
                    idx: n,
                });
            }
        }
    }

    None
}

/// Première partie manquante dans une suite d'indices (triés), en partant de
/// `start`. `None` si contiguë.
fn first_missing(sorted_idx: &[u64], start: u64) -> Option<u64> {
    let mut expected = start;
    for &i in sorted_idx {
        if i < start {
            continue;
        }
        if i != expected {
            return Some(expected);
        }
        expected += 1;
    }
    None
}

/// Détecte tous les groupes multi-parties d'un ensemble de fichiers.
///
/// `entries` = `(chemin_complet, nom_de_fichier, taille)`. L'ordre d'entrée est
/// indifférent ; chaque groupe retourné est trié.
pub fn detect_groups(entries: &[(String, String, u64)]) -> Vec<PartGroup> {
    use std::collections::BTreeMap;

    // Buckets par (famille, base).
    #[derive(Default)]
    struct Bucket {
        concat: Vec<(u64, PartFile)>,
        rar_part: Vec<(u64, PartFile)>,
        rar_old: Vec<(i64, PartFile)>,
        split_zip: Vec<(i64, PartFile)>,
    }
    let mut buckets: BTreeMap<String, Bucket> = BTreeMap::new();

    for (path, name, size) in entries {
        let Some(cls) = classify(name) else { continue };
        let pf = PartFile {
            path: path.clone(),
            name: name.clone(),
            size: *size,
        };
        match cls {
            Cls::Concat { base, idx } => buckets
                .entry(format!("c\u{0}{base}"))
                .or_default()
                .concat
                .push((idx, pf)),
            Cls::RarPart { base, idx } => buckets
                .entry(format!("p\u{0}{base}"))
                .or_default()
                .rar_part
                .push((idx, pf)),
            Cls::RarOld { base, idx } => buckets
                .entry(format!("r\u{0}{base}"))
                .or_default()
                .rar_old
                .push((idx, pf)),
            Cls::SplitZip { base, idx } => buckets
                .entry(format!("z\u{0}{base}"))
                .or_default()
                .split_zip
                .push((idx, pf)),
        }
    }

    let mut groups = Vec::new();
    for (key, mut b) in buckets {
        // La base est après le séparateur NUL.
        let base = key.splitn(2, '\u{0}').nth(1).unwrap_or("").to_string();

        if b.concat.len() >= 2 {
            b.concat.sort_by_key(|(i, _)| *i);
            let min = b.concat.first().map(|(i, _)| *i).unwrap_or(0);
            // Une vraie découpe commence à 0 ou 1 (évite de confondre avec
            // « rapport.2023 / rapport.2024 »).
            if min <= 1 {
                let idxs: Vec<u64> = b.concat.iter().map(|(i, _)| *i).collect();
                let total = b.concat.iter().map(|(_, p)| p.size).sum();
                groups.push(PartGroup {
                    base: base.clone(),
                    output_name: base.clone(),
                    kind: PartKind::Concat,
                    parts: b.concat.into_iter().map(|(_, p)| p).collect(),
                    total_size: total,
                    missing: first_missing(&idxs, min),
                });
                continue;
            }
        }

        if b.rar_part.len() >= 2 {
            b.rar_part.sort_by_key(|(i, _)| *i);
            let idxs: Vec<u64> = b.rar_part.iter().map(|(i, _)| *i).collect();
            let start = idxs.first().copied().unwrap_or(1);
            let total = b.rar_part.iter().map(|(_, p)| p.size).sum();
            groups.push(PartGroup {
                base: base.clone(),
                output_name: format!("{base}.rar"),
                kind: PartKind::Archive,
                parts: b.rar_part.into_iter().map(|(_, p)| p).collect(),
                total_size: total,
                missing: first_missing(&idxs, start),
            });
            continue;
        }

        if b.rar_old.len() >= 2 {
            // Ordre : .rar (-1) puis .r00, .r01…
            b.rar_old.sort_by_key(|(i, _)| *i);
            let total = b.rar_old.iter().map(|(_, p)| p.size).sum();
            groups.push(PartGroup {
                base: base.clone(),
                output_name: format!("{base}.rar"),
                kind: PartKind::Archive,
                parts: b.rar_old.into_iter().map(|(_, p)| p).collect(),
                total_size: total,
                missing: None,
            });
            continue;
        }

        if b.split_zip.len() >= 2 {
            // Ordre : archive principale .zip (-1) en tête, puis .z01, .z02…
            b.split_zip.sort_by_key(|(i, _)| *i);
            let total = b.split_zip.iter().map(|(_, p)| p.size).sum();
            groups.push(PartGroup {
                base: base.clone(),
                output_name: format!("{base}.zip"),
                kind: PartKind::Archive,
                parts: b.split_zip.into_iter().map(|(_, p)| p).collect(),
                total_size: total,
                missing: None,
            });
            continue;
        }
    }

    // Tri stable pour un affichage déterministe.
    groups.sort_by(|a, b| a.base.cmp(&b.base));
    groups
}

#[cfg(test)]
mod tests {
    use super::*;

    fn e(name: &str, size: u64) -> (String, String, u64) {
        (format!("/d/{name}"), name.to_string(), size)
    }

    #[test]
    fn concatenation_numerique_simple() {
        let files = [
            e("film.mkv.001", 100),
            e("film.mkv.002", 100),
            e("film.mkv.003", 40),
        ];
        let g = detect_groups(&files);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].kind, PartKind::Concat);
        assert_eq!(g[0].output_name, "film.mkv");
        assert_eq!(g[0].total_size, 240);
        assert_eq!(g[0].missing, None);
        // Ordre de reconstruction.
        assert_eq!(g[0].parts[0].name, "film.mkv.001");
        assert_eq!(g[0].parts[1].name, "film.mkv.002");
        assert_eq!(g[0].parts[2].name, "film.mkv.003");
    }

    #[test]
    fn volumes_7zip_sont_concatenables() {
        // 7-Zip « split » = découpe binaire : .7z.001 + .7z.002 → .7z.
        let files = [e("data.7z.001", 10), e("data.7z.002", 10)];
        let g = detect_groups(&files);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].kind, PartKind::Concat);
        assert_eq!(g[0].output_name, "data.7z");
    }

    #[test]
    fn deux_groupes_concurrents_distincts() {
        // 5 parties de A et 3 de B en même temps : deux groupes séparés par nom.
        let mut files = vec![];
        for i in 1..=5 {
            files.push(e(&format!("A.bin.{i:03}"), 1));
        }
        for i in 1..=3 {
            files.push(e(&format!("B.iso.{i:03}"), 2));
        }
        let g = detect_groups(&files);
        assert_eq!(g.len(), 2);
        let a = g.iter().find(|x| x.base == "A.bin").unwrap();
        let b = g.iter().find(|x| x.base == "B.iso").unwrap();
        assert_eq!(a.parts.len(), 5);
        assert_eq!(b.parts.len(), 3);
        assert_eq!(b.total_size, 6);
    }

    #[test]
    fn partie_manquante_signalee() {
        let files = [e("x.001", 1), e("x.002", 1), e("x.004", 1)];
        let g = detect_groups(&files);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].missing, Some(3));
    }

    #[test]
    fn rar_multivolume_est_archive_pas_concat() {
        let files = [
            e("movie.part01.rar", 100),
            e("movie.part02.rar", 100),
            e("movie.part03.rar", 50),
        ];
        let g = detect_groups(&files);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].kind, PartKind::Archive);
        assert_eq!(g[0].parts.len(), 3);
        assert_eq!(g[0].parts[0].name, "movie.part01.rar");
    }

    #[test]
    fn rar_ancien_rnn_est_archive() {
        let files = [e("game.rar", 100), e("game.r00", 100), e("game.r01", 20)];
        let g = detect_groups(&files);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].kind, PartKind::Archive);
        // .rar en tête (volume principal à ouvrir).
        assert_eq!(g[0].parts[0].name, "game.rar");
    }

    #[test]
    fn zip_scinde_est_archive() {
        let files = [e("pack.zip", 100), e("pack.z01", 100), e("pack.z02", 100)];
        let g = detect_groups(&files);
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].kind, PartKind::Archive);
        assert_eq!(g[0].parts[0].name, "pack.zip");
    }

    #[test]
    fn fichier_unique_non_groupe() {
        // Un seul .001, ou un simple .rar : pas un groupe.
        let files = [e("lonely.001", 1), e("normal.rar", 5), e("photo.jpg", 9)];
        assert!(detect_groups(&files).is_empty());
    }

    #[test]
    fn faux_positif_annee_rejete() {
        // « rapport.2023 » + « rapport.2024 » ne doivent PAS être pris pour une
        // découpe (indices qui ne commencent pas à 0/1).
        let files = [e("rapport.2023", 10), e("rapport.2024", 10)];
        assert!(detect_groups(&files).is_empty());
    }
}
