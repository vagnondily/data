// ============================================================================
// Panneau Budget — lignes budgétaires : prévu / engagé / dépensé
// ============================================================================
import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, MoreVertical } from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { budgetForProject, budgetByKey } from '../../lib/compute.js'
import { C } from '../../lib/constants.js'
import { money, moneyShort, pct } from '../../lib/format.js'
import {
  Card, Badge, Button, Progress, Modal, Field, Input, Select, RowActions, DataTable, useConfirm,
} from '../../components/ui.jsx'
import { ChartBars } from '../../components/charts.jsx'

export function BudgetPanel({ projectId }) {
  const { budgetLines, partners, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()

  const b = useMemo(() => budgetForProject(budgetLines, projectId), [budgetLines, projectId])
  const byCat = useMemo(() => budgetByKey(b.lines, 'category').map((x) => ({ name: x.key, Prévu: x.planned, Dépensé: x.spent })), [b.lines])

  const del = async (l) => {
    if (await confirm({ title: 'Supprimer la ligne', message: `Supprimer « ${l.category} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('budgetLines', l.id); log('supprime', 'budget', `Ligne budgétaire supprimée : ${l.category}`)
    }
  }

  return (
    <div>
      {node}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Budget prévu" value={money(b.planned)} tone="brand" />
        <Stat label="Engagé" value={money(b.committed)} tone="warn" sub={pct(b.planned ? (b.committed / b.planned) * 100 : 0)} />
        <Stat label="Dépensé" value={money(b.spent)} tone="ok" sub={pct(b.burn)} />
        <Stat label="Solde disponible" value={money(b.planned - b.spent)} tone="ink" />
      </div>

      <Card className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-ink-mute"><span>Consommation globale</span><span className="font-semibold tabnum">{pct(b.burn)} de {moneyShort(b.planned)}</span></div>
        <Progress value={b.burn} tone={b.burn > 95 ? 'bad' : b.burn > 80 ? 'warn' : 'ok'} height="h-3" />
      </Card>

      {byCat.length > 0 && (
        <Card className="mt-4">
          <div className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">Prévu vs dépensé par catégorie</div>
          <ChartBars data={byCat} xKey="name" layout="vertical" height={Math.max(160, byCat.length * 46)} fmt={(v) => moneyShort(v)}
            series={[{ key: 'Prévu', label: 'Prévu', color: C.brand }, { key: 'Dépensé', label: 'Dépensé', color: C.ok }]} />
        </Card>
      )}

      <div className="mb-3 mt-4 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">Lignes budgétaires</span>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setEditing({ projectId })}>Ajouter une ligne</Button>}
      </div>
      <DataTable
        empty="Aucune ligne budgétaire"
        rows={b.lines}
        columns={[
          { key: 'category', label: 'Catégorie', render: (r) => <span className="font-semibold text-ink">{r.category}</span> },
          { key: 'donor', label: 'Bailleur', render: (r) => <Badge tone="ink">{byId(partners, r.donorId)?.acronym || '—'}</Badge> },
          { key: 'planned', label: 'Prévu', align: 'right', render: (r) => <span className="tabnum">{money(r.planned)}</span> },
          { key: 'committed', label: 'Engagé', align: 'right', render: (r) => <span className="tabnum text-ink-mute">{money(r.committed)}</span> },
          { key: 'spent', label: 'Dépensé', align: 'right', render: (r) => <span className="tabnum font-semibold">{money(r.spent)}</span> },
          {
            key: 'burn', label: 'Conso.', width: 130, render: (r) => {
              const burn = r.planned ? (r.spent / r.planned) * 100 : 0
              return <div className="flex items-center gap-2"><Progress value={burn} tone={burn > 95 ? 'bad' : burn > 80 ? 'warn' : 'ok'} /><span className="w-9 text-right text-xs tabnum">{pct(burn)}</span></div>
            },
          },
          canEdit && {
            key: 'act', label: '', width: 110, align: 'right',
            render: (r) => <RowActions onEdit={() => setEditing(r)} onDelete={() => del(r)} />,
          },
        ].filter(Boolean)}
      />

      {editing && <BudgetLineModal line={editing} partners={partners} onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing.id) { update('budgetLines', editing.id, data); log('modifie', 'budget', `Ligne modifiée : ${data.category}`) }
          else { add('budgetLines', data); log('cree', 'budget', `Ligne ajoutée : ${data.category}`) }
          setEditing(null)
        }} />}
    </div>
  )
}

function Stat({ label, value, sub, tone = 'brand' }) {
  const border = { brand: 'border-l-brand', ok: 'border-l-ok-dot', warn: 'border-l-warn-dot', ink: 'border-l-ink-mute' }[tone]
  return (
    <Card className={`border-l-4 ${border}`}>
      <div className="text-xs text-ink-mute">{label}</div>
      <div className="mt-1 text-lg font-extrabold text-ink tabnum">{value}</div>
      {sub && <div className="text-xs text-ink-mute">{sub}</div>}
    </Card>
  )
}

function BudgetLineModal({ line, partners, onClose, onSave }) {
  const donors = partners.filter((p) => p.type === 'bailleur')
  const [f, setF] = useState({ category: '', donorId: '', planned: '', committed: '', spent: '', ...line })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title={line.id ? 'Modifier la ligne' : 'Nouvelle ligne budgétaire'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, planned: Number(f.planned) || 0, committed: Number(f.committed) || 0, spent: Number(f.spent) || 0 })} disabled={!f.category}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Catégorie" required className="col-span-2"><Input value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="Bailleur" className="col-span-2"><Select value={f.donorId} onChange={(e) => set('donorId', e.target.value)}><option value="">—</option>{donors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Prévu"><Input type="number" value={f.planned} onChange={(e) => set('planned', e.target.value)} /></Field>
        <Field label="Engagé"><Input type="number" value={f.committed} onChange={(e) => set('committed', e.target.value)} /></Field>
        <Field label="Dépensé" className="col-span-2"><Input type="number" value={f.spent} onChange={(e) => set('spent', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
