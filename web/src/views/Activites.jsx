// ============================================================================
// Activités (global) — tableau Kanban par projet + vue liste tous projets
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListChecks, LayoutGrid, Table2 } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { ACTIVITY_STATUS, PRIORITY } from '../lib/constants.js'
import { fmtDate, moneyShort } from '../lib/format.js'
import { PageHeader, Segmented, Select, Badge, Avatar, Progress, DataTable, StatusBadge, SearchInput, RowActions, useConfirm } from '../components/ui.jsx'
import { ActivityBoard, ActivityModal } from './panels/Activities.jsx'

export default function Activites() {
  const { projects, activities, users, results, sites, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const nav = useNavigate()
  const { confirm, node } = useConfirm()
  const [view, setView] = useState('board')
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)

  const del = async (a) => {
    if (await confirm({ title: 'Supprimer l’activité', message: `Supprimer « ${a.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('activities', a.id); log('supprime', 'activité', `Activité supprimée : ${a.name}`)
    }
  }

  const listRows = useMemo(() => activities.filter((a) => {
    if (status && a.status !== status) return false
    if (q && !a.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [activities, status, q])

  return (
    <div>
      {node}
      <PageHeader icon={ListChecks} title="Activités" subtitle="Planification et exécution des activités du portefeuille"
        actions={<Segmented value={view} onChange={setView} options={[
          { value: 'board', label: 'Kanban', icon: LayoutGrid },
          { value: 'list', label: 'Liste', icon: Table2 },
        ]} />} />

      {view === 'board' ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-ink-mute">Projet :</span>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto min-w-[260px]">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </div>
          {projectId && <ActivityBoard projectId={projectId} />}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={setQ} placeholder="Rechercher une activité…" className="w-full sm:w-64" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto">
              <option value="">Tous les statuts</option>
              {Object.entries(ACTIVITY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </div>
          <DataTable
            empty="Aucune activité"
            onRowClick={(r) => nav(`/projets/${r.projectId}`)}
            rows={listRows}
            columns={[
              { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs font-bold text-brand-d">{r.code}</span> },
              { key: 'name', label: 'Activité', render: (r) => <span className="font-semibold text-ink">{r.name}</span> },
              { key: 'project', label: 'Projet', render: (r) => <span className="text-xs text-ink-mute">{byId(projects, r.projectId)?.code}</span> },
              { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={ACTIVITY_STATUS} value={r.status} /> },
              { key: 'priority', label: 'Priorité', render: (r) => <Badge tone={PRIORITY[r.priority]?.tone || 'ink'}>{PRIORITY[r.priority]?.label}</Badge> },
              { key: 'prog', label: 'Avancement', width: 130, render: (r) => <Progress value={r.status === 'done' ? 100 : r.progress} tone={r.status === 'blocked' ? 'bad' : 'brand'} showValue /> },
              { key: 'resp', label: 'Responsable', render: (r) => { const u = byId(users, r.responsibleId); return u ? <span className="flex items-center gap-1.5"><Avatar name={u.name} size={22} tone="ink" /><span className="text-xs">{u.name.split(' ')[0]}</span></span> : '—' } },
              { key: 'end', label: 'Échéance', align: 'right', render: (r) => <span className="text-xs">{fmtDate(r.endDate)}</span> },
              {
                key: 'act', label: '', width: 200, align: 'right',
                render: (r) => <RowActions onOpen={() => nav(`/projets/${r.projectId}`)} openLabel="Projet"
                  onEdit={canEdit ? () => setEditing(r) : undefined}
                  onDelete={canEdit ? () => del(r) : undefined} />,
              },
            ]}
          />
        </>
      )}

      {editing && (
        <ActivityModal activity={editing}
          results={results.filter((r) => r.projectId === editing.projectId)}
          users={users}
          sites={sites.filter((s) => (s.projectIds || []).includes(editing.projectId))}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
