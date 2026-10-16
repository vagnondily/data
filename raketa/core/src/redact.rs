//! Expurgation d'URL pour l'affichage (section 11.1 + sécurité section 12).
//!
//! Masque les informations sensibles d'une URL avant de la montrer dans
//! l'interface : identifiants dans l'autorité (`user:pass@`) et valeurs des
//! paramètres de requête sensibles (tokens, clés, signatures…). La structure
//! reste lisible pour que l'utilisateur reconnaisse la ressource.

use url::Url;

/// Fragments de noms de paramètres considérés comme sensibles (insensible à la casse).
const SENSITIVE: &[&str] = &[
    "token", "access", "key", "sig", "signature", "secret", "password", "pwd", "auth",
    "session", "credential", "x-amz", "expires", "policy", "api",
];

/// Renvoie une version de l'URL sûre à afficher (secrets masqués par `***`).
pub fn redact_url(input: &str) -> String {
    let Ok(mut u) = Url::parse(input) else {
        return input.to_string();
    };

    // Retire les identifiants de l'autorité (user:pass@host).
    let _ = u.set_username("");
    let _ = u.set_password(None);

    // Masque la valeur des paramètres sensibles, en gardant les autres.
    if let Some(query) = u.query() {
        let redacted = query
            .split('&')
            .map(|kv| {
                let key = kv.split('=').next().unwrap_or(kv);
                let key_l = key.to_lowercase();
                if SENSITIVE.iter().any(|s| key_l.contains(s)) {
                    format!("{key}=***")
                } else {
                    kv.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("&");
        u.set_query(Some(&redacted));
    }

    u.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masque_les_parametres_sensibles() {
        let out = redact_url("https://ex.com/f.zip?token=abc123&name=foo&sig=xyz");
        assert!(out.contains("token=***"), "{out}");
        assert!(out.contains("sig=***"), "{out}");
        assert!(out.contains("name=foo"), "{out}");
        assert!(!out.contains("abc123"), "{out}");
    }

    #[test]
    fn retire_les_identifiants() {
        let out = redact_url("https://user:secret@ex.com/f.zip");
        assert!(!out.contains("secret"), "{out}");
        assert!(!out.contains("user:"), "{out}");
        assert!(out.contains("ex.com/f.zip"), "{out}");
    }

    #[test]
    fn sans_query_inchangee() {
        assert_eq!(redact_url("https://ex.com/a/b.zip"), "https://ex.com/a/b.zip");
    }

    #[test]
    fn url_non_parsable_renvoyee_telle_quelle() {
        assert_eq!(redact_url("pas une url"), "pas une url");
    }
}
