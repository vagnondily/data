// Formulaire de création / édition de programme (partagé liste + détail)
import { useState } from 'react'
import { useStore } from '../lib/store.js'
import { PROGRAMME_STATUS, SECTORS } from '../lib/constants.js'
import { Modal, Field, Input, Textarea, Select, Button } from '../components/ui.jsx'

export function ProgrammeForm({ programme, onClose, onSaved }) {
  const { partners, users, add, update, log } = useStore((s) => s)
  const donors = partners.filter((p) => p.type === 'bailleur')
  const [f, setF] = useState({
    code: '', name: '', description: '', donorId: '', managerId: '', budget: '', currency: 'USD',
    status: 'actif', startDate: '', endDate: '', sectors: [], ...programme,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const toggleSector = (s) => set('sectors', f.sectors.includes(s) ? f.sectors.filter((x) => x !== s) : [...f.sectors, s])

  const save = () => {
    const data = { ...f, budget: Number(f.budget) || 0 }
    if (programme?.id) { update('programmes', programme.id, data); log('modifie', 'programme', `Programme modifié : ${data.name}`) }
    else { const rec = add('programmes', { status: 'actif', currency: 'USD', sectors: [], ...data }); log('cree', 'programme', `Nouveau programme : ${data.name}`); onSaved?.(rec) }
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="lg"
      title={programme?.id ? 'Modifier le programme' : 'Nouveau programme'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={save} disabled={!f.name || !f.code}>Enregistrer</Button>
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
