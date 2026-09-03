# MEMS — Monitoring & Evaluation Management System

**Application web de gestion de projets/programmes humanitaires** (suivi‑évaluation),
inspirée du descriptif produit MEMS et de la logique de gestion de projet.
Première version **fonctionnelle**, **front‑end uniquement** : elle tourne sans
serveur ni base de données — les données sont persistées **dans le navigateur**
(localStorage). Interface **bilingue FR/EN**, **thème clair/sombre**, charte **Blue** (bleu `#007DBC`).

> Pilote de démonstration : bureau pays **Madagascar (PAM)** avec un portefeuille
> réaliste (2 programmes, 5 projets, cadres logiques, indicateurs, activités, sites,
> visites, budget, bénéficiaires, TPM…).

---

## ✨ Ce que fait l'application

Une seule interface, façon application de gestion de projet (navigation latérale,
tableaux Kanban, chronogramme, cartes, tableaux de bord).

### Pilotage
- **Tableau de bord** — KPIs du portefeuille, prévu vs réalisé, couverture du suivi (MMR),
  indice de conformité /100, projets à surveiller, activité récente.
- **Programmes** — portefeuilles regroupant les projets (bailleur, budget, secteurs).
- **Projets** — liste (cartes/tableau), filtres, **santé** (sur la bonne voie / à surveiller / en retard),
  et un **espace de travail à onglets** par projet :
  aperçu · cadre logique · activités · indicateurs · budget · sites · suivi · équipe.

### Cadre & mise en œuvre
- **Cadre logique** — objectif global → objectifs spécifiques → résultats, avec indicateurs et activités rattachés.
- **Activités** — **tableau Kanban** (glisser‑déposer) à faire / en cours / bloqué / terminé, + vue liste.
- **Planning** — **chronogramme (Gantt léger)** des activités avec avancement et repère « aujourd'hui ».
- **Indicateurs** — référence, cible, réalisé, **taux d'atteinte** et tendance ; saisie **prévu/réalisé** par trimestre.
- **Budget** — lignes budgétaires prévu / engagé / dépensé, consommation, graphiques par catégorie/bailleur/projet.

### Terrain & suivi
- **Sites & carte** — cartographie **Leaflet** des sites (colorés par sécurité / statut), liste et fiche d'édition.
- **Suivi & visites** — couverture MMR, conformité par bandes, registre des visites, planification et validation.
- **Bénéficiaires** — ciblage (prévu) vs atteint, désagrégation par genre.
- **Suivi tiers (TPM)** — contrats de prestataires, missions mensuelles, dépenses, circuit de validation.

### Exploitation
- **Import de données** — barrière **Aperçu → Dépôt (en attente) → Validation**.
- **Rapports** — extraction **Excel (.xlsx)** de tout jeu de données + **rapport infographique configurable** :
  graphiques SVG (donuts, barres, anneaux de progression, jauges), page de couverture, périmètre
  (portefeuille ou projet), sections à la carte, orientation portrait/paysage, accent de marque,
  **aperçu en direct** et impression **PDF** ; palette validée (contrastes & daltonisme).
- **Registres versionnés** — plan de suivi & PDD par version : tableau filtrable par bureau, **export/remplissage/réimport Excel**.

### Administration
- **Utilisateurs & rôles** — 6 rôles (`super`, `admin`, `validator`, `editor`, `viewer`, `dashboard`).
- **Paramètres** — organisation, partenaires, bureaux, référentiels, sauvegarde/restauration JSON.

---

## 🧭 Ergonomie & confort d'utilisation

Pensé pour être piloté par une personne non technique :

- **Bilingue FR/EN** — bascule instantanée (barre haute, ou menu compte sur mobile) ; dates et libellés suivent la langue.
- **Thème clair / sombre** — bascule ☀️/🌙, mémorisée, sans clignotement au chargement.
- **Visite guidée** — au premier lancement et via le bouton **?** : met en évidence navigation, création, recherche, thème/langue (bilingue).
- **Bouton « + Créer » global** — ouvre directement le bon formulaire (projet, programme, site, plan de suivi, PDD).
- **Tableaux** — tri par colonne, en‑têtes collants, **actions par ligne** (Ouvrir · Modifier · Supprimer · Dupliquer).
- **Sélection multiple + actions groupées** — export **Excel** de la sélection et **suppression en lot**.
- **Édition en ligne** — modifier une valeur directement dans le tableau (statut, avancement, budget, population).
- **Annulation** — toute suppression peut être **rétablie** en un clic (toast « Rétablir »).
- **Palette de commandes** (`⌘K` / `Ctrl+K`) et raccourci `/` pour la recherche.
- **Barre latérale en accordéon** repliable ; préférences mémorisées.
- **Mobile** — barre latérale escamotable, formulaires en une colonne, tableaux défilables.
- **Exports Excel (.xlsx)** — jeux de données et documents (plan de suivi, PDD) : téléchargeables, remplissables puis réimportables.

