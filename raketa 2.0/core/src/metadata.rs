//! Sondage des métadonnées distantes (section 9.1).
//!
//! On privilégie une requête `GET` avec `Range: bytes=0-0` plutôt que `HEAD`,
//! car de nombreux serveurs refusent ou tronquent la réponse à `HEAD`.
//! - `206 Partial Content` → les plages sont supportées, la taille totale est
//!   lue dans `Content-Range`.
//! - `200 OK` → pas de support des plages (ou ignoré), taille lue dans
//!   `Content-Length` si présent.

use crate::error::{EngineError, Result};
use crate::filename;
use crate::model::{Credentials, RemoteInfo};
use reqwest::header::{
    ACCEPT_RANGES, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, ETAG,
    LAST_MODIFIED, RANGE,
};
use reqwest::{Client, RequestBuilder};

/// Applique l'authentification HTTP Basic à une requête, si des identifiants
/// sont fournis (téléchargements protégés par mot de passe).
pub(crate) fn apply_auth(req: RequestBuilder, auth: Option<&Credentials>) -> RequestBuilder {
    match auth {
        Some(c) => req.basic_auth(&c.username, Some(&c.password)),
        None => req,
    }
}

/// Vérifie que l'URL utilise un schéma autorisé (http/https uniquement, section 12).
pub fn validate_scheme(url: &str) -> Result<()> {
    let parsed = url::Url::parse(url).map_err(|_| EngineError::InvalidUrl(url.to_string()))?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        other => Err(EngineError::UnsupportedScheme(other.to_string())),
    }
}

/// Interroge le serveur pour découvrir taille, support des plages et validateurs.
pub async fn probe(client: &Client, url: &str, auth: Option<&Credentials>) -> Result<RemoteInfo> {
    validate_scheme(url)?;

    let resp = apply_auth(client.get(url).header(RANGE, "bytes=0-0"), auth)
        .send()
        .await?;

    let status = resp.status();
    if status.is_client_error() || status.is_server_error() {
        // 416 lors du sondage est inattendu (on demande 0-0) : on remonte le code.
        return Err(EngineError::HttpStatus(status.as_u16()));
    }

    let final_url = resp.url().to_string();
    let headers = resp.headers();

    let header_str = |name: reqwest::header::HeaderName| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };

    let accept_ranges = status.as_u16() == 206
        || headers
            .get(ACCEPT_RANGES)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.contains("bytes"))
            .unwrap_or(false);

    let size = if status.as_u16() == 206 {
        total_from_content_range(headers.get(CONTENT_RANGE).and_then(|v| v.to_str().ok()))
    } else {
        headers
            .get(CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.parse::<u64>().ok())
    };

    let mime_type = header_str(CONTENT_TYPE).map(|s| {
        // On ne garde que le type MIME, sans paramètres (« ; charset=... »).
        s.split(';').next().unwrap_or(&s).trim().to_string()
    });

    let suggested_filename = header_str(CONTENT_DISPOSITION)
        .as_deref()
        .and_then(filename::from_content_disposition)
        .or_else(|| Some(filename::from_url(&final_url)));

    Ok(RemoteInfo {
        final_url,
        size,
        accept_ranges,
        etag: header_str(ETAG),
        last_modified: header_str(LAST_MODIFIED),
        mime_type,
        suggested_filename,
    })
}

/// Extrait la taille totale d'un en-tête `Content-Range: bytes 0-0/12345`.
fn total_from_content_range(value: Option<&str>) -> Option<u64> {
    let v = value?;
    let total = v.rsplit('/').next()?.trim();
    if total == "*" {
        None
    } else {
        total.parse::<u64>().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuse_les_schemas_non_http() {
        assert!(validate_scheme("ftp://ex.com/f").is_err());
        assert!(validate_scheme("file:///etc/passwd").is_err());
        assert!(validate_scheme("https://ex.com/f").is_ok());
        assert!(validate_scheme("http://ex.com/f").is_ok());
    }

    #[test]
    fn parse_la_taille_depuis_content_range() {
        assert_eq!(total_from_content_range(Some("bytes 0-0/12345")), Some(12345));
        assert_eq!(total_from_content_range(Some("bytes 0-0/*")), None);
        assert_eq!(total_from_content_range(None), None);
    }
}
