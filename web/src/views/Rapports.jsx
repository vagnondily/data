// ============================================================================
// Rapports — extraction Excel (.xlsx) + générateur de rapport infographique
// (configuration + aperçu en direct, impression / PDF).
// ============================================================================
import { useMemo, useState } from 'react'
import { FileBarChart, Printer, FileSpreadsheet, Download, Check } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import {
  budgetForProject, projectProgress, beneficiaryRollup,
  indicatorAchievement, indicatorActual,
} from '../lib/compute.js'
import { PROJECT_STATUS, INDICATOR_LEVEL, ACTIVITY_STATUS } from '../lib/constants.js'
import { downloadBlob } from '../lib/export.js'
import { exportRowsXlsx } from '../lib/docs.js'
import { buildReportDoc, printReportDoc, ACCENTS } from '../lib/report.js'
import { PageHeader, Card, SectionTitle, Select, Button, Field, Input, Segmented, cx } from '../components/ui.jsx'
import { t, useLang } from '../lib/i18n.js'

const SECTION_KEYS = [
  ['cover', 'Page de couverture'], ['kpis', 'Indicateurs clés'], ['budget', 'Budget'],
  ['indicateurs', 'Atteinte des indicateurs'], ['couverture', 'Suivi & conformité'],
  ['beneficiaires', 'Bénéficiaires'], ['activites', 'Activités'],
  ['tables', 'Tableaux détaillés'], ['narrative', 'Note narrative'],
]

export default function Rapports() {
  const store = useStore((s) => s)
  const lang = useLang((s) => s.lang)
  const { projects } = store
  const [dataset, setDataset] = useState('projets')
  const [cfg, setCfg] = useState({
    title: '', subtitle: '', period: '', org: '', scope: 'portfolio',
    orientation: 'portrait', accent: 'wfp',
    sections: { cover: true, kpis: true, budget: true, indicateurs: true, couverture: true, beneficiaires: true, activites: true, tables: false, narrative: true },
    narrative: '',
  })
  const set = (patch) => setCfg((c) => ({ ...c, ...patch }))
  const setSection = (k, v) => setCfg((c) => ({ ...c, sections: { ...c.sections, [k]: v } }))

  const html = useMemo(() => buildReportDoc(store, cfg), [store, cfg, lang])
  const fileBase = `mems-rapport-${new Date().toISOString().slice(0, 10)}`

  const doExport = () => {
    const d = DATASETS[dataset](store)
    exportRowsXlsx(`mems-${dataset}-${new Date().toISOString().slice(0, 10)}`, d.rows, d.columns)
  }
  const doDownloadHtml = () => downloadBlob(`${fileBase}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }))

  return (
    <div>
      <PageHeader icon={FileBarChart} title="Rapports" subtitle="Extraction de données et rapport infographique" />

      {/* Extraction Excel */}
      <Card className="mb-4">
        <SectionTitle>Extraction (Excel)</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Jeu de données" className="w-full sm:w-72">
            <Select value={dataset} onChange={(e) => setDataset(e.target.value)}>
              <option value="projets">Projets</option>
              <option value="indicateurs">Indicateurs</option>
              <option value="activites">Activités</option>
              <option value="visites">Visites de suivi</option>
              <option value="beneficiaires">Bénéficiaires</option>
              <option value="budget">Lignes budgétaires</option>
            </Select>
          </Field>
          <div className="mb-1 rounded-lg bg-inset px-3 py-2 text-xs text-ink-mute">
            {DATASETS[dataset](store).rows.length} {t('ligne(s)')} · {DATASETS[dataset](store).columns.length} {t('colonnes')}
          </div>
          <Button className="mb-0.5 ml-auto" variant="outline" icon={FileSpreadsheet} onClick={doExport}>Exporter en Excel</Button>
        </div>
      </Card>

      {/* Rapport infographique : configuration + aperçu */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Configuration */}
        <Card>
          <SectionTitle>Générateur de rapport</SectionTitle>
          <p className="-mt-1 mb-3 text-xs text-ink-mute">{t('Composez un rapport visuel (graphiques) prêt à imprimer ou exporter en PDF.')}</p>

          <Field label="Périmètre">
            <Select value={cfg.scope} onChange={(e) => set({ scope: e.target.value })}>
              <option value="portfolio">Portefeuille complet</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <Field label="Titre du rapport"><Input value={cfg.title} onChange={(e) => set({ title: e.target.value })} placeholder={store.organization?.name || 'MEMS'} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Période"><Input value={cfg.period} onChange={(e) => set({ period: e.target.value })} placeholder={t('ex. T3 2025, Janvier–Mars…')} /></Field>
              <Field label="Organisation"><Input value={cfg.org} onChange={(e) => set({ org: e.target.value })} placeholder={store.organization?.name || ''} /></Field>
            </div>
            <Field label="Sous-titre"><Input value={cfg.subtitle} onChange={(e) => set({ subtitle: e.target.value })} placeholder={t('Rapport de suivi-évaluation')} /></Field>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-soft">{t('Orientation')}</div>
              <Segmented value={cfg.orientation} onChange={(v) => set({ orientation: v })}
                options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Paysage' }]} />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-soft">{t('Accent')}</div>
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((a) => (
                  <button key={a.key} type="button" title={t(a.label)} onClick={() => set({ accent: a.key })}
                    className={cx('grid h-7 w-7 place-items-center rounded-full border-2 transition', cfg.accent === a.key ? 'border-ink' : 'border-transparent')}
                    style={{ background: a.color }}>
                    {cfg.accent === a.key && <Check size={13} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">{t('Sections à inclure')}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SECTION_KEYS.map(([k, label]) => (
                <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink-soft transition hover:border-brand/40">
                  <input type="checkbox" checked={cfg.sections[k]} onChange={(e) => setSection(k, e.target.checked)} className="accent-brand" />
                  {t(label)}
                </label>
              ))}
            </div>
          </div>

          {cfg.sections.narrative && (
            <Field label="Note narrative" className="mt-3">
              <textarea value={cfg.narrative} onChange={(e) => set({ narrative: e.target.value })} rows={3}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder="Analyse, points saillants, recommandations…" />
            </Field>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button icon={Printer} onClick={() => printReportDoc(html)}>Imprimer / PDF</Button>
            <Button variant="outline" icon={Download} onClick={doDownloadHtml}>Télécharger (HTML)</Button>
          </div>
        </Card>

        {/* Aperçu en direct */}
        <Card pad={false} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{t('Aperçu en direct')}</span>
            <span className="text-[11px] text-ink-mute">{cfg.orientation === 'landscape' ? 'A4 · Paysage' : 'A4 · Portrait'}</span>
          </div>
          <iframe title={t('Aperçu en direct')} srcDoc={html}
            className="h-[78vh] w-full bg-[#eef2f6]" style={{ border: 0 }} />
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

