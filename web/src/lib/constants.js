// ============================================================================
// MEMS — Référentiels & constantes (charte WFP, rôles, statuts, géographie)
// ============================================================================

export const ORG_DEFAULT = {
  name: 'Bureau Pays — Madagascar',
  acronym: 'MEMS',
  country: 'Madagascar',
  currency: 'USD',
  fiscalYear: 2025,
  scopeMode: 'national',
}

// --- Charte couleurs WFP (miroir de tailwind.config.js, pour Recharts/JS) ----
export const C = {
  brand: '#007DBC',
  brandD: '#085387',
  brandDeep: '#03293D',
  brandTint: '#E2F0F9',
  ok: '#689E18',
  warn: '#F7B825',
  bad: '#C5192D',
  ink: '#0F2231',
  inkSoft: '#43596A',
  inkMute: '#6F8798',
  line: '#D6E2EC',
}
// Palette catégorielle pour les graphiques (dérivée de la charte)
export const CHART_COLORS = [
  '#007DBC', '#689E18', '#F7B825', '#C5192D', '#5B4B8A',
  '#0FA3A3', '#E8743B', '#8A6D3B', '#546E7A', '#7CB342',
]

// --- Rôles (2 axes : rôle = ce qu'on peut faire) -----------------------------
export const ROLES = {
  super: { label: 'Super-utilisateur', rank: 6, can: ['view', 'edit', 'validate', 'admin', 'super'], color: 'brand' },
  admin: { label: 'Administrateur', rank: 5, can: ['view', 'edit', 'validate', 'admin'], color: 'brand' },
  validator: { label: 'Validateur', rank: 4, can: ['view', 'edit', 'validate'], color: 'ok' },
  editor: { label: 'Éditeur', rank: 3, can: ['view', 'edit'], color: 'warn' },
  viewer: { label: 'Lecteur', rank: 2, can: ['view'], color: 'ink' },
  dashboard: { label: 'Écran de supervision', rank: 1, can: ['view'], color: 'ink' },
}
export const ROLE_KEYS = Object.keys(ROLES)

// --- Statuts projet ----------------------------------------------------------
export const PROJECT_STATUS = {
  identification: { label: 'Identification', tone: 'ink' },
  planification: { label: 'Planification', tone: 'brand' },
  en_cours: { label: 'En cours', tone: 'ok' },
  suspendu: { label: 'Suspendu', tone: 'warn' },
  cloture: { label: 'Clôturé', tone: 'ink' },
  annule: { label: 'Annulé', tone: 'bad' },
}

export const PROGRAMME_STATUS = {
  actif: { label: 'Actif', tone: 'ok' },
  planifie: { label: 'Planifié', tone: 'brand' },
  cloture: { label: 'Clôturé', tone: 'ink' },
}

// --- Statuts activité (colonnes Kanban) --------------------------------------
export const ACTIVITY_STATUS = {
  todo: { label: 'À faire', tone: 'ink', col: 0 },
  doing: { label: 'En cours', tone: 'brand', col: 1 },
  blocked: { label: 'Bloqué', tone: 'bad', col: 2 },
  done: { label: 'Terminé', tone: 'ok', col: 3 },
}
export const ACTIVITY_ORDER = ['todo', 'doing', 'blocked', 'done']

export const PRIORITY = {
  haute: { label: 'Haute', tone: 'bad' },
  moyenne: { label: 'Moyenne', tone: 'warn' },
  basse: { label: 'Basse', tone: 'ink' },
}

export const VISIT_STATUS = {
  planifie: { label: 'Planifiée', tone: 'brand' },
  realise: { label: 'Réalisée', tone: 'ok' },
  annule: { label: 'Annulée', tone: 'ink' },
}
export const VISIT_TYPE = {
  routine: { label: 'Routine' },
  tpm: { label: 'TPM (tiers)' },
  ponctuelle: { label: 'Ponctuelle' },
  conjointe: { label: 'Conjointe' },
}

export const SECURITY = {
  vert: { label: 'Accessible', tone: 'ok' },
  orange: { label: 'Vigilance', tone: 'warn' },
  rouge: { label: 'Accès restreint', tone: 'bad' },
}

