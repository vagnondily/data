// ============================================================================
// Programmes / portefeuilles — liste (tableau) avec actions de ligne
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { budgetForProject } from '../lib/compute.js'
import { PROGRAMME_STATUS, SECTORS } from '../lib/constants.js'
import { moneyShort, pct } from '../lib/format.js'
import {
  Badge, Button, PageHeader, Progress, Modal, Field, Input, Textarea, Select,
  StatusBadge, DataTable, RowActions, useConfirm, EmptyState,
} from '../components/ui.jsx'

export default function Programmes() {
  const { programmes, projects, partners, users, budgetLines, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const nav = useNavigate()
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()

  const rows = useMemo(() => programmes.map((pg) => {
    const projs = projects.filter((p) => p.programmeId === pg.id)
    const spent = projs.reduce((n, p) => n + budgetForProject(budgetLines, p.id).spent, 0)
    const burn = pg.budget ? (spent / pg.budget) * 100 : 0
    return { id: pg.id, pg, count: projs.length, burn }
  }), [programmes, projects, budgetLines])

  const open = (pg) => nav(`/projets?prog=${pg.id}`)

  const onDelete = async (pg) => {
    const count = projects.filter((p) => p.programmeId === pg.id).length
    if (await confirm({
      title: 'Supprimer le programme',
      message: count ? `Ce programme contient ${count} projet(s) qui deviendront non rattachés (ils ne sont pas supprimés). Continuer ?` : 'Confirmer la suppression de ce programme ?',
      danger: true, confirmLabel: 'Supprimer',
    })) {
      remove('programmes', pg.id)
      log('supprime', 'programme', `Programme supprimé : ${pg.name}`)
    }
  }

  return (
    <div>
      {node}
      <PageHeader icon={FolderKanban} title="Programmes" subtitle={`${programmes.length} portefeuille(s) · gestion par programme`}
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau programme</Button>} />

      {rows.length === 0 ? (
        <EmptyState title="Aucun programme" hint="Créez un premier programme pour regrouper vos projets."
          action={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau programme</Button>} />
      ) : (
        <DataTable
          onRowClick={(r) => open(r.pg)}
          rows={rows}
          columns={[
            { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs font-bold text-brand-d">{r.pg.code}</span> },
            { key: 'name', label: 'Programme', render: (r) => (<div><div className="font-semibold text-ink">{r.pg.name}</div><div className="line-clamp-1 text-xs text-ink-mute">{r.pg.description}</div></div>) },
            { key: 'donor', label: 'Bailleur', render: (r) => <Badge tone="ink">{byId(partners, r.pg.donorId)?.acronym || '—'}</Badge> },
            { key: 'count', label: 'Projets', align: 'right', render: (r) => <span className="tabnum font-semibold">{r.count}</span> },
            { key: 'budget', label: 'Budget', align: 'right', render: (r) => <span className="tabnum">{moneyShort(r.pg.budget, r.pg.currency)}</span> },
            { key: 'burn', label: 'Consommation', width: 150, render: (r) => <div className="flex items-center gap-2"><Progress value={r.burn} tone={r.burn > 90 ? 'bad' : r.burn > 75 ? 'warn' : 'ok'} /><span className="w-9 text-right text-xs tabnum">{pct(r.burn)}</span></div> },
            { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={PROGRAMME_STATUS} value={r.pg.status} /> },
            {
              key: 'act', label: '', width: 210, align: 'right',
              render: (r) => <RowActions onOpen={() => open(r.pg)} openLabel="Projets"
                onEdit={canEdit ? () => setEditing(r.pg) : undefined}
                onDelete={canEdit ? () => onDelete(r.pg) : undefined} />,
            },
          ]}
        />
      )}

      {editing && (
        <ProgrammeForm programme={editing} partners={partners} users={users}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing.id) { update('programmes', editing.id, data); log('modifie', 'programme', `Programme modifié : ${data.name}`) }
            else { add('programmes', { status: 'actif', currency: 'USD', sectors: [], ...data }); log('cree', 'programme', `Nouveau programme : ${data.name}`) }
            setEditing(null)
          }} />
      )}
    </div>
  )
}

function ProgrammeForm({ programme, partners, users, onClose, onSave }) {
  const [f, setF] = useState({
    code: '', name: '', description: '', donorId: '', managerId: '', budget: '', currency: 'USD',
    status: 'actif', startDate: '', endDate: '', sectors: [], ...programme,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const toggleSector = (s) => set('sectors', f.sectors.includes(s) ? f.sectors.filter((x) => x !== s) : [...f.sectors, s])
  const donors = partners.filter((p) => p.type === 'bailleur')

  return (
    <Modal open onClose={onClose} size="lg"
      title={programme.id ? 'Modifier le programme' : 'Nouveau programme'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={() => onSave({ ...f, budget: Number(f.budget) || 0 })} disabled={!f.name || !f.code}>Enregistrer</Button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Code" required><Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="PRG-XXX" /></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(PROGRAMME_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Nom du programme" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Description" className="col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Bailleur"><Select value={f.donorId} onChange={(e) => set('donorId', e.target.value)}><option value="">—</option>{donors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Gestionnaire"><Select value={f.managerId} onChange={(e) => set('managerId', e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Budget total"><Input type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
        <Field label="Devise"><Select value={f.currency} onChange={(e) => set('currency', e.target.value)}><option>USD</option><option>EUR</option><option>MGA</option></Select></Field>
        <Field label="Date de début"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Date de fin"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Secteurs" className="col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSector(s)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${f.sectors.includes(s) ? 'border-brand bg-brand-tint text-brand-d' : 'border-line text-ink-mute hover:border-brand/40'}`}>
                {s}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
