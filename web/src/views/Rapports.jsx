// ============================================================================
// Rapports — extraction Excel/CSV de jeux de données + générateur de rapport
// ============================================================================
import { useState } from 'react'
import { FileBarChart, Download, Printer, FileSpreadsheet } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import {
  budgetForProject, projectProgress, beneficiaryRollup, coverageStats, complianceStats,
  indicatorAchievement, indicatorActual, portfolioKpis,
} from '../lib/compute.js'
import { PROJECT_STATUS, INDICATOR_LEVEL, ACTIVITY_STATUS } from '../lib/constants.js'
import { money, num, pct, fmtDate } from '../lib/format.js'
import { exportCSV, printReport } from '../lib/export.js'
import { PageHeader, Card, SectionTitle, Select, Button, Field } from '../components/ui.jsx'

export default function Rapports() {
  const store = useStore((s) => s)
  const { projects } = store
  const [dataset, setDataset] = useState('projets')
  const [scope, setScope] = useState('portfolio')
  const [sections, setSections] = useState({ kpis: true, indicateurs: true, budget: true, activites: false, visites: true, beneficiaires: true })
  const [narrative, setNarrative] = useState('')

  const doExport = () => {
    const d = DATASETS[dataset](store)
    exportCSV(`mems-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`, d.rows, d.columns)
  }

  const doReport = () => printReport('Rapport MEMS', buildReportHtml(store, scope, sections, narrative))

  return (
    <div>
      <PageHeader icon={FileBarChart} title="Rapports" subtitle="Extraction de données et génération de rapports" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Extraction */}
        <Card>
          <SectionTitle>Extraction (Excel / CSV)</SectionTitle>
          <p className="mb-3 text-sm text-ink-mute">Exportez n’importe quel jeu de données au format CSV (ouvrable dans Excel, séparateur « ; »).</p>
          <Field label="Jeu de données">
            <Select value={dataset} onChange={(e) => setDataset(e.target.value)}>
              <option value="projets">Projets</option>
              <option value="indicateurs">Indicateurs</option>
              <option value="activites">Activités</option>
              <option value="visites">Visites de suivi</option>
              <option value="beneficiaires">Bénéficiaires</option>
              <option value="budget">Lignes budgétaires</option>
            </Select>
          </Field>
          <div className="mt-3 rounded-lg bg-inset px-3 py-2 text-xs text-ink-mute">
            {DATASETS[dataset](store).rows.length} ligne(s) · {DATASETS[dataset](store).columns.length} colonnes
          </div>
          <Button className="mt-4" icon={FileSpreadsheet} onClick={doExport}>Exporter en CSV</Button>
        </Card>

        {/* Générateur */}
        <Card>
          <SectionTitle>Générateur de rapport</SectionTitle>
          <p className="mb-3 text-sm text-ink-mute">Composez un rapport imprimable (HTML → PDF via l’impression du navigateur).</p>
          <Field label="Périmètre">
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="portfolio">Portefeuille complet</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">Sections</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries({ kpis: 'Indicateurs clés', indicateurs: 'Tableau des indicateurs', budget: 'Budget', activites: 'Activités', visites: 'Suivi & visites', beneficiaires: 'Bénéficiaires' }).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm">
                  <input type="checkbox" checked={sections[k]} onChange={(e) => setSections((s) => ({ ...s, [k]: e.target.checked }))} className="accent-brand" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Note narrative (facultatif)" className="mt-3">
            <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand" placeholder="Analyse, points saillants, recommandations…" />
          </Field>
          <Button className="mt-4" icon={Printer} onClick={doReport}>Générer le rapport</Button>
        </Card>
      </div>
    </div>
  )
}