export const SITE_STATUS = {
  actif: { label: 'Actif', tone: 'ok' },
  suspendu: { label: 'Suspendu', tone: 'warn' },
  clos: { label: 'Clos', tone: 'ink' },
}

export const TPM_STATUS = {
  brouillon: { label: 'Brouillon', tone: 'ink' },
  soumis: { label: 'Soumis', tone: 'brand' },
  valide_bureau: { label: 'Validé bureau', tone: 'warn' },
  valide_pays: { label: 'Validé pays', tone: 'ok' },
  rejete: { label: 'Rejeté', tone: 'bad' },
}

export const IMPORT_STATUS = {
  apercu: { label: 'Aperçu', tone: 'ink' },
  en_attente: { label: 'En attente', tone: 'warn' },
  valide: { label: 'Validé', tone: 'ok' },
  rejete: { label: 'Rejeté', tone: 'bad' },
}

// --- Plan MRE (suivi-évaluation & budget) ------------------------------------
export const MRE_TYPES = {
  enquete: { label: 'Enquête / PDM' },
  evaluation: { label: 'Évaluation' },
  tpm: { label: 'TPM' },
  suivi: { label: 'Suivi de routine' },
  redevabilite: { label: 'Redevabilité (CFM)' },
  capitalisation: { label: 'Capitalisation / apprentissage' },
}
export const MRE_STATUS = {
  planifie: { label: 'Planifié', tone: 'brand' },
  en_cours: { label: 'En cours', tone: 'warn' },
  realise: { label: 'Réalisé', tone: 'ok' },
  annule: { label: 'Annulé', tone: 'ink' },
}

// --- Indice de conformité /100 (bandes reprises de la maquette bailleur) ------
export const COMPLIANCE_BANDS = [
  { key: 'exc', label: 'Excellent', min: 80, color: '#3F7D0E' },
  { key: 'sat', label: 'Satisfaisant', min: 65, color: '#689E18' },
  { key: 'amel', label: 'À améliorer', min: 50, color: '#C99406' },
  { key: 'urg', label: 'Action urgente', min: 0, color: '#C5192D' },
]
export function complianceBand(score) {
  if (score == null) return { key: 'non', label: 'Non évalué', color: '#7C8B95' }
  return COMPLIANCE_BANDS.find((b) => score >= b.min) || COMPLIANCE_BANDS[COMPLIANCE_BANDS.length - 1]
}
export const MMR_TARGET = 80 // couverture cible (%)

// --- Niveaux & natures d'indicateurs -----------------------------------------
export const INDICATOR_LEVEL = {
  impact: { label: 'Impact' },
  outcome: { label: 'Effet (outcome)' },
  output: { label: 'Produit (output)' },
  process: { label: 'Processus' },
}
export const POLARITY = {
  positive: { label: 'Croissant (↑ mieux)' },
  negative: { label: 'Décroissant (↓ mieux)' },
}

// --- Secteurs / catégories d'activité ----------------------------------------
export const SECTORS = [
  'Sécurité alimentaire',
  'Nutrition',
  'Résilience & moyens de subsistance',
  'Cantines scolaires',
  'Réponse aux chocs',
  'Transferts monétaires',
  'Logistique',
  'Protection & genre',
]

