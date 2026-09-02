// ============================================================================
// Plan MRE — plan de suivi-évaluation & budget (activités de S&E)
// ============================================================================
import { useMemo, useState } from 'react'
import { ClipboardList, Plus } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { MRE_TYPES, MRE_STATUS } from '../lib/constants.js'
import { money, moneyShort, pct } from '../lib/format.js'
import {
  PageHeader, Kpi, Select, Button, Badge, StatusBadge, DataTable, RowActions, Modal, Field, Input,
  useConfirm, Progress,
} from '../components/ui.jsx'

export default function Mre() {
  const { mreActivities, projects, users, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()

  const rows = useMemo(() => mreActivities.filter((m) => {
    if (projectId && m.projectId !== projectId) return false
    if (status && m.status !== status) return false
    return true
  }), [mreActivities, projectId, status])

  const totals = useMemo(() => ({
    planned: rows.reduce((n, m) => n + (m.costPlanned || 0), 0),
    actual: rows.reduce((n, m) => n + (m.costActual || 0), 0),
    done: rows.filter((m) => m.status === 'realise').length,
  }), [rows])

  const del = async (m) => {
    if (await confirm({ title: 'Supprimer l’activité MRE', message: `Supprimer « ${m.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('mreActivities', m.id); log('supprime', 'MRE', `Activité MRE supprimée : ${m.name}`)
    }
  }

  return (
    <div>
      {node}
      <PageHeader icon={ClipboardList} title="Plan MRE" subtitle="Plan de suivi-évaluation, redevabilité et son budget"
        actions={<>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto"><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto"><option value="">Tous statuts</option>{Object.entries(MRE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          {canEdit && <Button icon={Plus} onClick={() => setEditing({ projectId: projectId || projects[0]?.id, status: 'planifie', type: 'suivi' })}>Nouvelle activité</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Activités MRE" value={rows.length} icon={ClipboardList} tone="brand" />
        <Kpi label="Budget MRE prévu" value={moneyShort(totals.planned)} tone="brand" />
        <Kpi label="Budget MRE réalisé" value={moneyShort(totals.actual)} sub={pct(totals.planned ? (totals.actual / totals.planned) * 100 : 0)} tone="ok" />
        <Kpi label="Réalisées" value={totals.done} sub={`sur ${rows.length}`} tone="ok" />
      </div>

      <div className="mt-4">
        <DataTable
          empty="Aucune activité de suivi-évaluation"
          rows={rows}
          columns={[
            { key: 'name', label: 'Activité', render: (m) => <span className="font-semibold text-ink">{m.name}</span> },
            { key: 'project', label: 'Projet', render: (m) => <Badge tone="ink">{byId(projects, m.projectId)?.code || '—'}</Badge> },
            { key: 'type', label: 'Type', render: (m) => <span className="text-xs text-ink-soft">{MRE_TYPES[m.type]?.label || m.type}</span> },
            { key: 'period', label: 'Période', render: (m) => <span className="font-mono text-xs">{m.period}</span> },
            { key: 'resp', label: 'Responsable', render: (m) => byId(users, m.responsibleId)?.name?.split(' ')[0] || '—' },
            { key: 'planned', label: 'Coût prévu', align: 'right', render: (m) => <span className="tabnum">{money(m.costPlanned)}</span> },
            { key: 'actual', label: 'Réalisé', align: 'right', render: (m) => <span className="tabnum font-semibold">{money(m.costActual)}</span> },
            { key: 'conso', label: 'Conso.', width: 120, render: (m) => { const b = m.costPlanned ? (m.costActual / m.costPlanned) * 100 : 0; return <Progress value={b} tone={b > 100 ? 'bad' : b > 80 ? 'warn' : 'ok'} showValue /> } },
            { key: 'status', label: 'Statut', render: (m) => <StatusBadge map={MRE_STATUS} value={m.status} /> },
            {
              key: 'act', label: '', width: 110, align: 'right',
              render: (m) => canEdit ? <RowActions onEdit={() => setEditing(m)} onDelete={() => del(m)} /> : null,
            },
          ]}
        />
      </div>

      {editing && <MreModal mre={editing} projects={projects} users={users} onClose={() => setEditing(null)}
        onSave={(data) => {
          const rec = { ...data, costPlanned: Number(data.costPlanned) || 0, costActual: Number(data.costActual) || 0 }
          if (editing.id) { update('mreActivities', editing.id, rec); log('modifie', 'MRE', `Activité MRE modifiée : ${rec.name}`) }
          else { add('mreActivities', rec); log('cree', 'MRE', `Nouvelle activité MRE : ${rec.name}`) }
          setEditing(null)
        }} />}
    </div>
  )
}

function MreModal({ mre, projects, users, onClose, onSave }) {
  const [f, setF] = useState({ name: '', projectId: '', type: 'suivi', period: '2025-T4', responsibleId: '', costPlanned: '', costActual: '', status: 'planifie', ...mre })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="lg" title={mre.id ? 'Modifier l’activité MRE' : 'Nouvelle activité MRE'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Intitulé" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Projet"><Select value={f.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(MRE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Période"><Input value={f.period} onChange={(e) => set('period', e.target.value)} placeholder="2025-T4 ou 2025" /></Field>
        <Field label="Responsable"><Select value={f.responsibleId} onChange={(e) => set('responsibleId', e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Coût prévu"><Input type="number" value={f.costPlanned} onChange={(e) => set('costPlanned', e.target.value)} /></Field>
        <Field label="Coût réalisé"><Input type="number" value={f.costActual} onChange={(e) => set('costActual', e.target.value)} /></Field>
        <Field label="Statut" className="col-span-2"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(MRE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      </div>
    </Modal>
  )
}