// ---- Définition des jeux de données exportables ----------------------------
const DATASETS = {
  projets: (s) => ({
    rows: s.projects.map((p) => ({
      code: p.code, nom: p.name, programme: byId(s.programmes, p.programmeId)?.name || '',
      bailleur: byId(s.partners, p.donorId)?.acronym || '', statut: PROJECT_STATUS[p.status]?.label || p.status,
      debut: p.startDate, fin: p.endDate, budget: p.budget,
      depense: budgetForProject(s.budgetLines, p.id).spent, avancement: projectProgress(s.activities, p.id),
      beneficiaires: beneficiaryRollup(s.beneficiaries, (x) => x.projectId === p.id).reached,
    })),
    columns: [
      { key: 'code', label: 'Code' }, { key: 'nom', label: 'Projet' }, { key: 'programme', label: 'Programme' },
      { key: 'bailleur', label: 'Bailleur' }, { key: 'statut', label: 'Statut' }, { key: 'debut', label: 'Début' },
      { key: 'fin', label: 'Fin' }, { key: 'budget', label: 'Budget' }, { key: 'depense', label: 'Dépensé' },
      { key: 'avancement', label: 'Avancement %' }, { key: 'beneficiaires', label: 'Bénéf. atteints' },
    ],
  }),
  indicateurs: (s) => ({
    rows: s.indicators.map((i) => ({
      code: i.code, indicateur: i.name, projet: byId(s.projects, i.projectId)?.code || '',
      niveau: INDICATOR_LEVEL[i.level]?.label || i.level, unite: i.unit, reference: i.baseline, cible: i.target,
      realise: indicatorActual(i), atteinte: indicatorAchievement(i) != null ? Math.round(indicatorAchievement(i)) : '',
    })),
    columns: [
      { key: 'code', label: 'Code' }, { key: 'indicateur', label: 'Indicateur' }, { key: 'projet', label: 'Projet' },
      { key: 'niveau', label: 'Niveau' }, { key: 'unite', label: 'Unité' }, { key: 'reference', label: 'Référence' },
      { key: 'cible', label: 'Cible' }, { key: 'realise', label: 'Réalisé' }, { key: 'atteinte', label: 'Atteinte %' },
    ],
  }),
  activites: (s) => ({
    rows: s.activities.map((a) => ({
      code: a.code, activite: a.name, projet: byId(s.projects, a.projectId)?.code || '',
      statut: ACTIVITY_STATUS[a.status]?.label || a.status, avancement: a.status === 'done' ? 100 : a.progress,
      debut: a.startDate, fin: a.endDate, budget: a.budget, depense: a.spent,
      responsable: byId(s.users, a.responsibleId)?.name || '',
    })),
    columns: [
      { key: 'code', label: 'Code' }, { key: 'activite', label: 'Activité' }, { key: 'projet', label: 'Projet' },
      { key: 'statut', label: 'Statut' }, { key: 'avancement', label: 'Avancement %' }, { key: 'debut', label: 'Début' },
      { key: 'fin', label: 'Fin' }, { key: 'budget', label: 'Budget' }, { key: 'depense', label: 'Dépensé' }, { key: 'responsable', label: 'Responsable' },
    ],
  }),
  visites: (s) => ({
    rows: s.visits.map((v) => ({
      site: byId(s.sites, v.siteId)?.name || '', projet: byId(s.projects, v.projectId)?.code || '', date: v.date,
      type: v.type, statut: v.status, score: v.score ?? '', constats: v.findings, moniteur: byId(s.users, v.monitorId)?.name || '',
    })),
    columns: [
      { key: 'site', label: 'Site' }, { key: 'projet', label: 'Projet' }, { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' }, { key: 'statut', label: 'Statut' }, { key: 'score', label: 'Score' },
      { key: 'constats', label: 'Constats' }, { key: 'moniteur', label: 'Suivi par' },
    ],
  }),
  beneficiaires: (s) => ({
    rows: s.beneficiaries.map((b) => ({
      projet: byId(s.projects, b.projectId)?.code || '', site: byId(s.sites, b.siteId)?.name || '', categorie: b.category,
      cible: b.plannedTotal, atteint: b.reachedTotal, femmes: b.reachedF, hommes: b.reachedM,
    })),
    columns: [
      { key: 'projet', label: 'Projet' }, { key: 'site', label: 'Site' }, { key: 'categorie', label: 'Catégorie' },
      { key: 'cible', label: 'Ciblé' }, { key: 'atteint', label: 'Atteint' }, { key: 'femmes', label: 'Femmes' }, { key: 'hommes', label: 'Hommes' },
    ],
  }),
  budget: (s) => ({
    rows: s.budgetLines.map((b) => ({
      projet: byId(s.projects, b.projectId)?.code || '', categorie: b.category, bailleur: byId(s.partners, b.donorId)?.acronym || '',
      prevu: b.planned, engage: b.committed, depense: b.spent,
    })),
    columns: [
      { key: 'projet', label: 'Projet' }, { key: 'categorie', label: 'Catégorie' }, { key: 'bailleur', label: 'Bailleur' },
      { key: 'prevu', label: 'Prévu' }, { key: 'engage', label: 'Engagé' }, { key: 'depense', label: 'Dépensé' },
    ],
  }),
}

// ---- Construction du rapport HTML ------------------------------------------
function buildReportHtml(store, scope, sections, narrative) {
  const isPortfolio = scope === 'portfolio'
  const project = isPortfolio ? null : byId(store.projects, scope)
  const title = isPortfolio ? store.organization.name : `${project?.code} — ${project?.name}`
  const projFilter = (arr, key = 'projectId') => isPortfolio ? arr : arr.filter((x) => x[key] === scope)

  let html = `<h1>${title}</h1><p class="muted">Rapport de suivi-évaluation · ${isPortfolio ? 'Portefeuille complet' : 'Projet'}</p>`

  if (sections.kpis) {
    if (isPortfolio) {
      const k = portfolioKpis(store)
      html += kpiBlock([
        ['Projets actifs', k.projectsActive], ['Bénéficiaires atteints', num(k.beneficiariesReached)],
        ['Budget dépensé', money(k.budgetSpent)], ['Couverture suivi', pct(k.coverage)],
        ['Conformité /100', k.compliance.avg ?? '—'], ['Atteinte indicateurs', k.avgAchievement != null ? pct(k.avgAchievement) : '—'],
      ])
    } else {
      const b = budgetForProject(store.budgetLines, scope)
      const ben = beneficiaryRollup(store.beneficiaries, (x) => x.projectId === scope)
      const sitesP = store.sites.filter((s) => (s.projectIds || []).includes(scope))
      const cov = coverageStats(sitesP, projFilter(store.visits))
      const comp = complianceStats(projFilter(store.visits))
      html += kpiBlock([
        ['Avancement', pct(projectProgress(store.activities, scope))], ['Budget dépensé', money(b.spent)],
        ['Bénéficiaires', num(ben.reached)], ['Couverture', pct(cov.coverage)], ['Conformité', comp.avg ?? '—'],
      ])
    }
  }

  if (sections.indicateurs) {
    const rows = projFilter(store.indicators)
    html += `<h2>Indicateurs</h2>${table(
      ['Code', 'Indicateur', 'Cible', 'Réalisé', 'Atteinte'],
      rows.map((i) => [i.code, i.name, num(i.target), num(indicatorActual(i)), indicatorAchievement(i) != null ? pct(indicatorAchievement(i)) : '—']),
    )}`
  }
  if (sections.budget) {
    const rows = projFilter(store.budgetLines)
    const tp = rows.reduce((n, b) => n + b.planned, 0), td = rows.reduce((n, b) => n + b.spent, 0)
    html += `<h2>Budget</h2>${table(
      ['Catégorie', 'Prévu', 'Engagé', 'Dépensé'],
      [...rows.map((b) => [b.category, money(b.planned), money(b.committed), money(b.spent)]), ['<b>Total</b>', `<b>${money(tp)}</b>`, '', `<b>${money(td)}</b>`]],
    )}`
  }
  if (sections.activites) {
    const rows = projFilter(store.activities)
    html += `<h2>Activités</h2>${table(
      ['Code', 'Activité', 'Statut', 'Avancement'],
      rows.map((a) => [a.code, a.name, ACTIVITY_STATUS[a.status]?.label, `${a.status === 'done' ? 100 : a.progress}%`]),
    )}`
  }
  if (sections.visites) {
    const rows = projFilter(store.visits).filter((v) => v.status === 'realise')
    html += `<h2>Suivi & visites</h2>${table(
      ['Site', 'Date', 'Type', 'Score', 'Constats'],
      rows.map((v) => [byId(store.sites, v.siteId)?.name, fmtDate(v.date), v.type, v.score ?? '—', v.findings || '']),
    )}`
  }
  if (sections.beneficiaires) {
    const rows = projFilter(store.beneficiaries)
    html += `<h2>Bénéficiaires</h2>${table(
      ['Catégorie', 'Ciblé', 'Atteint', 'Femmes', 'Hommes'],
      rows.map((b) => [b.category, num(b.plannedTotal), num(b.reachedTotal), num(b.reachedF), num(b.reachedM)]),
    )}`
  }
  if (narrative.trim()) html += `<h2>Note narrative</h2><p>${escapeHtml(narrative).replace(/\n/g, '<br>')}</p>`
  return html
}

function kpiBlock(pairs) {
  return `<div class="kpis">${pairs.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`
}
function table(head, rows) {
  if (!rows.length) return '<p class="muted">Aucune donnée.</p>'
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
function escapeHtml(s = '') { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) }
