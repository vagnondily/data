// ============================================================================
// « Mes visualisations » — moteur de construction de graphiques
// Décrit les jeux de données explorables (dimensions + mesures), calcule les
// séries agrégées et persiste les visualisations nommées dans le navigateur.
// ============================================================================
import { byId } from './store.js'
import { indicatorAchievement } from './compute.js'
import { num, moneyShort, pct } from './format.js'
import { regionName } from './geo.js'
import {
  C, PROJECT_STATUS, PRIORITY, ACTIVITY_STATUS, SECURITY, SITE_STATUS,
  INDICATOR_LEVEL, VISIT_STATUS, VISIT_TYPE,
} from './constants.js'

const labelOf = (map, k) => map[k]?.label || k || '—'
const codeOf = (list, id) => byId(list, id)?.code || '—'
const nameOf = (list, id) => byId(list, id)?.name || '—'

// Formateurs disponibles (nom → fonction), pour axes & infobulles
export const FMT = { num, money: moneyShort, pct: (v) => pct(v, v % 1 ? 1 : 0) }

// --- Catalogue des jeux de données ------------------------------------------
// dimensions: { key, label, get(row, store) → libellé }  (axe / regroupement)
// measures:   { key, label, agg:'count'|'sum'|'avg', fmt, get(row) → nombre }
export const DATASETS = {
  projects: {
    key: 'projects', label: 'Projets', icon: 'FolderKanban',
    rows: (s) => s.projects,
    dimensions: [
      { key: 'status', label: 'Statut', get: (r) => labelOf(PROJECT_STATUS, r.status) },
      { key: 'priority', label: 'Priorité', get: (r) => labelOf(PRIORITY, r.priority) },
      { key: 'sector', label: 'Secteur', get: (r) => r.sector || '—' },
      { key: 'programme', label: 'Programme', get: (r, s) => nameOf(s.programmes, r.programmeId) },
      { key: 'donor', label: 'Bailleur', get: (r, s) => byId(s.partners, r.donorId)?.acronym || '—' },
    ],
    measures: [
      { key: 'count', label: 'Nombre de projets', agg: 'count', fmt: 'num' },
      { key: 'budget', label: 'Budget total', agg: 'sum', fmt: 'money', get: (r) => r.budget || 0 },
    ],
  },
  indicators: {
    key: 'indicators', label: 'Indicateurs', icon: 'Gauge',
    rows: (s) => s.indicators,
    dimensions: [
      { key: 'level', label: 'Niveau', get: (r) => labelOf(INDICATOR_LEVEL, r.level) },
      { key: 'category', label: 'Catégorie', get: (r) => r.category || '—' },
      { key: 'project', label: 'Projet', get: (r, s) => codeOf(s.projects, r.projectId) },
      { key: 'unit', label: 'Unité', get: (r) => r.unit || '—' },
    ],
    measures: [
      { key: 'count', label: "Nombre d'indicateurs", agg: 'count', fmt: 'num' },
      { key: 'perf', label: 'Performance moyenne', agg: 'avg', fmt: 'pct', get: (r) => indicatorAchievement(r) },
      { key: 'target', label: 'Somme des cibles', agg: 'sum', fmt: 'num', get: (r) => r.target || 0 },
    ],
  },
  activities: {
    key: 'activities', label: 'Activités', icon: 'ListChecks',
    rows: (s) => s.activities,
    dimensions: [
      { key: 'status', label: 'Statut', get: (r) => labelOf(ACTIVITY_STATUS, r.status) },
      { key: 'priority', label: 'Priorité', get: (r) => labelOf(PRIORITY, r.priority) },
      { key: 'project', label: 'Projet', get: (r, s) => codeOf(s.projects, r.projectId) },
    ],
    measures: [
      { key: 'count', label: "Nombre d'activités", agg: 'count', fmt: 'num' },
      { key: 'progress', label: 'Avancement moyen', agg: 'avg', fmt: 'pct', get: (r) => r.progress || 0 },
      { key: 'budget', label: 'Budget total', agg: 'sum', fmt: 'money', get: (r) => r.budget || 0 },
      { key: 'spent', label: 'Dépensé total', agg: 'sum', fmt: 'money', get: (r) => r.spent || 0 },
    ],
  },
  sites: {
    key: 'sites', label: 'Sites', icon: 'MapPin',
    rows: (s) => s.sites,
    dimensions: [
      { key: 'region', label: 'Région', get: (r) => regionName(r.pcode) },
      { key: 'district', label: 'District', get: (r) => r.district || '—' },
      { key: 'security', label: 'Sécurité', get: (r) => labelOf(SECURITY, r.security) },
      { key: 'status', label: 'Statut', get: (r) => labelOf(SITE_STATUS, r.status) },
    ],
    measures: [
      { key: 'count', label: 'Nombre de sites', agg: 'count', fmt: 'num' },
      { key: 'population', label: 'Population', agg: 'sum', fmt: 'num', get: (r) => r.population || 0 },
    ],
  },
  budgetLines: {
    key: 'budgetLines', label: 'Budget', icon: 'Wallet',
    rows: (s) => s.budgetLines,
    dimensions: [
      { key: 'category', label: 'Catégorie', get: (r) => r.category || '—' },
      { key: 'project', label: 'Projet', get: (r, s) => codeOf(s.projects, r.projectId) },
      { key: 'donor', label: 'Bailleur', get: (r, s) => byId(s.partners, r.donorId)?.acronym || '—' },
    ],
    measures: [
      { key: 'planned', label: 'Budget planifié', agg: 'sum', fmt: 'money', get: (r) => r.planned || 0 },
      { key: 'committed', label: 'Engagé', agg: 'sum', fmt: 'money', get: (r) => r.committed || 0 },
      { key: 'spent', label: 'Dépensé', agg: 'sum', fmt: 'money', get: (r) => r.spent || 0 },
    ],
  },
  beneficiaries: {
    key: 'beneficiaries', label: 'Bénéficiaires', icon: 'Users',
    rows: (s) => s.beneficiaries,
    dimensions: [
      { key: 'category', label: 'Catégorie', get: (r) => r.category || '—' },
      { key: 'project', label: 'Projet', get: (r, s) => codeOf(s.projects, r.projectId) },
      { key: 'site', label: 'Site', get: (r, s) => nameOf(s.sites, r.siteId) },
    ],
    measures: [
      { key: 'reached', label: 'Bénéficiaires atteints', agg: 'sum', fmt: 'num', get: (r) => r.reachedTotal || 0 },
      { key: 'planned', label: 'Bénéficiaires ciblés', agg: 'sum', fmt: 'num', get: (r) => r.plannedTotal || 0 },
    ],
  },
  visits: {
    key: 'visits', label: 'Visites de suivi', icon: 'ClipboardCheck',
    rows: (s) => s.visits,
    dimensions: [
      { key: 'status', label: 'Statut', get: (r) => labelOf(VISIT_STATUS, r.status) },
      { key: 'type', label: 'Type', get: (r) => labelOf(VISIT_TYPE, r.type) },
      { key: 'month', label: 'Mois', time: true, get: (r) => (r.date || '').slice(0, 7) || '—' },
      { key: 'project', label: 'Projet', get: (r, s) => codeOf(s.projects, r.projectId) },
    ],
    measures: [
      { key: 'count', label: 'Nombre de visites', agg: 'count', fmt: 'num' },
      { key: 'score', label: 'Score moyen', agg: 'avg', fmt: 'num', get: (r) => r.score || 0 },
    ],
  },
}

