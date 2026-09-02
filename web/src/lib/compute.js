// ============================================================================
// Calculs dérivés — prévu vs réalisé, taux d'atteinte, santé projet, MMR
// Fonctions pures : reçoivent les données, ne touchent pas au store.
// ============================================================================
import { clamp } from './format.js'
import { complianceBand, MMR_TARGET } from './constants.js'
import { t } from './i18n.js'

// ---- Indicateurs -----------------------------------------------------------
export function latestActual(ind) {
  const withActual = (ind.values || []).filter((v) => v.actual != null)
  if (!withActual.length) return null
  return withActual[withActual.length - 1]
}
export function plannedToDate(ind) {
  const vals = (ind.values || []).filter((v) => v.planned != null)
  if (!vals.length) return 0
  return vals[vals.length - 1].planned
}
export function indicatorAchievement(ind) {
  const lv = latestActual(ind)
  if (!lv || !ind.target) return null
  const raw = ind.polarity === 'negative'
    ? (lv.actual === 0 ? 100 : (ind.target / lv.actual) * 100)
    : (lv.actual / ind.target) * 100
  return clamp(raw, 0, 999)
}
export function indicatorActual(ind) {
  const lv = latestActual(ind)
  return lv ? lv.actual : null
}
export function achievementTone(pct) {
  if (pct == null) return 'ink'
  if (pct >= 90) return 'ok'
  if (pct >= 65) return 'warn'
  return 'bad'
}

// ---- Budget ----------------------------------------------------------------
export function budgetForProject(budgetLines, projectId) {
  const lines = budgetLines.filter((b) => b.projectId === projectId)
  const planned = sum(lines, 'planned')
  const committed = sum(lines, 'committed')
  const spent = sum(lines, 'spent')
  return { planned, committed, spent, burn: planned ? (spent / planned) * 100 : 0, lines }
}
export function budgetByKey(budgetLines, key) {
  const map = {}
  budgetLines.forEach((b) => {
    const k = b[key] || '—'
    if (!map[k]) map[k] = { key: k, planned: 0, committed: 0, spent: 0 }
    map[k].planned += b.planned || 0
    map[k].committed += b.committed || 0
    map[k].spent += b.spent || 0
  })
  return Object.values(map).sort((a, b) => b.planned - a.planned)
}

// ---- Projets ---------------------------------------------------------------
export function timeElapsedPct(project) {
  const s = new Date(project.startDate).getTime()
  const e = new Date(project.endDate).getTime()
  const now = Date.now()
  if (!s || !e || e <= s) return 0
  return clamp(((now - s) / (e - s)) * 100)
}
export function projectProgress(activities, projectId) {
  const acts = activities.filter((a) => a.projectId === projectId)
  if (!acts.length) return 0
  const total = acts.reduce((n, a) => n + (a.status === 'done' ? 100 : a.progress || 0), 0)
  return Math.round(total / acts.length)
}
export function projectHealth(project, progress, budget) {
  if (['cloture', 'annule'].includes(project.status)) return { key: 'neutre', label: t('Terminé'), tone: 'ink' }
  if (project.status === 'planification' || project.status === 'identification')
    return { key: 'prep', label: t('En préparation'), tone: 'brand' }
  const elapsed = timeElapsedPct(project)
  const gap = progress - elapsed
  const burnGap = (budget?.burn || 0) - elapsed
  let key, label, tone
  if (gap >= -10 && burnGap <= 20) { key = 'vert'; label = t('Sur la bonne voie'); tone = 'ok' }
  else if (gap >= -25 && burnGap <= 35) { key = 'orange'; label = t('À surveiller'); tone = 'warn' }
  else { key = 'rouge'; label = t('En retard'); tone = 'bad' }
  return { key, label, tone, gap: Math.round(gap) }
}

// ---- Bénéficiaires ---------------------------------------------------------
export function beneficiaryRollup(beneficiaries, filter = () => true) {
  const rows = beneficiaries.filter(filter)
  const planned = sum(rows, 'plannedTotal')
  const reached = sum(rows, 'reachedTotal')
  const reachedM = sum(rows, 'reachedM')
  const reachedF = sum(rows, 'reachedF')
  return {
    planned, reached, reachedM, reachedF,
    rate: planned ? (reached / planned) * 100 : 0,
    femRate: reached ? (reachedF / reached) * 100 : 0,
    rows,
  }
}

// ---- MMR / couverture & conformité ----------------------------------------
export function coverageStats(sites, visits, filter = () => true) {
  const activeSites = sites.filter((s) => s.status === 'actif' && filter(s))
  const siteIds = new Set(activeSites.map((s) => s.id))
  const realized = visits.filter((v) => v.status === 'realise' && siteIds.has(v.siteId))
  const monitored = new Set(realized.map((v) => v.siteId))
  const coverage = activeSites.length ? (monitored.size / activeSites.length) * 100 : 0
  return {
    required: activeSites.length,
    monitored: monitored.size,
    coverage,
    target: MMR_TARGET,
    gap: coverage - MMR_TARGET,
  }
}
export function complianceStats(visits, filter = () => true) {
  const scored = visits.filter((v) => v.status === 'realise' && v.score != null && filter(v))
  if (!scored.length) return { avg: null, band: complianceBand(null), count: 0, urgent: 0 }
  const avg = Math.round(scored.reduce((n, v) => n + v.score, 0) / scored.length)
  const urgent = scored.filter((v) => v.score < 50).length
  return { avg, band: complianceBand(avg), count: scored.length, urgent, urgentRate: (urgent / scored.length) * 100 }
}

// ---- Agrégats portefeuille (dashboard) ------------------------------------
export function portfolioKpis(state) {
  const { projects, activities, budgetLines, beneficiaries, sites, visits, indicators } = state
  const active = projects.filter((p) => p.status === 'en_cours')
  const budget = { planned: sum(budgetLines, 'planned'), spent: sum(budgetLines, 'spent') }
  const ben = beneficiaryRollup(beneficiaries)
  const cov = coverageStats(sites, visits)
  const comp = complianceStats(visits)
  const achievements = indicators.map(indicatorAchievement).filter((x) => x != null)
  const avgAchievement = achievements.length ? Math.round(achievements.reduce((a, b) => a + b, 0) / achievements.length) : null
  return {
    projectsTotal: projects.length,
    projectsActive: active.length,
    budgetPlanned: budget.planned,
    budgetSpent: budget.spent,
    budgetBurn: budget.planned ? (budget.spent / budget.planned) * 100 : 0,
    beneficiariesReached: ben.reached,
    beneficiariesPlanned: ben.planned,
    beneficiaryRate: ben.rate,
    sitesActive: sites.filter((s) => s.status === 'actif').length,
    coverage: cov.coverage,
    compliance: comp,
    avgAchievement,
    activitiesOpen: activities.filter((a) => a.status !== 'done').length,
    visitsRealized: visits.filter((v) => v.status === 'realise').length,
  }
}

// ---- Petits utilitaires ----------------------------------------------------
export function sum(list, field) {
  return list.reduce((n, x) => n + (Number(x[field]) || 0), 0)
}
export function groupCount(list, keyFn) {
  const map = {}
  list.forEach((x) => { const k = keyFn(x); map[k] = (map[k] || 0) + 1 })
  return map
}
