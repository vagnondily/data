// ============================================================================
// Projets — liste (cartes / tableau), filtres, santé, création
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Briefcase, Plus, LayoutGrid, Table2, MapPin, Users as UsersIcon } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { budgetForProject, projectProgress, projectHealth, beneficiaryRollup } from '../lib/compute.js'
import { PROJECT_STATUS, PRIORITY, SECTORS, REGIONS } from '../lib/constants.js'
import { moneyShort, fmtDate, pct, num } from '../lib/format.js'
import {
  Card, Badge, Button, PageHeader, Progress, Avatar, Segmented, StatusBadge, SearchInput, Select,
  DataTable, EmptyState,
} from '../components/ui.jsx'
import { ProjectForm } from './ProjectForm.jsx'

export default function Projets() {
  const store = useStore((s) => s)
  const { projects, programmes, partners, users, activities, budgetLines, beneficiaries } = store
  const { canEdit } = useCan()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState('cards')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const progFilter = params.get('prog') || ''

  const enriched = useMemo(() => projects.map((p) => {
    const prog = projectProgress(activities, p.id)
    const b = budgetForProject(budgetLines, p.id)
    const ben = beneficiaryRollup(beneficiaries, (x) => x.projectId === p.id)
    return { p, prog, budget: b, ben, health: projectHealth(p, prog, b) }
  }), [projects, activities, budgetLines, beneficiaries])

  const filtered = useMemo(() => enriched.filter(({ p }) => {
    if (progFilter && p.programmeId !== progFilter) return false
    if (status && p.status !== status) return false
    if (q && !(`${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase()))) return false
    return true
  }), [enriched, progFilter, status, q])

  const progName = progFilter ? byId(programmes, progFilter)?.name : null

  return (
    <div>
      <PageHeader icon={Briefcase} title="Projets"
        subtitle={progName ? `Programme : ${progName}` : `${projects.length} projet(s) dans le portefeuille`}
        actions={canEdit && <Button icon={Plus} onClick={() => setCreating(true)}>Nouveau projet</Button>} />

      {/* Filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un projet…" className="w-full sm:w-64" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
          <option value="">Tous les statuts</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select value={progFilter} onChange={(e) => { const v = e.target.value; v ? setParams({ prog: v }) : setParams({}) }} className="w-auto">
          <option value="">Tous les programmes</option>
          {programmes.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}
        </Select>
        <div className="ml-auto">
          <Segmented value={view} onChange={setView} options={[
            { value: 'cards', label: 'Cartes', icon: LayoutGrid },
            { value: 'table', label: 'Tableau', icon: Table2 },
          ]} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Aucun projet trouvé" hint="Ajustez les filtres ou créez un nouveau projet." />
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ p, prog, budget, ben, health }) => {
            const donor = byId(partners, p.donorId)
            const mgr = byId(users, p.managerId)
            return (
              <Card key={p.id} hover onClick={() => nav(`/projets/${p.id}`)} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-brand-d">{p.code}</span>
                    <StatusBadge map={PROJECT_STATUS} value={p.status} />
                  </div>
                  <Badge tone={health.tone} dot>{health.label}</Badge>
                </div>
                <h3 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-ink">{p.name}</h3>
                <div className="mt-1 flex items-center gap-2 text-xs text-ink-mute">
                  <MapPin size={12} /> {(p.regions || []).map((r) => byId(REGIONS.map((x) => ({ id: x.pcode, ...x })), r)?.name).filter(Boolean).join(', ') || '—'}
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-ink-mute">Avancement</span><span className="font-semibold text-ink tabnum">{prog}%</span></div>
                  <Progress value={prog} tone={health.tone} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-inset py-1.5">
                    <div className="text-sm font-bold text-ink tabnum">{moneyShort(budget.spent)}</div>
                    <div className="text-[10px] text-ink-mute">dépensé · {pct(budget.burn)}</div>
                  </div>
                  <div className="rounded-lg bg-inset py-1.5">
                    <div className="text-sm font-bold text-ink tabnum">{num(ben.reached)}</div>
                    <div className="text-[10px] text-ink-mute">bénéf. · {pct(ben.rate)}</div>
                  </div>
                  <div className="rounded-lg bg-inset py-1.5">
                    <div className="text-sm font-bold text-ink tabnum">{p.sector ? p.sector.split(' ')[0] : '—'}</div>
                    <div className="text-[10px] text-ink-mute">secteur</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={mgr?.name} size={24} tone="ink" />
                    <span className="text-xs text-ink-soft">{mgr?.name?.split(' ')[0] || '—'}</span>
                  </div>
                  <span className="text-xs text-ink-mute">{fmtDate(p.endDate)}</span>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <DataTable
          onRowClick={(r) => nav(`/projets/${r.p.id}`)}
          keyField="id"
          rows={filtered.map((x) => ({ id: x.p.id, ...x }))}
          columns={[
            { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs font-bold text-brand-d">{r.p.code}</span> },
            { key: 'name', label: 'Projet', render: (r) => <span className="font-semibold text-ink">{r.p.name}</span> },
            { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={PROJECT_STATUS} value={r.p.status} /> },
            { key: 'health', label: 'Santé', render: (r) => <Badge tone={r.health.tone} dot>{r.health.label}</Badge> },
            { key: 'prog', label: 'Avancement', width: 150, render: (r) => <div className="flex items-center gap-2"><Progress value={r.prog} tone={r.health.tone} /><span className="text-xs tabnum">{r.prog}%</span></div> },
            { key: 'budget', label: 'Dépensé', align: 'right', render: (r) => <span className="tabnum">{moneyShort(r.budget.spent)}</span> },
            { key: 'ben', label: 'Bénéf.', align: 'right', render: (r) => <span className="tabnum">{num(r.ben.reached)}</span> },
            { key: 'end', label: 'Échéance', align: 'right', render: (r) => <span className="text-xs">{fmtDate(r.p.endDate)}</span> },
          ]}
        />
      )}

      {creating && <ProjectForm onClose={() => setCreating(false)} />}
    </div>
  )
}
