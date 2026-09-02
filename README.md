# MEMS — Monitoring & Evaluation Management System

**Application web de gestion de projets/programmes humanitaires** (suivi‑évaluation),
inspirée du descriptif produit MEMS et de la logique de gestion de projet.
Première version **fonctionnelle**, **front‑end uniquement** : elle tourne sans
serveur ni base de données — les données sont persistées **dans le navigateur**
(localStorage). Interface **intégralement en français**, charte **WFP** (bleu `#007DBC`).

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
- **Import de données** — barrière **Aperçu → Dépôt (en attente) → Validation** (parsing CSV réel).
- **Rapports** — extraction **CSV/Excel** de tout jeu de données + **générateur de rapport** imprimable (HTML → PDF).

### Administration
- **Utilisateurs & rôles** — 6 rôles (`super`, `admin`, `validator`, `editor`, `viewer`, `dashboard`).
- **Paramètres** — organisation, partenaires, bureaux, référentiels, sauvegarde/restauration JSON.

---

## 🚀 Démarrage rapide

**Prérequis** : Node.js 18+ et npm.

```bash
cd web
npm install       # installe les dépendances
npm run dev       # démarre le serveur de développement → http://localhost:4000
```

Pour une build de production :

```bash
cd web
npm run build     # génère web/dist
npm run preview   # sert la build → http://localhost:4000
```

`web/dist` est un site **statique** : il peut être servi par n'importe quel
hébergement de fichiers statiques (Nginx, Apache, un bucket, un partage réseau…).

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
| Style | **Tailwind CSS** (charte WFP centralisée) |
| État | **Zustand** + middleware `persist` (localStorage) |
| Graphiques | **Recharts** |
| Cartographie | **Leaflet** (marqueurs vectoriels ; fond de tuiles optionnel) |
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
│   │   ├── constants.js              # charte WFP, rôles, statuts, régions, navigation
│   │   ├── store.js                  # store Zustand + CRUD + persistance
│   │   ├── seed.js                   # données de démonstration
│   │   ├── compute.js                # métriques dérivées (atteinte, santé, MMR, budget)
│   │   ├── format.js · id.js · perms.js · export.js
│   ├── components/                   # kit UI, graphiques, carte, coquille (sidebar/topbar)
│   └── views/                        # une vue par module (+ views/panels réutilisables)
```

---

## 🗺️ Portée & suite

Cette version couvre **largement** les modules d'une gestion de projet humanitaire,
chacun de façon **fonctionnelle mais volontairement légère**. Le descriptif MEMS complet
(back‑end Node/Express, PostgreSQL, ~70 tables, connecteurs ODK/Kobo, import SPSS, etc.)
constitue la cible ultérieure : cette base front‑end en reprend la logique métier, la
charte et la structure de navigation, prête à être adossée à une API lorsque nécessaire.

_Application de démonstration — chiffres non contractuels._
