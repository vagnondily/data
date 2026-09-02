// Formulaire de création / édition de projet (partagé liste + détail)
import { useState } from 'react'
import { useStore } from '../lib/store.js'
import { PROJECT_STATUS, SECTORS, PRIORITY, REGIONS } from '../lib/constants.js'
import { Modal, Field, Input, Textarea, Select, Button } from '../components/ui.jsx'

export function ProjectForm({ project, onClose, onSaved }) {
  const { programmes, partners, users, add, update, log } = useStore((s) => s)
  const donors = partners.filter((p) => p.type === 'bailleur')
  const [f, setF] = useState({
    code: '', name: '', programmeId: programmes[0]?.id || '', donorId: '', managerId: '',
    status: 'planification', phase: 'Planification', sector: SECTORS[0], priority: 'moyenne',
    startDate: '', endDate: '', budget: '', currency: 'USD', regions: [], objectiveGlobal: '', description: '',
    ...project,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const toggleRegion = (pcode) => set('regions', f.regions.includes(pcode) ? f.regions.filter((x) => x !== pcode) : [...f.regions, pcode])

  const save = () => {
    const data = { ...f, budget: Number(f.budget) || 0 }
    if (project?.id) { update('projects', project.id, data); log('modifie', 'projet', `Projet modifié : ${data.name}`) }
    else { const rec = add('projects', data); log('cree', 'projet', `Nouveau projet : ${data.name}`); onSaved?.(rec) }
    onClose()
  }

  return (
    <Modal open onClose={onClose} size="xl"
      title={project?.id ? 'Modifier le projet' : 'Nouveau projet'}
      subtitle="Renseignez le cadre du projet — les indicateurs, activités et budget se saisissent ensuite dans le projet."
      footer={<>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={save} disabled={!f.name || !f.code}>Enregistrer</Button>
      </>}>
      <div className="form-grid-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label="Code" required><Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="MG-XX-00" /></Field>
        <Field label="Programme" className="col-span-2"><Select value={f.programmeId} onChange={(e) => set('programmeId', e.target.value)}><option value="">—</option>{programmes.map((pg) => <option key={pg.id} value={pg.id}>{pg.name}</option>)}</Select></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Intitulé du projet" required className="col-span-4"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Objectif global" className="col-span-4"><Input value={f.objectiveGlobal} onChange={(e) => set('objectiveGlobal', e.target.value)} placeholder="But général visé par le projet" /></Field>
        <Field label="Bailleur"><Select value={f.donorId} onChange={(e) => set('donorId', e.target.value)}><option value="">—</option>{donors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Chef de projet"><Select value={f.managerId} onChange={(e) => set('managerId', e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Secteur"><Select value={f.sector} onChange={(e) => set('sector', e.target.value)}>{SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Priorité"><Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Début"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Fin"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Budget"><Input type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
        <Field label="Devise"><Select value={f.currency} onChange={(e) => set('currency', e.target.value)}><option>USD</option><option>EUR</option><option>MGA</option></Select></Field>
        <Field label="Zones d’intervention (régions)" className="col-span-4">
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-inset p-2">
            {REGIONS.map((r) => (
              <button key={r.pcode} type="button" onClick={() => toggleRegion(r.pcode)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${f.regions.includes(r.pcode) ? 'border-brand bg-brand-tint text-brand-d' : 'border-line bg-surface text-ink-mute hover:border-brand/40'}`}>
                {r.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Description" className="col-span-4"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
