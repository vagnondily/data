# Diagnostic des téléchargements YouTube — RAKETA

## Corrections apportées

- Vérification et normalisation des URL HTTP(S) avant d'appeler `yt-dlp`.
- Préparation automatique de Deno sur Windows x64 dans le dossier privé des outils RAKETA. YouTube demande un runtime JavaScript compatible pour résoudre certains défis EJS ; le runtime n'est pas fourni par le seul `yt-dlp.exe`.
- Validation de l'archive et de la signature du binaire Deno avant installation.
- Validation de la taille et de la signature Windows (`MZ`) de `yt-dlp.exe` avant remplacement.
- Mise à jour de `yt-dlp` avec fichier temporaire et restauration de la version précédente si l'installation échoue.
- Création du dossier de destination avant le lancement du téléchargement.
- Liste blanche des valeurs de qualité pour éviter les options de format inattendues.

## Prérequis réseau

Au premier téléchargement YouTube, RAKETA peut avoir besoin d'accéder à GitHub pour télécharger `yt-dlp`, Deno et les composants EJS. Un pare-feu, un proxy d'entreprise ou une connexion qui bloque GitHub peut empêcher cette étape.

## Limites qui ne peuvent pas être corrigées automatiquement

- Vidéo privée, supprimée, réservée aux membres ou soumise à une restriction géographique : il faut disposer d'un accès autorisé. RAKETA ne contourne pas ces restrictions.
- « Sign in to confirm you're not a bot » : YouTube peut exiger une session authentifiée ou limiter l'adresse IP. Une version récente de `yt-dlp` et Deno réduit certains échecs, mais ne garantit pas l'accès.
- HTTP 403 / PO Token : YouTube peut refuser certains formats ou clients. Le runtime JS ne remplace pas un PO Token lorsqu'il est explicitement exigé.
- Formats vidéo/audio séparés et fusion ou conversion MP3 : nécessitent FFmpeg. Sans FFmpeg, RAKETA choisit des formats déjà combinés compatibles quand c'est possible.
- Playlist privée : chaque vidéo peut avoir ses propres restrictions d'accès.

## Vérification manuelle

1. Fermer puis relancer RAKETA après une mise à jour.
2. Tester une vidéo publique, non réservée aux membres.
3. Si l'erreur persiste, conserver le détail complet de l'erreur affichée dans RAKETA et vérifier que GitHub n'est pas bloqué par le réseau.
4. Ne jamais partager de cookies de navigateur ou de fichiers de session : ils peuvent donner accès au compte.
