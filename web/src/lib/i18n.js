// ============================================================================
// Bilingue FR / EN — magasin de langue + traduction par dictionnaire.
// t(s) renvoie l'anglais quand la langue est 'en' et que la clé existe,
// sinon la chaîne FR d'origine (donc aucune régression si non traduit).
// La bascule de langue remonte l'arbre (clé sur la racine) → t() est réévalué.
// ============================================================================
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useLang = create(persist((set) => ({
  lang: 'fr',
  setLang: (lang) => set({ lang }),
  toggle: () => set((s) => ({ lang: s.lang === 'fr' ? 'en' : 'fr' })),
}), { name: 'mems-lang', storage: createJSONStorage(() => localStorage) }))

// --- Dictionnaire FR → EN ---------------------------------------------------
const EN = {
  // Sections & pages de navigation
  'Tableau de bord': 'Dashboard', 'Programmes & projets': 'Programs & projects',
  'Mise en œuvre': 'Implementation', 'Suivi & évaluation': 'Monitoring & evaluation',
  'Terrain': 'Field', 'Données & rapports': 'Data & reports', 'Administration': 'Administration',
  'Programmes': 'Programs', 'Projets': 'Projects', 'Activités': 'Activities', 'Planning': 'Timeline',
  'Budget': 'Budget', 'Plan de distribution': 'Distribution plan', 'Indicateurs': 'Indicators',
  'Plan de suivi': 'Monitoring plan', 'Suivi & visites': 'Monitoring & visits', 'Plan MRE': 'MRE plan',
  'Bénéficiaires': 'Beneficiaries', 'Sites & carte': 'Sites & map', 'Suivi tiers (TPM)': 'Third-party monitoring (TPM)',
  'Import de données': 'Data import', 'Rapports': 'Reports', 'Utilisateurs': 'Users', 'Paramètres': 'Settings',
  // Titres de pages
  'Utilisateurs & rôles': 'Users & roles', 'Plan de suivi des sites': 'Site monitoring plan',
  'Plan de distribution (PDD)': 'Distribution plan (DPP)', 'Suivi tiers (TPM)': 'Third-party monitoring (TPM)',
  'Détail du projet': 'Project detail',
  // Onglets
  'Aperçu': 'Overview', 'Cadre logique': 'Logframe', 'Sites': 'Sites', 'Suivi': 'Monitoring', 'Équipe': 'Team',
  'Programme': 'Program', 'Organisation': 'Organization', 'Partenaires': 'Partners', 'Bureaux': 'Offices',
  'Référentiels': 'Reference data', 'Données': 'Data',
  // Statuts (projet/programme/activité/visite/site/tpm/import/mre/doc)
  'Identification': 'Identification', 'Planification': 'Planning', 'En cours': 'Ongoing', 'Suspendu': 'Suspended',
  'Clôturé': 'Closed', 'Annulé': 'Cancelled', 'Actif': 'Active', 'Planifié': 'Planned',
  'À faire': 'To do', 'Bloqué': 'Blocked', 'Terminé': 'Done',
  'Planifiée': 'Planned', 'Réalisée': 'Completed', 'Annulée': 'Cancelled', 'Réalisé': 'Completed',
  'Accessible': 'Accessible', 'Vigilance': 'Caution', 'Accès restreint': 'Restricted access',
  'Clos': 'Closed', 'Brouillon': 'Draft', 'Soumis': 'Submitted', 'Validé bureau': 'Office-approved',
  'Validé pays': 'Country-approved', 'Rejeté': 'Rejected', 'En attente': 'Pending', 'Validé': 'Validated',
  'Distribué': 'Distributed', 'Prévu': 'Planned',
  // Priorités & niveaux
  'Haute': 'High', 'Moyenne': 'Medium', 'Basse': 'Low', 'Priorité Haute': 'High priority',
  'Impact': 'Impact', 'Effet (outcome)': 'Outcome', 'Produit (output)': 'Output', 'Processus': 'Process',
  'Élevé': 'High', 'Moyen': 'Medium', 'Faible': 'Low',
  // Types
  'Routine': 'Routine', 'TPM (tiers)': 'TPM (third-party)', 'Ponctuelle': 'Ad hoc', 'Conjointe': 'Joint',
  'Enquête / PDM': 'Survey / PDM', 'Évaluation': 'Evaluation', 'TPM': 'TPM', 'Suivi de routine': 'Routine monitoring',
  'Redevabilité (CFM)': 'Accountability (CFM)', 'Capitalisation / apprentissage': 'Learning / capitalization',
  'Vivres': 'Food', 'Cash': 'Cash', 'Bon': 'Voucher',
  // Rôles
  'Super-utilisateur': 'Super user', 'Administrateur': 'Administrator', 'Validateur': 'Validator',
  'Éditeur': 'Editor', 'Lecteur': 'Viewer', 'Écran de supervision': 'Dashboard screen',
  // Santé projet
  'Sur la bonne voie': 'On track', 'À surveiller': 'Watch', 'En retard': 'Behind', 'En préparation': 'In preparation', 'Terminé': 'Done',
  // Actions / boutons
  'Enregistrer': 'Save', 'Annuler': 'Cancel', 'Modifier': 'Edit', 'Supprimer': 'Delete', 'Ouvrir': 'Open',
  'Dupliquer': 'Duplicate', 'Créer': 'Create', 'Créer…': 'Create…', 'Fermer': 'Close', 'Valider': 'Validate',
  'Rétablir': 'Undo', 'Suppression annulée': 'Deletion undone',
  'sélectionné(s)': 'selected', 'Désélectionner': 'Clear', 'Tout sélectionner': 'Select all',
  'Sélectionner la ligne': 'Select row', 'Exporter la sélection': 'Export selection',
  'Aide — visite guidée': 'Help — guided tour', 'Langue': 'Language',
  'Rejeter': 'Reject', 'Réinitialiser': 'Reset', 'Confirmer': 'Confirm', 'Retour aux projets': 'Back to projects',
  'Retour aux programmes': 'Back to programs', 'Retour au registre': 'Back to registry',
  'Exporter Excel': 'Export Excel', 'Importer Excel': 'Import Excel', 'Exporter en Excel': 'Export to Excel',
  'Exporter (JSON)': 'Export (JSON)', 'Restaurer une sauvegarde': 'Restore a backup',
  'Ajouter une ligne': 'Add a row', 'Ajouter une activité': 'Add an activity', 'Ajouter': 'Add',
  'Ajouter une ligne budgétaire': 'Add a budget line', 'Ajouter une mission': 'Add a mission',
  'Planifier une visite': 'Schedule a visit', 'Marquer réalisée': 'Mark completed', 'Valider (pays)': 'Approve (country)',
  'Nouveau projet': 'New project', 'Nouveau programme': 'New program', 'Nouveau site': 'New site',
  'Nouveau plan de suivi': 'New monitoring plan', 'Nouveau PDD': 'New DPP', 'Nouvel utilisateur': 'New user',
  'Nouvelle activité': 'New activity', 'Nouveau partenaire': 'New partner', 'Nouveau bureau': 'New office',
  'Nouvel indicateur': 'New indicator', 'Nouveau contrat': 'New contract', 'Nouvelle mission': 'New mission',
  'Nouvelle dépense': 'New expense', 'Nouvelle ligne': 'New row', 'Objectif': 'Objective', 'Résultat': 'Result',
  'Nouvel objectif spécifique': 'New specific objective', 'Nouveau résultat attendu': 'New expected result',
  'Projets': 'Projects', 'Projet': 'Project', 'Saisie': 'Data entry', 'Replier le menu': 'Collapse menu',
  'Réinitialiser la démo': 'Reset demo', 'Sauvegarde (JSON)': 'Backup (JSON)', 'Vider les données métier': 'Wipe business data',
  'Nouvelle activité MRE': 'New MRE activity', 'Générer le rapport': 'Generate report', 'Exporter en CSV': 'Export to CSV',
  // Menus / entêtes divers
  'Activité récente': 'Recent activity', 'Se connecter en tant que (démo)': 'Log in as (demo)',
  'Rechercher…': 'Search…', 'Rechercher': 'Search', 'Rechercher un projet…': 'Search a project…',
  'Rechercher un site…': 'Search a site…', 'Rechercher une activité…': 'Search an activity…',
  'Palette de commandes (⌘K)': 'Command palette (⌘K)',
  // Vues (segmented)
  'Cartes': 'Cards', 'Tableau': 'Table', 'Kanban': 'Kanban', 'Liste': 'List', 'Carte': 'Map',
  'Sécurité': 'Security',
  // En-têtes de colonnes fréquents
  'Code': 'Code', 'Nom': 'Name', 'Statut': 'Status', 'Santé': 'Health', 'Avancement': 'Progress',
  'Dépensé': 'Spent', 'Échéance': 'Deadline', 'Bénéf.': 'Benef.', 'Site': 'Site', 'Bureau': 'Office',
  'Activité': 'Activity', 'Responsable': 'Owner', 'Type': 'Type', 'Date': 'Date', 'Score': 'Score',
  'Priorité': 'Priority', 'Cible': 'Target', 'Prévu': 'Planned', 'Réalisé': 'Actual', 'Référence': 'Reference',
  'Période': 'Period', 'Périmètre': 'Scope', 'Lignes': 'Rows', 'Mise à jour': 'Updated', 'Programme': 'Program',
  'Coût prévu': 'Planned cost', 'Conso.': 'Usage', 'Consommation': 'Usage', 'Engagé': 'Committed',
  'Bailleur': 'Donor', 'Catégorie': 'Category', 'Fonction': 'Role', 'État': 'State', 'Rôle': 'Role',
  'Niveau': 'Level', 'Unité': 'Unit', 'Atteinte': 'Achievement', 'Tendance': 'Trend', 'Réalisé': 'Actual',
  'Suivi par': 'Monitored by', 'Fichier': 'File', 'Source': 'Source', 'Déposé par': 'Uploaded by',
  'Niveau de risque': 'Risk level', 'Fréquence de suivi': 'Monitoring frequency', 'Modalité': 'Modality',
  'Objet': 'Subject', 'Plafond': 'Ceiling', 'Consommé': 'Used', 'Missions': 'Missions', 'Réalisées': 'Completed',
  // Champs de formulaire
  'Description': 'Description', 'Gestionnaire': 'Manager', 'Devise': 'Currency', 'Secteur': 'Sector',
  'Secteurs': 'Sectors', 'Début': 'Start', 'Fin': 'End', 'Date de début': 'Start date', 'Date de fin': 'End date',
  'Version': 'Version', 'Note': 'Note', 'Intitulé': 'Title', 'Chef de projet': 'Project lead', 'Bureau': 'Office',
  'Objectif global': 'Overall objective', 'Zones d’intervention (régions)': 'Intervention areas (regions)',
  'E-mail': 'Email', 'Nom complet': 'Full name', 'Latitude': 'Latitude', 'Longitude': 'Longitude',
  'Population': 'Population', 'Commune': 'Municipality', 'Région': 'Region', 'Projets rattachés': 'Linked projects',
  // Filtres / phrases fréquentes
  'Tous les projets': 'All projects', 'Tous les statuts': 'All statuses', 'Tous statuts': 'All statuses',
  'Tous les programmes': 'All programs', 'Toutes les régions': 'All regions', 'Tous les bureaux': 'All offices',
  'Aucune donnée': 'No data', 'Rien à afficher': 'Nothing to show', 'Aucun résultat': 'No results',
  'Aucun projet trouvé': 'No project found', 'Aucun site': 'No site', 'Aucune activité': 'No activity',
  'Périmètre (bureau)': 'Scope (office)', 'Tous les bureaux': 'All offices',
  // Palette
  'Page': 'Page', 'Indicateur': 'Indicator', 'Document': 'Document', 'Général': 'General',
  // Sous-titres de pages (statiques + fragments dynamiques)
  'projet(s) dans le portefeuille': 'project(s) in the portfolio',
  'portefeuille(s) · gestion par programme': 'portfolio(s) · program management',
  "site(s) d'intervention": 'intervention site(s)',
  "compte(s) · le rôle dit ce qu'on peut faire, le bureau dit où": 'account(s) · the role says what you can do, the office says where',
  'Ciblage de la population et personnes atteintes': 'Population targeting and people reached',
  'Cadre de mesure du portefeuille — référence, cible, réalisé': 'Portfolio measurement framework — baseline, target, actual',
  'Planification et exécution des activités du portefeuille': 'Planning and execution of portfolio activities',
  'Suivi & évaluation des projets humanitaires': 'Monitoring & evaluation of humanitarian projects',
  'Programme :': 'Program:',
  // Filtres additionnels
  'Tous les projets': 'All projects', 'Tous les bureaux': 'All offices', 'Colorer par': 'Color by',
  'Toutes les régions': 'All regions', 'Projet :': 'Project:',
  "vue d'ensemble du portefeuille": 'portfolio overview',
  // Dashboard — titres de sections & cartes
  'Budget prévu vs dépensé — par projet': 'Planned vs spent budget — by project',
  'Suivi & conformité': 'Monitoring & compliance', 'Taux d’atteinte moyen des indicateurs': 'Average indicator achievement',
  'Budget par programme': 'Budget by program', 'Projets à surveiller': 'Projects to watch',
  'Alertes': 'Alerts', 'Activité récente du portefeuille': 'Recent portfolio activity',
  'Prévu': 'Planned', 'Dépensé': 'Spent', 'Ciblé': 'Targeted', 'Atteint': 'Reached',
  'Projets actifs': 'Active projects', 'Bénéficiaires atteints': 'Beneficiaries reached',
  'Budget dépensé': 'Budget spent', 'Couverture suivi': 'Monitoring coverage', 'Conformité': 'Compliance',
  'Conformité /100': 'Compliance /100', 'Atteinte indicateurs': 'Indicator achievement',
  'Meilleurs indicateurs': 'Top indicators', 'moyenne pondérée': 'weighted average',
  'Activité récente': 'Recent activity', 'Taux d’atteinte (%)': 'Achievement rate (%)',
  'couverture': 'coverage', 'Sites suivis': 'Sites monitored',
  'site(s) en action urgente (score < 50)': 'site(s) needing urgent action (score < 50)',
  // Bandes de conformité
  'Excellent': 'Excellent', 'Satisfaisant': 'Satisfactory', 'À améliorer': 'Needs improvement',
  'Action urgente': 'Urgent action', 'Non évalué': 'Not assessed',
  // Sous-libellés KPI (fragments)
  'sur': 'of', 'au total': 'total', 'du prévu': 'of planned', 'cible': 'target',
  'prévu total': 'planned total', 'Suivi & Évaluation': 'Monitoring & Evaluation',
  'Projets à surveiller': 'Projects to watch',
  'Tous les projets actifs sont sur la bonne voie 👍': 'All active projects are on track 👍',
}

export function t(s) {
  if (s == null) return s
  if (typeof s !== 'string') return s
  return useLang.getState().lang === 'en' ? (EN[s] ?? s) : s
}