export const DATASET_KEYS = Object.keys(DATASETS)
export const CHART_TYPES = [
  { key: 'bar', label: 'Barres' },
  { key: 'column', label: 'Colonnes' },
  { key: 'line', label: 'Courbe' },
  { key: 'donut', label: 'Anneau' },
]

export function datasetOf(key) { return DATASETS[key] || DATASETS.projects }
export function dimOf(ds, key) { return ds.dimensions.find((d) => d.key === key) || ds.dimensions[0] }
export function measureOf(ds, key) { return ds.measures.find((m) => m.key === key) || ds.measures[0] }

/**
 * Calcule la série agrégée pour une configuration donnée.
 * @returns { data:[{name,value}], total, fmt, dim, measure, empty }
 */
export function buildSeries(store, cfg, { limit = 12 } = {}) {
  const ds = datasetOf(cfg.dataset)
  const dim = dimOf(ds, cfg.dim)
  const measure = measureOf(ds, cfg.measure)
  const rows = ds.rows(store) || []
  const groups = new Map()
  for (const r of rows) {
    const name = String(dim.get(r, store) ?? '—')
    const g = groups.get(name) || { sum: 0, count: 0, n: 0 }
    g.n += 1 // nombre de lignes (pour l'agrégat « count »)
    if (measure.agg === 'count') {
      g.sum += 1
    } else {
      const v = measure.get?.(r)
      if (v != null && !Number.isNaN(v)) { g.sum += Number(v); g.count += 1 } // moyenne : ignore les valeurs absentes
    }
    groups.set(name, g)
  }
  let data = [...groups.entries()].map(([name, g]) => ({
    name,
    value: measure.agg === 'count' ? g.n : measure.agg === 'avg' ? (g.count ? g.sum / g.count : 0) : g.sum,
  }))
  // Tri : chronologique pour une dimension temporelle, sinon par valeur décroissante
  if (dim.time) data.sort((a, b) => a.name.localeCompare(b.name))
  else data.sort((a, b) => b.value - a.value)
  data = data.slice(0, limit).map((d, i) => ({ ...d, value: Math.round(d.value * 100) / 100 }))
  const total = measure.agg === 'avg'
    ? (data.length ? data.reduce((n, d) => n + d.value, 0) / data.length : 0)
    : data.reduce((n, d) => n + d.value, 0)
  return { data, total, fmt: FMT[measure.fmt] || num, dim, measure, empty: data.length === 0 }
}

// --- Persistance des visualisations nommées ---------------------------------
export const VIZ_KEY = 'mems-visualisations'

export function loadViz() {
  try { const v = JSON.parse(localStorage.getItem(VIZ_KEY)); return Array.isArray(v) ? v : [] }
  catch { return [] }
}
export function saveViz(list) {
  try { localStorage.setItem(VIZ_KEY, JSON.stringify(list)) } catch { /* quota */ }
}

// Configuration par défaut d'une nouvelle visualisation
export function defaultCfg() {
  return { dataset: 'projects', dim: 'status', measure: 'count', chart: 'donut' }
}