---

## 🚀 Démarrage rapide

**Prérequis** : Node.js 18+ et npm.

```bash
cd web
npm install       # installe les dépendances
npm run dev       # démarre le serveur de développement → http://localhost:3000
```

Pour une build de production :

```bash
cd web
npm run build     # génère web/dist
npm run preview   # sert la build → http://localhost:3000
```

`web/dist` est un site **statique** : il peut être servi par n'importe quel
hébergement de fichiers statiques (Nginx, Apache, IIS, un bucket, un partage réseau…).

**Déploiement en service Windows (NSSM)** : voir [`web/DEPLOIEMENT-WINDOWS.md`](web/DEPLOIEMENT-WINDOWS.md)
et le script `web/scripts/install-nssm-service.ps1`.

---

## 👤 Comptes de démonstration

L'application démarre connectée en tant que **Armi Monja** (rôle *super*).
Le menu du compte (en haut à droite) permet de **se connecter en tant que** n'importe
quel autre utilisateur pour tester les rôles (un lecteur ne voit pas les boutons de
modification, un validateur peut valider les visites et les imports, etc.).

| Rôle | Peut… |
|------|-------|
| **super** | tout, y compris la zone sensible des données |
| **admin** | tout sauf la console instance |
| **validator** | consulter, modifier **et valider** |
| **editor** | consulter et **modifier** (saisie, planification) |
| **viewer** | **consulter** seulement |
| **dashboard** | écran de supervision (lecture seule) |

---

## 💾 Données & persistance

- Les données vivent dans le **navigateur** (`localStorage`, clé `mems-store`) — rien n'est envoyé sur un serveur.
- Au premier lancement, un **jeu de démonstration** est chargé automatiquement.
- **Sauvegarde / restauration** : menu du compte → *Sauvegarde (JSON)*, ou onglet
  **Paramètres → Données** (export, restauration, réinitialisation, purge).
- Vider le stockage du navigateur (ou *Réinitialiser la démo*) recharge les données de démonstration.

---

## 🧱 Pile technique

| Couche | Choix |
|--------|-------|
| UI | **React 18** + **Vite 5** |
| Style | **Tailwind CSS** (charte Blue centralisée) |
| État | **Zustand** + middleware `persist` (localStorage) |
| Graphiques | **Recharts** |
| Cartographie | **Leaflet** (marqueurs vectoriels ; fond de tuiles optionnel) |
| Excel | **SheetJS (xlsx)** — import/export `.xlsx` (chargé à la demande) |
| Bilingue / thème | dictionnaire i18n FR/EN + variables CSS clair/sombre (magasins `mems-lang` / `mems-theme`) |
| Icônes / police | **lucide‑react** · **Open Sans** embarquée (`@fontsource`) |

Aucun service tiers requis au chargement ; **Open Sans est embarquée**. Les fonds de
carte proviennent d'OpenStreetMap **si une connexion est disponible** — sinon la carte
reste lisible (marqueurs sur fond neutre), conformément au principe de souveraineté du descriptif.

---

## 📁 Structure

```
web/
├── index.html
├── src/
│   ├── main.jsx · App.jsx            # point d'entrée + routeur (HashRouter)
│   ├── lib/
│   │   ├── constants.js              # charte Blue, rôles, statuts, régions, navigation
│   │   ├── store.js                  # store Zustand + CRUD + persistance + annulation
│   │   ├── seed.js                   # données de démonstration
│   │   ├── compute.js                # métriques dérivées (atteinte, santé, MMR, budget)
│   │   ├── i18n.js · theme.js · tour.js · toast.js   # bilingue · thème · visite guidée · notifications
│   │   ├── docs.js                   # registres versionnés + export/import Excel (.xlsx)
│   │   ├── format.js · id.js · perms.js · export.js · hooks.js
│   ├── components/                   # kit UI (DataTable, EditableCell…), graphiques, carte, coquille, Tour, Toaster, palette ⌘K
│   └── views/                        # une vue par module (+ views/panels & views/docs réutilisables)
```

---

## 🗺️ Portée & suite

Cette version couvre **largement** les modules d'une gestion de projet humanitaire,
chacun de façon **fonctionnelle mais volontairement légère**. Le descriptif MEMS complet
(back‑end Node/Express, PostgreSQL, ~70 tables, connecteurs ODK/Kobo, import SPSS, etc.)
constitue la cible ultérieure : cette base front‑end en reprend la logique métier, la
charte et la structure de navigation, prête à être adossée à une API lorsque nécessaire.

_Application de démonstration — chiffres non contractuels._
