// ============================================================================
// Panneau Activités — tableau Kanban (glisser-déposer natif) + formulaire
// Réutilisé par le détail projet et la page Activités globale.
// ============================================================================
import { useMemo, useState } from 'react'
import { Plus, MoreVertical, Pencil, Trash2, Calendar, Coins, GripVertical } from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { ACTIVITY_STATUS, ACTIVITY_ORDER, PRIORITY } from '../../lib/constants.js'
import { fmtDateShort, moneyShort } from '../../lib/format.js'
import {
  Badge, Button, Avatar, Progress, Modal, Field, Input, Textarea, Select, Dropdown, MenuItem,
  useConfirm, StatusBadge, cx,
} from '../../components/ui.jsx'

export function ActivityBoard({ projectId }) {
  const { activities, results, users, sites, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [editing, setEditing] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const { confirm, node } = useConfirm()

  const acts = useMemo(() => activities.filter((a) => a.projectId === projectId), [activities, projectId])
  const projResults = results.filter((r) => r.projectId === projectId)
  const projSites = sites.filter((s) => (s.projectIds || []).includes(projectId))

  const onDrop = (col) => {
    if (dragId) {
      const a = byId(activities, dragId)
      if (a && a.status !== col) {
        update('activities', dragId, { status: col, progress: col === 'done' ? 100 : a.progress })
        log('modifie', 'activité', `Activité déplacée en « ${ACTIVITY_STATUS[col].label} » : ${a.name}`)
      }
    }
    setDragId(null); setOverCol(null)
  }
  const del = async (a) => {
    if (await confirm({ title: 'Supprimer l’activité', message: `Supprimer « ${a.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('activities', a.id); log('supprime', 'activité', `Activité supprimée : ${a.name}`)
    }
  }

  return (
    <div>
      {node}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-ink-mute">{acts.length} activité(s)</span>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setEditing({ projectId })}>Ajouter une activité</Button>}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACTIVITY_ORDER.map((col) => {
          const items = acts.filter((a) => a.status === col)
          const meta = ACTIVITY_STATUS[col]
          return (
            <div key={col}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(col) } }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => onDrop(col)}
              className={cx('rounded-xl2 border bg-surface-2/40 p-2 transition', overCol === col ? 'border-brand bg-brand-tint/40' : 'border-line')}>
              <div className="mb-2 flex items-center gap-2 px-1.5 py-1">
                <span className={cx('h-2 w-2 rounded-full', { todo: 'bg-ink-mute', doing: 'bg-brand', blocked: 'bg-bad', done: 'bg-ok-dot' }[col])} />
                <span className="text-sm font-bold text-ink-soft">{meta.label}</span>
                <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-ink-mute">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((a) => {
                  const resp = byId(users, a.responsibleId)
                  const res = byId(results, a.resultId)
                  return (
                    <div key={a.id} draggable={canEdit}
                      onDragStart={() => setDragId(a.id)} onDragEnd={() => { setDragId(null); setOverCol(null) }}
                      className={cx('group rounded-xl border border-line bg-surface p-3 shadow-card transition',
                        canEdit && 'cursor-grab active:cursor-grabbing hover:border-brand/40', dragId === a.id && 'opacity-40')}>
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-mono text-[11px] font-bold text-brand-d">{a.code}</span>
                        <div className="flex items-center gap-1">
                          <Badge tone={PRIORITY[a.priority]?.tone || 'ink'}>{PRIORITY[a.priority]?.label}</Badge>
                          {canEdit && (
                            <Dropdown trigger={<button className="text-ink-mute opacity-0 transition group-hover:opacity-100"><MoreVertical size={15} /></button>}>
                              <MenuItem icon={Pencil} onClick={() => setEditing(a)}>Modifier</MenuItem>
                              <MenuItem icon={Trash2} tone="bad" onClick={() => del(a)}>Supprimer</MenuItem>
                            </Dropdown>
                          )}
                        </div>
                      </div>
                      <div className="mt-1.5 text-sm font-semibold leading-snug text-ink">{a.name}</div>
                      {res && <div className="mt-1 text-[11px] text-ink-mute">↳ {res.code} {res.label}</div>}
                      <div className="mt-2"><Progress value={a.status === 'done' ? 100 : a.progress} tone={a.status === 'blocked' ? 'bad' : a.status === 'done' ? 'ok' : 'brand'} height="h-1.5" /></div>
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-ink-mute">
                        <span className="flex items-center gap-1"><Calendar size={11} />{fmtDateShort(a.endDate)}</span>
                        {a.budget ? <span className="flex items-center gap-1"><Coins size={11} />{moneyShort(a.budget)}</span> : <span />}
                        {resp && <Avatar name={resp.name} size={20} tone="ink" />}
                      </div>
                    </div>
                  )
                })}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-line py-6 text-center text-[11px] text-ink-mute">Déposer ici</div>}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <ActivityModal activity={editing} results={projResults} users={users} sites={projSites} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

export function ActivityModal({ activity, results, users, sites, onClose }) {
  const { add, update, log } = useStore((s) => s)
  const [f, setF] = useState({
    code: '', name: '', description: '', resultId: '', responsibleId: '', status: 'todo',
    priority: 'moyenne', startDate: '', endDate: '', budget: '', spent: '', progress: 0, siteIds: [],
    ...activity,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = () => {
    const data = { ...f, budget: Number(f.budget) || 0, spent: Number(f.spent) || 0, progress: Number(f.progress) || 0 }
    if (activity.id) { update('activities', activity.id, data); log('modifie', 'activité', `Activité modifiée : ${data.name}`) }
    else { add('activities', data); log('cree', 'activité', `Nouvelle activité : ${data.name}`) }
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={activity.id ? 'Modifier l’activité' : 'Nouvelle activité'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="form-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code"><Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="A1.1" /></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{ACTIVITY_ORDER.map((k) => <option key={k} value={k}>{ACTIVITY_STATUS[k].label}</option>)}</Select></Field>
        <Field label="Intitulé" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Résultat rattaché" className="col-span-2"><Select value={f.resultId} onChange={(e) => set('resultId', e.target.value)}><option value="">—</option>{results.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.label}</option>)}</Select></Field>
        <Field label="Responsable"><Select value={f.responsibleId} onChange={(e) => set('responsibleId', e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Priorité"><Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Début"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Fin"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Budget"><Input type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
        <Field label="Dépensé"><Input type="number" value={f.spent} onChange={(e) => set('spent', e.target.value)} /></Field>
        <Field label={`Avancement : ${f.progress}%`} className="col-span-2">
          <input type="range" min="0" max="100" step="5" value={f.progress} onChange={(e) => set('progress', e.target.value)} className="w-full accent-brand" />
        </Field>
        <Field label="Notes" className="col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
