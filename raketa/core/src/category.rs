//! Catégorisation automatique des fichiers par extension (rangement façon IDM).
//!
//! Chaque catégorie propose un sous-dossier de destination. RAKETA peut ranger
//! automatiquement les fichiers téléchargés (ex. `.../Jeux/`, `.../Vidéos/`).

/// Catégorie d'un fichier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Category {
    /// Nom lisible de la catégorie.
    pub name: &'static str,
    /// Sous-dossier de rangement suggéré.
    pub folder: &'static str,
}

const JEUX: Category = Category { name: "Jeux", folder: "Jeux" };
const VIDEOS: Category = Category { name: "Vidéos", folder: "Vidéos" };
const MUSIQUE: Category = Category { name: "Musique", folder: "Musique" };
const IMAGES: Category = Category { name: "Images", folder: "Images" };
const DOCUMENTS: Category = Category { name: "Documents", folder: "Documents" };
const ARCHIVES: Category = Category { name: "Archives", folder: "Archives" };
const PROGRAMMES: Category = Category { name: "Programmes", folder: "Programmes" };
const AUTRES: Category = Category { name: "Autres", folder: "Autres" };

/// Déduit la catégorie d'un fichier d'après son extension.
pub fn categorize(filename: &str) -> Category {
    let ext = filename
        .rsplit('.')
        .next()
        .filter(|e| *e != filename) // pas d'extension => pas de point
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        // Images disque / ROMs de consoles (le cœur de cible « jeux »).
        "iso" | "bin" | "cue" | "chd" | "pkg" | "rom" | "nds" | "3ds" | "gba" | "gb" | "gbc"
        | "wbfs" | "rvz" | "wua" | "cso" | "nsp" | "xci" | "z64" | "n64" | "v64" | "sfc"
        | "smc" | "gcm" | "rpx" | "wux" | "ps3" | "ps2" | "psv" | "vpk" => JEUX,

        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg"
        | "ts" => VIDEOS,

        "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "wma" | "opus" => MUSIQUE,

        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "heic" | "tiff" | "ico" => {
            IMAGES
        }

        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "epub" | "mobi"
        | "odt" | "ods" | "csv" | "rtf" => DOCUMENTS,

        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "zst" | "tgz" => ARCHIVES,

        "exe" | "msi" | "apk" | "dmg" | "deb" | "rpm" | "appimage" | "bat" | "sh" | "flatpak" => {
            PROGRAMMES
        }

        _ => AUTRES,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn range_les_jeux() {
        assert_eq!(categorize("God.of.War.pkg").name, "Jeux");
        assert_eq!(categorize("Mario.z64").folder, "Jeux");
        assert_eq!(categorize("disc.iso").name, "Jeux");
    }

    #[test]
    fn range_les_types_courants() {
        assert_eq!(categorize("film.mkv").name, "Vidéos");
        assert_eq!(categorize("son.flac").name, "Musique");
        assert_eq!(categorize("photo.JPG").name, "Images");
        assert_eq!(categorize("rapport.pdf").name, "Documents");
        assert_eq!(categorize("archive.7z").name, "Archives");
        assert_eq!(categorize("setup.exe").name, "Programmes");
    }

    #[test]
    fn sans_extension_est_autres() {
        assert_eq!(categorize("fichier").name, "Autres");
        assert_eq!(categorize("inconnu.xyz").name, "Autres");
    }
}
