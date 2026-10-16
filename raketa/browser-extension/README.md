# Extension navigateur RAKETA (P6)

Ébauche de l'extension Chrome/Edge (Manifest V3) qui capture les téléchargements
et propose de les transférer vers l'application **RAKETA** via **Native Messaging**.

## État

- ✅ `manifest.json` — permissions minimales (`downloads`, `nativeMessaging`).
- ✅ `src/background.js` — service worker : écoute `downloads.onCreated` et le clic
  sur l'icône, envoie un message à l'hôte natif.
- ⏳ À venir : hôte natif côté application (manifeste d'enregistrement Windows,
  lecture des messages `stdin`/`stdout` longueur-préfixée), confirmation
  utilisateur, règles par domaine (`browser_rules`), transfert sécurisé.

## Principes de sécurité (section 12)

- Jamais d'interception silencieuse : consentement explicite avant transfert.
- Jamais de cookies/jetons sans accord clair et portée minimale.
- Validation stricte du format et de la taille des messages côté hôte natif.
- Si l'application n'est pas installée, le navigateur continue de fonctionner.

## Charger en développement

1. `chrome://extensions` → activer le **mode développeur**.
2. **Charger l'extension non empaquetée** → sélectionner ce dossier.
3. Installer le manifeste d'hôte natif (fourni avec l'application RAKETA).
