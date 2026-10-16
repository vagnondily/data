# Feuille de route RAKETA

Priorité de la doc : **fiabilité du moteur avant les fonctionnalités spectaculaires.**

| Phase | Objet | Critère de sortie | État |
|------|-------|-------------------|------|
| **P0** | Environnement (Rust, Node, Tauri) | L'app de base se lance sur Windows | 🏗️ scaffold prêt (`scripts/install-windows.ps1`) |
| **P1** | MVP réseau (streaming, progression, annulation) | Téléchargement réel d'un fichier de test | ✅ **moteur fait + testé** |
| **P2** | Persistance SQLite (états, historique, récupération) | Tâche récupérée après redémarrage | ✅ **stockage + récupération faits + testés** |
| **P3** | Reprise (fichiers partiels, validateurs) | Reprise fiable sur serveur compatible | ✅ **fait + testé** (`reprise_apres_coupure_sans_corruption`) |
| **P4** | Multisegment (Range, Content-Range, assemblage) | Fichier final identique à la référence | ✅ **fait + testé** |
| **P5** | Interface premium (dashboard, catégories, paramètres) | Parcours utilisable sans terminal | 🏗️ UI React (onglets HTTP/Torrents) |
| **P6** | Extension navigateur (Manifest V3, Native Messaging) | Transfert depuis Chrome/Edge | 🏗️ ébauche extension |
| **+** | **Torrents** (magnets + .torrent, DHT, seeding) | Téléchargement BitTorrent rapide | ✅ intégré (librqbit) |
| **P7** | Détection avancée (liens directs, médias) | Détection testée, sans promesse universelle | ⏳ à venir |
| **P8** | Durcissement (sécurité, tests de charge, signature) | Bêta reproductible et installable | ⏳ à venir |

## Ce qui est déjà vérifiable aujourd'hui

Dans `core/`, `cargo test` exécute **16 tests** qui couvrent les critères
d'acceptation de la section 14 :

- téléchargement simple avec vérification de taille et d'empreinte SHA-256 ;
- **reprise après coupure réseau, sans corruption** ;
- serveur sans `Range` → mono-flux propre ;
- nom de fichier malveillant → aucun accès hors du dossier de destination ;
- base SQLite : insertion, relecture, récupération des tâches interrompues.

## Prochaines priorités suggérées

1. **P4 — multisegment** : découper en plages parallèles quand `Accept-Ranges`
   le permet, puis assembler et vérifier (table `segments` déjà prévue).
2. **Hôte natif P6** : lecture des messages longueur-préfixée + confirmation.
3. **Catégories & règles** : rangement automatique par type (table `categories`).
4. **Planification & limites** : débit max, nombre de tâches simultanées.
5. **Icônes & signature** : `tauri icon`, puis signature de code avant diffusion.
