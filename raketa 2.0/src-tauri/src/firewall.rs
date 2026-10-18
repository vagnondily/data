//! Vérification et autorisation du pare-feu Windows pour RAKETA.
//!
//! Les connexions ENTRANTES des pairs torrent améliorent nettement le nombre de
//! sources et la vitesse ; Windows les bloque tant qu'aucune règle n'autorise
//! l'exécutable. On vérifie la présence d'une règle nommée « RAKETA » et on
//! propose de l'ajouter (une seule invite UAC, ponctuelle).
//!
//! L'ajout de règle exige des privilèges administrateur : on écrit un petit
//! script batch (gestion fiable des guillemets/espaces) que l'on lance ensuite
//! avec élévation (`Start-Process -Verb RunAs`). L'installation de RAKETA, elle,
//! reste « par utilisateur » (sans élévation).

use serde::Serialize;

/// Nom de la règle de pare-feu créée pour RAKETA.
pub const RULE_NAME: &str = "RAKETA";

/// État du pare-feu vis-à-vis de RAKETA, pour l'interface.
#[derive(Debug, Clone, Serialize)]
pub struct FirewallStatus {
    /// La vérification a-t-elle pu aboutir ? (false si l'OS ne le permet pas.)
    pub checked: bool,
    /// Une règle « autoriser » existe-t-elle déjà pour RAKETA ?
    pub allowed: bool,
}

/// Indique si une règle de pare-feu « RAKETA » existe déjà.
///
/// `netsh … show rule name=RAKETA` renvoie un code de sortie nul quand la règle
/// existe, non nul sinon : on se base sur le code (indépendant de la langue de
/// Windows) plutôt que sur le texte localisé.
#[cfg(windows)]
pub fn status() -> FirewallStatus {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    // Bind avant l'appel : tous les arguments doivent être du même type (&str).
    let name_arg = format!("name={RULE_NAME}");
    let out = Command::new("netsh")
        .args(["advfirewall", "firewall", "show", "rule", name_arg.as_str()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW : pas de fenêtre console
        .status();
    match out {
        Ok(s) => FirewallStatus {
            checked: true,
            allowed: s.success(),
        },
        Err(_) => FirewallStatus {
            checked: false,
            allowed: false,
        },
    }
}

/// Hors Windows : non applicable (RAKETA cible Windows).
#[cfg(not(windows))]
pub fn status() -> FirewallStatus {
    FirewallStatus {
        checked: false,
        allowed: false,
    }
}

/// Ajoute (avec élévation) une règle autorisant les connexions ENTRANTES vers
/// l'exécutable RAKETA, tous protocoles, sur tous les profils réseau. Déclenche
/// une invite UAC. Idempotent : l'ancienne règle du même nom est supprimée avant.
#[cfg(windows)]
pub fn authorize() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // On neutralise un éventuel guillemet dans le chemin (improbable) pour ne
    // pas casser le script batch.
    let exe = exe.to_string_lossy().replace('"', "");

    // Script batch : les guillemets et espaces y sont gérés de façon fiable,
    // ce qui évite trois niveaux d'échappement PowerShell → cmd → netsh.
    let script = format!(
        "@echo off\r\n\
         netsh advfirewall firewall delete rule name=\"{name}\" >nul 2>&1\r\n\
         netsh advfirewall firewall add rule name=\"{name}\" dir=in action=allow program=\"{exe}\" enable=yes profile=any\r\n",
        name = RULE_NAME,
        exe = exe,
    );
    let bat = std::env::temp_dir().join("raketa-firewall.bat");
    std::fs::write(&bat, script).map_err(|e| format!("écriture du script : {e}"))?;

    // Élève uniquement l'exécution de ce script (UAC). `-Wait` pour connaître
    // l'issue ; une invite refusée fait échouer Start-Process.
    let bat_ps = bat.to_string_lossy().replace('\'', "''"); // échappe pour PowerShell
    let ps = format!("Start-Process -FilePath '{bat_ps}' -Verb RunAs -WindowStyle Hidden -Wait");
    let status = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps.as_str()])
        .creation_flags(0x0800_0000)
        .status();
    let _ = std::fs::remove_file(&bat);

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err("Autorisation annulée. Vous pourrez réessayer depuis les Préférences.".into()),
        Err(e) => Err(format!("échec de l'autorisation : {e}")),
    }
}

/// Hors Windows : non applicable.
#[cfg(not(windows))]
pub fn authorize() -> Result<(), String> {
    Err("Disponible uniquement sous Windows.".into())
}
