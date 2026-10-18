<div align="center">
  <img src="docs/logo-full.svg" alt="RAKETA — Smart Service Androy" width="460" />

  # 🚀 RAKETA

  **Gestionnaire de téléchargement avancé pour Windows**
  *Rapide. Fiable. Local. Sécurisé.* — par **Smart Service Androy**

  `Rust` · `Tauri 2` · `React` · `TypeScript` · `SQLite`
</div>

---

## Pourquoi « RAKETA » ?

**Raketa** (*raiketa*) désigne le **figuier de Barbarie / cactus**, emblème de la
région **Androy** — déjà présent dans le logo. Et *raketa* sonne comme **« rocket »** :
la vitesse et la puissance. Un nom ancré dans l'identité **Smart Service Androy**,
qui raconte une histoire : **le téléchargement qui pique et qui fuse.** 🌵🚀

## Vision

Une application **locale**, rapide, fiable et extensible, qui capture, organise,
planifie, reprend et vérifie les téléchargements — **sans compte ni serveur distant**
pour les fonctions essentielles.

> Priorité absolue (cf. document de cadrage) : **la fiabilité du moteur avant les
> fonctionnalités spectaculaires.** La première victoire, c'est de *prouver* que le
> moteur télécharge correctement et reprend sans corruption. ✅ **C'est fait.**

## Architecture

Le moteur (`core/`) est **indépendant de l'interface** : il se teste et se mesure
sans Tauri ni navigateur.

```
raketa/
├── core/                 # raketa-core : moteur HTTP Rust (testable seul) ✅
│   └── src/
│       ├── engine.rs     #   streaming HTTP/HTTPS, reprise, finalisation atomique
│       ├── segmented.rs  #   téléchargement multi-segments parallèle (vitesse)
│       ├── metadata.rs   #   sondage : taille, Accept-Ranges, ETag/Last-Modified
│       ├── filename.rs   #   nom de fichier sûr (anti path-traversal)
│       ├── hash.rs       #   SHA-256 en flux
│       ├── storage.rs    #   SQLite : schéma versionné + migrations
│       └── model.rs      #   types partagés + contrôle pause/annulation
├── torrent/              # raketa-torrent : moteur BitTorrent (librqbit) ✅
│   └── src/lib.rs        #   magnets + .torrent, progression, pause/reprise
├── src-tauri/            # enveloppe desktop Tauri 2 (HTTP + torrents + événements)
│   └── src/
│       ├── commands.rs   #   add/list/pause/resume/cancel/probe
│       └── manager.rs    #   orchestration + événements de progression
├── src/                  # interface React + TypeScript (thème sombre premium)
│   ├── features/dashboard/    # tableau de bord (tâches actives, débit global)
│   └── features/downloads/    # ajout, liste, progression, actions
├── browser-extension/    # ébauche extension Chrome/Edge (Manifest V3, P6)
├── scripts/              # install-windows.ps1
└── docs/                 # ROADMAP.md, logo
```

## État d'avancement

