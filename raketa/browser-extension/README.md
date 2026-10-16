# Extension navigateur RAKETA (Chrome / Edge / Firefox)

Intègre RAKETA au navigateur, **façon IDM** :

- **Clic droit → « Télécharger avec RAKETA »** sur un lien, une image, une
  vidéo, une page.
- **Capture automatique** : les téléchargements lancés dans le navigateur sont
  renvoyés à RAKETA (activable/désactivable depuis la popup).

## Comment ça marche

L'application RAKETA ouvre un petit serveur local sur `http://127.0.0.1:47623`.
L'extension lui envoie les liens. Pas de « native messaging » à enregistrer :
il suffit que **RAKETA soit lancé**.

> Sécurité : le serveur n'écoute que sur la boucle locale et n'accepte les
> ajouts que depuis une origine d'extension — une page web ne peut pas déclencher
> de téléchargement.

## Installation (Chrome / Edge)

1. Ouvre `chrome://extensions` (ou `edge://extensions`).
2. Active le **Mode développeur** (en haut à droite).
3. Clique **Charger l'extension non empaquetée** et sélectionne le dossier
   `raketa/browser-extension`.
4. Épingle l'icône RAKETA. Clique dessus : la popup indique si RAKETA est
   connecté et permet d'activer la capture automatique.

## Installation (Firefox)

1. Ouvre `about:debugging#/runtime/this-firefox`.
2. **Charger un module complémentaire temporaire…** → sélectionne le fichier
   `manifest.json` du dossier `raketa/browser-extension`.

## Utilisation

- **RAKETA doit être ouvert.** Lance-le d'abord.
- Clic droit sur un lien → **« Télécharger avec RAKETA »**.
- Ou laisse la **capture automatique** active : tout téléchargement part dans
  RAKETA (son moteur multi-segments reprend la main).

> RAKETA est un téléchargeur généraliste : ne téléchargez que des contenus
> auxquels vous avez droit.