// --- Découpage géographique : régions de Madagascar (socle carto) -------------
export const REGIONS = [
  { pcode: 'MG11', name: 'Analamanga', lat: -18.91, lng: 47.54 },
  { pcode: 'MG12', name: 'Vakinankaratra', lat: -19.87, lng: 47.03 },
  { pcode: 'MG13', name: 'Itasy', lat: -19.02, lng: 46.72 },
  { pcode: 'MG14', name: 'Bongolava', lat: -18.77, lng: 46.05 },
  { pcode: 'MG21', name: 'Haute Matsiatra', lat: -21.45, lng: 47.09 },
  { pcode: 'MG22', name: "Amoron'i Mania", lat: -20.53, lng: 47.25 },
  { pcode: 'MG23', name: 'Vatovavy', lat: -21.23, lng: 48.34 },
  { pcode: 'MG24', name: 'Fitovinany', lat: -22.15, lng: 48.02 },
  { pcode: 'MG25', name: 'Atsimo-Atsinanana', lat: -22.82, lng: 47.83 },
  { pcode: 'MG26', name: 'Ihorombe', lat: -22.4, lng: 46.12 },
  { pcode: 'MG31', name: 'Menabe', lat: -20.28, lng: 44.28 },
  { pcode: 'MG32', name: 'Atsimo-Andrefana', lat: -23.35, lng: 43.68 },
  { pcode: 'MG33', name: 'Androy', lat: -25.17, lng: 46.08 },
  { pcode: 'MG34', name: 'Anosy', lat: -25.03, lng: 46.98 },
  { pcode: 'MG35', name: 'Melaky', lat: -18.06, lng: 44.02 },
  { pcode: 'MG41', name: 'Boeny', lat: -15.72, lng: 46.32 },
  { pcode: 'MG42', name: 'Sofia', lat: -14.87, lng: 47.98 },
  { pcode: 'MG43', name: 'Betsiboka', lat: -16.95, lng: 46.83 },
  { pcode: 'MG51', name: 'Alaotra-Mangoro', lat: -17.83, lng: 48.42 },
  { pcode: 'MG52', name: 'Analanjirofo', lat: -17.68, lng: 49.42 },
  { pcode: 'MG53', name: 'Atsinanana', lat: -18.15, lng: 49.4 },
  { pcode: 'MG61', name: 'Diana', lat: -12.28, lng: 49.29 },
  { pcode: 'MG62', name: 'Sava', lat: -14.27, lng: 50.17 },
]
export const COUNTRY_CENTER = { lat: -18.9, lng: 46.8, zoom: 5 }
export function regionByPcode(pcode) {
  return REGIONS.find((r) => r.pcode === pcode)
}

// --- Périodes (trimestres) pour la saisie des indicateurs --------------------
export const PERIODS = ['2025-T1', '2025-T2', '2025-T3', '2025-T4']

// --- Navigation : 7 sections repliables (accordéon), sous-éléments imbriqués -
export const NAV = [
  { label: 'Tableau de bord', icon: 'LayoutDashboard', to: '/' },
  {
    label: 'Programmes & projets', icon: 'FolderKanban', items: [
      { to: '/programmes', label: 'Programmes', icon: 'FolderKanban' },
      { to: '/projets', label: 'Projets', icon: 'Briefcase' },
    ],
  },
  {
    label: 'Mise en œuvre', icon: 'ListChecks', items: [
      { to: '/activites', label: 'Activités', icon: 'ListChecks' },
      { to: '/planning', label: 'Planning', icon: 'CalendarRange' },
      { to: '/budget', label: 'Budget', icon: 'Wallet' },
      { to: '/pdd', label: 'Plan de distribution', icon: 'Boxes' },
    ],
  },
  {
    label: 'Suivi & évaluation', icon: 'Target', items: [
      { to: '/indicateurs', label: 'Indicateurs', icon: 'Target' },
      { to: '/plan-suivi', label: 'Plan de suivi', icon: 'CalendarCheck' },
      { to: '/suivi', label: 'Suivi & visites', icon: 'ClipboardCheck' },
      { to: '/mre', label: 'Plan MRE', icon: 'ClipboardList' },
      { to: '/beneficiaires', label: 'Bénéficiaires', icon: 'Users' },
    ],
  },
  {
    label: 'Terrain', icon: 'MapPin', items: [
      { to: '/sites', label: 'Sites & carte', icon: 'MapPin' },
      { to: '/tpm', label: 'Suivi tiers (TPM)', icon: 'Handshake' },
    ],
  },
  {
    label: 'Données & rapports', icon: 'FileBarChart', items: [
      { to: '/import', label: 'Import de données', icon: 'Upload' },
      { to: '/rapports', label: 'Rapports', icon: 'FileBarChart' },
    ],
  },
  {
    label: 'Administration', icon: 'UserCog', items: [
      { to: '/utilisateurs', label: 'Utilisateurs', icon: 'UserCog' },
      { to: '/parametres', label: 'Paramètres', icon: 'Settings' },
    ],
  },
]

// Liste à plat de toutes les destinations (mode rail + palette)
export const NAV_LEAVES = NAV.flatMap((s) => (s.items ? s.items : [{ to: s.to, label: s.label, icon: s.icon }]))