| Brique | État |
|--------|------|
| Moteur HTTP/HTTPS en flux (mémoire bornée) | ✅ fait + testé |
| Pause / annulation / reprise conditionnelle | ✅ fait + testé |
| Détection `Accept-Ranges`, `ETag`, `If-Range` | ✅ fait |
| Vérification taille + empreinte **SHA-256** | ✅ fait + testé |
| Finalisation atomique + anti-écrasement (FR-07) | ✅ fait + testé |
| Nom de fichier sûr (anti path-traversal) | ✅ fait + testé |
| Persistance **SQLite** + récupération au démarrage | ✅ fait + testé |
| Tentatives/backoff (429/5xx), `Retry-After`, disque plein | ✅ fait |
| **Multi-segments parallèle** (vitesse max liens directs, P4) | ✅ **fait + testé** |
| **Torrents** (magnets + .torrent, librqbit, sélection fichiers) | ✅ intégré (compile contre l'API réelle) |
| **Limiteur de débit** global, réglable à chaud | ✅ fait + testé |
| **Téléchargements par lot** (motifs `[1-100]`, listes) | ✅ fait + testé |
| **Catégorisation automatique** (Jeux, Vidéos…) | ✅ fait + testé |
| **Paramètres persistants** (connexions, vitesse, dossier…) | ✅ fait + testé |
| **Navigateur intégré** (capture des liens + anti-popups) | 🏗️ code en place (build Windows requis) |
| **Capture du presse-papiers** (façon IDM) | 🏗️ code en place |
| Enveloppe Tauri (commandes HTTP + torrents + navigateur) | 🏗️ code en place (build Windows requis) |
| Interface React (onglets Téléch. / Torrents / Navigateur / Paramètres) | 🏗️ **build web vérifié** |

Voir [`docs/ROADMAP.md`](docs/ROADMAP.md) pour le détail par phase.

## Tester le moteur (ici, tout de suite)

Le cœur se teste sur **n'importe quelle plateforme**, sans Windows ni interface :

```bash
cd core && cargo test          # 31 tests (HTTP, multi-segments, limiteur, lots, catégories)
cd ../torrent && cargo test     # compile le moteur torrent (test réseau : --ignored)
```

**31 tests** couvrent les critères d'acceptation (section 14) et les fonctions
avancées : téléchargement simple + intégrité, **reprise après coupure sans
corruption**, **multi-segments + reprise sous parallélisme**, serveur sans `Range`,
nom malveillant confiné, base SQLite, **limiteur de débit**, **expansion de motifs
de lot**, **catégorisation** et paramètres. Un petit serveur HTTP local avec support `Range` est monté
dans les tests — aucun accès réseau externe requis.

> Le moteur torrent (`raketa-torrent`) **compile contre l'API réelle de librqbit** ;
> son test runtime nécessite des sockets UDP (DHT), indisponibles en CI/bac à sable —
> lance-le sur ta machine avec `cargo test -p raketa-torrent -- --ignored`.

## Lancer l'application complète (Windows)

Prérequis : **Visual Studio Build Tools** (Desktop C++ + Windows SDK), **Rust
stable-msvc**, **Node LTS**. Le script `scripts/install-windows.ps1` prépare tout.

```powershell
npm install
npm run tauri dev      # développement (fenêtre RAKETA)
npm run tauri build    # installateur Windows (MSI / NSIS)
```

> Génération des icônes : placez le logo en PNG puis `npm run tauri icon docs/logo.png`.

## Sécurité & confidentialité (par défaut)

- http/https **uniquement** ; schémas non nécessaires refusés.
- Redirections limitées ; validation stricte des chemins de sortie.
- **Jamais** d'exécution automatique d'un fichier téléchargé (FR-14).
- **Jamais** de contournement de DRM, paywalls ou contrôles d'accès.
- Secrets (cookies, jetons) tenus hors des logs et de la base.
- Fonctionnement **local**, sans télémétrie obligatoire.

---

<div align="center">
  <sub>© Smart Service Androy — Androy, Madagascar 🇲🇬 · Licence MIT</sub>
</div>


## Médias et playlists

Le panneau Médias distingue l'analyse d'une vidéo individuelle de l'analyse d'une playlist. Le bouton **Playlist** liste les entrées sans télécharger, permet de sélectionner les vidéos disponibles et ajoute chaque sélection à la file média. Les playlists Mix/RD sont dynamiques : leur contenu dépend de YouTube et peut varier.

RAKETA utilise yt-dlp à jour et autorise le chargement des composants JavaScript EJS officiels (`--remote-components ejs:github`) pour améliorer la compatibilité avec YouTube. Cela ne garantit pas l'accès aux vidéos privées, protégées, restreintes ou aux flux exigeant un PO Token. Les erreurs exposent davantage de détails dans le journal.
