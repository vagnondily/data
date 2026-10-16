//! Téléchargements par lot : expansion de motifs d'URL (fonctionnalité IDM).
//!
//! Prend en charge un intervalle numérique `[début-fin]` avec remplissage par
//! des zéros selon la largeur du début. Exemples :
//! - `http://ex.com/img[1-3].jpg` → `img1.jpg`, `img2.jpg`, `img3.jpg`
//! - `http://ex.com/f[08-10].bin` → `f08.bin`, `f09.bin`, `f10.bin`
//!
//! Garde-fou : au plus `MAX_EXPANSION` URLs générées pour éviter une explosion.

/// Nombre maximal d'URLs générées par un motif.
pub const MAX_EXPANSION: u64 = 10_000;

/// Étend un motif `[début-fin]` en liste d'URLs.
///
/// S'il n'y a pas de motif valide, renvoie l'URL inchangée dans un vecteur.
pub fn expand(pattern: &str) -> Vec<String> {
    let Some(open) = pattern.find('[') else {
        return vec![pattern.to_string()];
    };
    let Some(close_rel) = pattern[open..].find(']') else {
        return vec![pattern.to_string()];
    };
    let close = open + close_rel;
    let inner = &pattern[open + 1..close];

    let Some((a, b)) = inner.split_once('-') else {
        return vec![pattern.to_string()];
    };
    let (a, b) = (a.trim(), b.trim());

    let (Ok(start), Ok(end)) = (a.parse::<u64>(), b.parse::<u64>()) else {
        return vec![pattern.to_string()];
    };

    // Largeur de remplissage : celle du bord le plus long (gère `[08-10]`).
    let width = a.len().max(b.len());
    let prefix = &pattern[..open];
    let suffix = &pattern[close + 1..];

    let (lo, hi) = if start <= end { (start, end) } else { (end, start) };
    if hi - lo + 1 > MAX_EXPANSION {
        return vec![pattern.to_string()];
    }

    let mut out = Vec::with_capacity((hi - lo + 1) as usize);
    let range: Box<dyn Iterator<Item = u64>> = if start <= end {
        Box::new(lo..=hi)
    } else {
        Box::new((lo..=hi).rev())
    };
    for i in range {
        out.push(format!("{prefix}{i:0width$}{suffix}", width = width));
    }
    out
}

/// Étend plusieurs lignes (une URL ou un motif par ligne), en ignorant les
/// lignes vides. Pratique pour coller une liste depuis l'interface.
pub fn expand_lines(text: &str) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .flat_map(expand)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn etend_intervalle_simple() {
        assert_eq!(
            expand("http://x/img[1-3].jpg"),
            vec![
                "http://x/img1.jpg",
                "http://x/img2.jpg",
                "http://x/img3.jpg"
            ]
        );
    }

    #[test]
    fn respecte_le_remplissage_par_zeros() {
        assert_eq!(
            expand("f[08-10].bin"),
            vec!["f08.bin", "f09.bin", "f10.bin"]
        );
    }

    #[test]
    fn sans_motif_renvoie_lurl() {
        assert_eq!(expand("http://x/f.zip"), vec!["http://x/f.zip"]);
    }

    #[test]
    fn plusieurs_lignes() {
        let got = expand_lines("http://x/a.zip\n\nhttp://x/b[1-2].zip\n");
        assert_eq!(got, vec!["http://x/a.zip", "http://x/b1.zip", "http://x/b2.zip"]);
    }
}
