// ============================================================================
// Planning — chronogramme (Gantt léger) des activités par projet
// ============================================================================
import { useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { ACTIVITY_STATUS } from '../lib/constants.js'
import { fmtDate, daysBetween, clamp } from '../lib/format.js'
import { PageHeader, Select, Card, Badge, Avatar, EmptyState } from '../components/ui.jsx'
import { Legendette } from '../components/charts.jsx'

const STATUS_COLOR = { todo: '#6F8798', doing: '#007DBC', blocked: '#C5192D', done: '#689E18' }

export default function Planning() {
  const { projects, activities, users, results } = useStore((s) => s)
  const [projectId, setProjectId] = useState(projects[0]?.id || '')

  const acts = useMemo(() => activities
    .filter((a) => a.projectId === projectId && a.startDate && a.endDate)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1)), [activities, projectId])

  const range = useMemo(() => {
    if (!acts.length) return null
    let min = acts[0].startDate, max = acts[0].endDate
    acts.forEach((a) => { if (a.startDate < min) min = a.startDate; if (a.endDate > max) max = a.endDate })
    const start = new Date(min); start.setDate(1)
    const end = new Date(max)
    const months = []
    const cur = new Date(start)
    while (cur <= end) { months.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1) }
    months.push(new Date(cur)) // borne finale
    const total = Math.max(1, daysBetween(months[0].toISOString(), months[months.length - 1].toISOString()))
    return { start: months[0], end: months[months.length - 1], months, total }
  }, [acts])

  const pos = (d) => range ? clamp((daysBetween(range.start.toISOString(), d) / range.total) * 100, 0, 100) : 0
  const todayPos = range ? pos(new Date().toISOString()) : 0
  const showToday = range && new Date() >= range.start && new Date() <= range.end

  return (
    <div>
      <PageHeader icon={CalendarRange} title="Planning" subtitle="Chronogramme des activités (prévu et avancement)" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto min-w-[260px]">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </Select>
        <Legendette items={Object.entries(ACTIVITY_STATUS).map(([k, v]) => ({ label: v.label, color: STATUS_COLOR[k] }))} />
      </div>

      {!range ? (
        <EmptyState title="Aucune activité datée" hint="Ajoutez des dates de début/fin aux activités pour les voir sur le chronogramme." icon={CalendarRange} />
      ) : (
        <Card pad={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* En-tête mois */}
              <div className="flex border-b border-line bg-surface-2">
                <div className="w-64 flex-none border-r border-line px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Activité</div>
                <div className="relative flex-1">
                  <div className="flex h-full">
                    {range.months.slice(0, -1).map((m, i) => (
                      <div key={i} className="flex-1 border-r border-line-soft px-2 py-2 text-[11px] font-semibold text-ink-mute last:border-0">
                        {m.toLocaleDateString('fr-FR', { month: 'short' })}{m.getMonth() === 0 ? ` ${m.getFullYear()}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lignes */}
              <div className="relative">
                {showToday && (
                  <div className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-bad/70" style={{ left: `calc(16rem + (100% - 16rem) * ${todayPos / 100})` }}>
                    <span className="absolute -top-0 left-1 rounded bg-bad px-1 text-[9px] font-bold text-white">auj.</span>
                  </div>
                )}
                {acts.map((a) => {
                  const left = pos(a.startDate)
                  const width = Math.max(1.5, pos(a.endDate) - left)
                  const resp = byId(users, a.responsibleId)
                  const color = STATUS_COLOR[a.status]
                  const prog = a.status === 'done' ? 100 : a.progress || 0
                  return (
                    <div key={a.id} className="flex items-center border-b border-line-soft last:border-0 hover:bg-surface-2/50">
                      <div className="flex w-64 flex-none items-center gap-2 border-r border-line px-4 py-2.5">
                        <span className="font-mono text-[10px] font-bold text-brand-d">{a.code}</span>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink" title={a.name}>{a.name}</span>
                        {resp && <Avatar name={resp.name} size={20} tone="ink" />}
                      </div>
                      <div className="relative flex-1 px-1 py-2.5">
                        <div className="relative h-6">
                          <div className="absolute top-1/2 h-5 -translate-y-1/2 rounded-md border"
                            style={{ left: `${left}%`, width: `${width}%`, background: `${color}22`, borderColor: `${color}66` }}
                            title={`${fmtDate(a.startDate)} → ${fmtDate(a.endDate)} · ${prog}%`}>
                            <div className="h-full rounded-md" style={{ width: `${prog}%`, background: color, opacity: 0.85 }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
