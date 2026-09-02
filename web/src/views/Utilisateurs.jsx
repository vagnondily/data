// ============================================================================
// Utilisateurs & rôles — comptes, rôle (ce qu'on peut faire) × bureau (où)
// ============================================================================
import { useState } from 'react'
import { UserCog, Plus, Pencil, Trash2, MoreVertical, ShieldCheck } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { ROLES, ROLE_KEYS } from '../lib/constants.js'
import {
  PageHeader, Card, SectionTitle, Button, Badge, Avatar, DataTable, Modal, Field, Input, Select,
  Dropdown, MenuItem, useConfirm,
} from '../components/ui.jsx'

const CAN_LABEL = { view: 'Consulter', edit: 'Modifier', validate: 'Valider', admin: 'Administrer', super: 'Console instance' }
const ROLE_ICON = { brand: 'bg-brand-tint text-brand-d', ok: 'bg-ok-tint text-ok', warn: 'bg-warn-tint text-warn', ink: 'bg-inset text-ink-soft' }

export default function Utilisateurs() {
  const { users, offices, currentUserId, add, update, remove, log } = useStore((s) => s)
  const { canAdmin } = useCan()
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()

  const del = async (u) => {
    if (u.id === currentUserId) return
    if (await confirm({ title: 'Supprimer l’utilisateur', message: `Supprimer le compte de ${u.name} ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('users', u.id); log('supprime', 'utilisateur', `Compte supprimé : ${u.name}`)
    }
  }

  return (
    <div>
      {node}
      <PageHeader icon={UserCog} title="Utilisateurs & rôles" subtitle={`${users.length} compte(s) · le rôle dit ce qu'on peut faire, le bureau dit où`}
        actions={canAdmin && <Button icon={Plus} onClick={() => setEditing({ role: 'viewer', active: true })}>Nouvel utilisateur</Button>} />

      <DataTable
        rows={users}
        columns={[
          { key: 'name', label: 'Utilisateur', render: (u) => (<div className="flex items-center gap-2.5"><Avatar name={u.name} size={34} tone={ROLES[u.role]?.color || 'ink'} /><div><div className="font-semibold text-ink">{u.name}{u.id === currentUserId && <span className="ml-1.5 text-[10px] text-brand">(vous)</span>}</div><div className="text-xs text-ink-mute">{u.email}</div></div></div>) },
          { key: 'role', label: 'Rôle', render: (u) => <Badge tone={ROLES[u.role]?.color || 'ink'}>{ROLES[u.role]?.label}</Badge> },
          { key: 'title', label: 'Fonction', render: (u) => <span className="text-ink-soft">{u.title}</span> },
          { key: 'office', label: 'Bureau', render: (u) => <span className="text-xs text-ink-soft">{byId(offices, u.officeId)?.name || '—'}</span> },
          { key: 'active', label: 'État', render: (u) => <Badge tone={u.active ? 'ok' : 'ink'} dot>{u.active ? 'Actif' : 'Inactif'}</Badge> },
          canAdmin && {
            key: 'act', label: '', width: 40, render: (u) => (
              <Dropdown trigger={<button className="text-ink-mute hover:text-ink"><MoreVertical size={16} /></button>}>
                <MenuItem icon={Pencil} onClick={() => setEditing(u)}>Modifier</MenuItem>
                {u.id !== currentUserId && <MenuItem icon={Trash2} tone="bad" onClick={() => del(u)}>Supprimer</MenuItem>}
              </Dropdown>
            ),
          },
        ].filter(Boolean)}
      />

      <SectionTitle className="mt-6">Les rôles d’accès</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_KEYS.slice().reverse().map((k) => {
          const r = ROLES[k]
          return (
            <Card key={k}>
              <div className="flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${ROLE_ICON[r.color] || ROLE_ICON.ink}`}><ShieldCheck size={16} /></span>
                <div><div className="text-sm font-bold text-ink">{r.label}</div><div className="font-mono text-[11px] text-ink-mute">{k}</div></div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {r.can.map((c) => <span key={c} className="rounded-full bg-inset px-2 py-0.5 text-[11px] font-medium text-ink-soft">{CAN_LABEL[c]}</span>)}
              </div>
            </Card>
          )
        })}
      </div>

      {editing && <UserModal user={editing} offices={offices} onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing.id) { update('users', editing.id, data); log('modifie', 'utilisateur', `Compte modifié : ${data.name}`) }
          else { add('users', data); log('cree', 'utilisateur', `Nouveau compte : ${data.name}`) }
          setEditing(null)
        }} />}
    </div>
  )
}

function UserModal({ user, offices, onClose, onSave }) {
  const [f, setF] = useState({ name: '', email: '', role: 'viewer', officeId: offices[0]?.id || '', title: '', active: true, ...user })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title={user.id ? 'Modifier l’utilisateur' : 'Nouvel utilisateur'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.name || !f.email}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom complet" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="E-mail" required className="col-span-2"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Rôle"><Select value={f.role} onChange={(e) => set('role', e.target.value)}>{ROLE_KEYS.map((k) => <option key={k} value={k}>{ROLES[k].label}</option>)}</Select></Field>
        <Field label="Bureau"><Select value={f.officeId} onChange={(e) => set('officeId', e.target.value)}>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Fonction" className="col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="État"><Select value={f.active ? '1' : '0'} onChange={(e) => set('active', e.target.value === '1')}><option value="1">Actif</option><option value="0">Inactif</option></Select></Field>
      </div>
    </Modal>
  )
}
