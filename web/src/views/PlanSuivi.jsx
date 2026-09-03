// ============================================================================
// Plan de suivi des sites — grille mensuelle (sites × mois), couverture MMR
// MonitoringGrid est réutilisé dans le détail d'un projet (fixedProject).
// ============================================================================
import { useMemo, useState } from 'react'
import { CalendarCheck, Check, Clock } from 'lucide-react'
import { useStore } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { MMR_TARGET } from '../lib/constants.js'
import { pct } from '../lib/format.js'
import { PageHeader, Card, Select, Badge, EmptyState, cx } from '../components/ui.jsx'
import GeoCascade from '../components/GeoCascade.jsx'

export function MonitoringGrid({ fixedProject }) {
  const { sites, visits, projects, organization, currentUserId, add, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [projectId, setProjectId] = useState('')
  const [geo, setGeo] = useState({ region: '', district: '', commune: '' })
  const effectiveProject = fixedProject || projectId

  const year = organization.fiscalYear || 2025
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    ym: `${year}-${String(i + 1).padStart(2, '0')}`,
    label: new Date(year, i, 1).toLocaleDateString('fr-FR', { month: 'short' }),
  })), [year])

  const activeSites = useMemo(() => sites.filter((s) =>
    s.status === 'actif'
    && (!effectiveProject || (s.projectIds || []).includes(effectiveProject))
    && (!geo.region || s.pcode === geo.region)
    && (!geo.district || s.districtCode === geo.district)
    && (!geo.commune || s.communeCode === geo.commune)), [sites, effectiveProject, geo])

  const visitsFor = (siteId, ym) => visits.filter((v) => v.siteId === siteId && (v.date || '').slice(0, 7) === ym)
  const pick = (arr) => arr.find((v) => v.status === 'realise') || arr[0]

  const onCell = (site, ym, existing) => {
    if (!canEdit) return
    if (!existing) {
      add('visits', { siteId: site.id, projectId: effectiveProject || site.projectIds?.[0] || '', date: `${ym}-15`, monitorId: currentUserId, type: 'routine', status: 'planifie', score: null, findings: '', recommendations: '', mmr: true })
      log('cree', 'visite', `Visite planifiée (${ym}) : ${site.name}`)
    } else if (existing.status === 'planifie') {
      remove('visits', existing.id)
      log('supprime', 'visite', `Visite planifiée retirée : ${site.name}`)
    }
  }

  const coverage = months.map((mo) => {
    const monitored = activeSites.filter((s) => visitsFor(s.id, mo.ym).some((v) => v.status === 'realise')).length
    return activeSites.length ? Math.round((monitored / activeSites.length) * 100) : 0
  })
  const totalPlanned = activeSites.reduce((n, s) => n + months.filter((mo) => visitsFor(s.id, mo.ym).length).length, 0)
  const totalDone = activeSites.reduce((n, s) => n + months.filter((mo) => visitsFor(s.id, mo.ym).some((v) => v.status === 'realise')).length, 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!fixedProject && (
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto"><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
            <GeoCascade variant="filter" withCommune={false} region={geo.region} district={geo.district} onChange={setGeo} />
          </>
        )}
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded bg-ok-tint text-ok"><Check size={11} /></span> Réalisée</span>
          <span className="flex items-center gap-1.5"><span className="grid h-4 w-4 place-items-center rounded bg-brand-tint text-brand-d"><Clock size={11} /></span> Planifiée</span>
          <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border border-line bg-surface" /> Non planifiée</span>
        </div>
        <span className="ml-auto text-xs text-ink-mute">Planifiées <b className="tabnum text-ink-soft">{totalPlanned}</b> · Réalisées <b className="tabnum text-ok">{totalDone}</b></span>
      </div>
      {canEdit && <p className="mb-2 text-xs text-ink-mute">Cliquez une case vide pour planifier une visite, une case planifiée pour la retirer.</p>}

      {activeSites.length === 0 ? <EmptyState title="Aucun site actif" hint="Ajustez les filtres ou rattachez des sites." icon={CalendarCheck} /> : (
        <Card pad={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2">
                  <th className="sticky left-0 z-10 min-w-[220px] bg-surface-2 px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-ink-soft">Site</th>
                  {months.map((mo) => <th key={mo.ym} className="px-1 py-2.5 text-center text-[11px] font-bold uppercase text-ink-mute">{mo.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {activeSites.map((s) => {
                  const proj = projects.find((p) => (s.projectIds || []).includes(p.id))
                  return (
                    <tr key={s.id} className="border-b border-line-soft">
                      <td className="sticky left-0 z-10 bg-surface px-4 py-2">
                        <div className="text-sm font-semibold text-ink">{s.name}</div>
                        <div className="text-[11px] text-ink-mute">{s.district}{proj ? ` · ${proj.code}` : ''}</div>
                      </td>
                      {months.map((mo) => {
                        const v = pick(visitsFor(s.id, mo.ym))
                        const state = !v ? 'none' : v.status === 'realise' ? 'done' : 'planned'
                        return (
                          <td key={mo.ym} className="px-1 py-1 text-center">
                            <button onClick={() => onCell(s, mo.ym, v)} disabled={!canEdit || state === 'done'}
                              title={state === 'done' ? `Réalisée${v.score != null ? ` — ${v.score}/100` : ''}` : state === 'planned' ? 'Planifiée' : 'Non planifiée'}
                              className={cx('mx-auto grid h-8 w-8 place-items-center rounded-md border text-[11px] font-bold transition',
                                state === 'done' && 'border-ok-dot/30 bg-ok-tint text-ok',
                                state === 'planned' && 'border-brand/30 bg-brand-tint text-brand-d',
                                state === 'none' && 'border-line bg-surface text-ink-mute',
                                canEdit && state !== 'done' && 'hover:border-brand hover:bg-brand-tint/60')}>
                              {state === 'done' ? (v.score != null ? v.score : <Check size={14} />) : state === 'planned' ? <Clock size={13} /> : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-line bg-surface-2/60">
                  <td className="sticky left-0 z-10 bg-surface-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Couverture / {MMR_TARGET}%</td>
                  {coverage.map((c, i) => (
                    <td key={i} className="px-1 py-2 text-center">
                      <Badge tone={c >= MMR_TARGET ? 'ok' : c >= 50 ? 'warn' : c > 0 ? 'bad' : 'ink'}>{pct(c)}</Badge>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

export default function PlanSuivi() {
  const year = useStore((s) => s.organization.fiscalYear) || 2025
  return (
    <div>
      <PageHeader icon={CalendarCheck} title="Plan de suivi des sites"
        subtitle={`Grille mensuelle ${year} · exigence minimale de suivi (MMR)`} />
      <MonitoringGrid />
    </div>
  )
}
