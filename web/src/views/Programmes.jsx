// ============================================================================
// Programmes / portefeuilles — regroupement de projets
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Pencil, Trash2, MoreVertical, ArrowRight } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { budgetForProject } from '../lib/compute.js'
import { PROGRAMME_STATUS, SECTORS } from '../lib/constants.js'
import { money, moneyShort, fmtDate, pct } from '../lib/format.js'
import {
  Card, Badge, Button, PageHeader, Progress, Avatar, Modal, Field, Input, Textarea, Select,
  Dropdown, MenuItem, StatusBadge, useConfirm, EmptyState,
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
    return { pg, projs, spent }
  }), [programmes, projects, budgetLines])

  const onDelete = async (pg) => {
    const count = projects.filter((p) => p.programmeId === pg.id).length
    if (await confirm({
      title: 'Supprimer le programme',
      message: count ? `Ce programme contient ${count} projet(s) qui ne seront pas supprimés mais deviendront non rattachés. Continuer ?` : 'Confirmer la suppression de ce programme ?',
      danger: true, confirmLabel: 'Supprimer',
    })) {
      remove('programmes', pg.id)
      log('supprime', 'programme', `Programme supprimé : ${pg.name}`)
    }
  }

  return (
    <div>
      {node}
      <PageHeader icon={FolderKanban} title="Programmes" subtitle={`${programmes.length} portefeuille(s) · logique de gestion par programme`}
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau programme</Button>} />

      {rows.length === 0 ? (
        <EmptyState title="Aucun programme" hint="Créez un premier programme pour regrouper vos projets."
          action={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau programme</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ pg, projs, spent }) => {
            const donor = byId(partners, pg.donorId)
            const mgr = byId(users, pg.managerId)
            const burn = pg.budget ? (spent / pg.budget) * 100 : 0
            return (
              <Card key={pg.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-brand-d">{pg.code}</span>
                    <StatusBadge map={PROGRAMME_STATUS} value={pg.status} />
                  </div>
                  {canEdit && (
                    <Dropdown trigger={<button className="grid h-7 w-7 place-items-center rounded-md text-ink-mute hover:bg-surface-2"><MoreVertical size={16} /></button>}>
                      <MenuItem icon={Pencil} onClick={() => setEditing(pg)}>Modifier</MenuItem>
                      <MenuItem icon={Trash2} tone="bad" onClick={() => onDelete(pg)}>Supprimer</MenuItem>
                    </Dropdown>
                  )}
                </div>
                <h3 className="mt-2 text-base font-bold leading-snug text-ink">{pg.name}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-ink-mute">{pg.description}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(pg.sectors || []).slice(0, 3).map((s) => <Badge key={s} tone="ink">{s}</Badge>)}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-ink-mute">Bailleur</div><div className="font-semibold text-ink">{donor?.acronym || '—'}</div></div>
                  <div><div className="text-xs text-ink-mute">Projets</div><div className="font-semibold text-ink">{projs.length}</div></div>
                  <div><div className="text-xs text-ink-mute">Budget</div><div className="font-semibold text-ink tabnum">{moneyShort(pg.budget, pg.currency)}</div></div>
                  <div><div className="text-xs text-ink-mute">Période</div><div className="text-xs font-semibold text-ink-soft">{fmtDate(pg.startDate)} → {fmtDate(pg.endDate)}</div></div>
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs text-ink-mute"><span>Consommation budgétaire</span><span className="font-semibold tabnum">{pct(burn)}</span></div>
                  <Progress value={burn} tone={burn > 90 ? 'bad' : burn > 75 ? 'warn' : 'ok'} />
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={mgr?.name} size={26} tone="ink" />
                    <span className="text-xs text-ink-soft">{mgr?.name || '—'}</span>
                  </div>
                  <button onClick={() => nav(`/projets?prog=${pg.id}`)} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                    Voir les projets <ArrowRight size={13} />
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
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
