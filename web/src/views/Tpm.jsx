// ============================================================================
// Suivi tiers (TPM) — contrats de prestataires, missions, dépenses, validation
// ============================================================================
import { useMemo, useState } from 'react'
import { Handshake, Plus, MoreVertical, Pencil, Trash2, FileText, Coins } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { TPM_STATUS, REGIONS } from '../lib/constants.js'
import { money, moneyShort, fmtDate, pct } from '../lib/format.js'
import {
  PageHeader, Kpi, Card, Badge, Button, StatusBadge, DataTable, Modal, Field, Input, Select, Textarea,
  Dropdown, MenuItem, Progress, SectionTitle, useConfirm, EmptyState,
} from '../components/ui.jsx'

export default function Tpm() {
  const store = useStore((s) => s)
  const { tpmContracts, tpmMissions, tpmExpenses, partners, add, update, remove, log } = store
  const { canEdit } = useCan()
  const [detail, setDetail] = useState(null)
  const [editContract, setEditContract] = useState(null)
  const { confirm, node } = useConfirm()

  const spentOf = (cid) => tpmExpenses.filter((e) => e.contractId === cid).reduce((n, e) => n + e.amount, 0)
  const totals = useMemo(() => ({
    ceiling: tpmContracts.reduce((n, c) => n + c.ceiling, 0),
    spent: tpmExpenses.reduce((n, e) => n + e.amount, 0),
    missions: tpmMissions.length,
    active: tpmContracts.filter((c) => c.status === 'valide_pays' || c.status === 'valide_bureau').length,
  }), [tpmContracts, tpmExpenses, tpmMissions])

  const del = async (c) => {
    if (await confirm({ title: 'Supprimer le contrat', message: `Supprimer « ${c.title} » et ses missions/dépenses ?`, danger: true, confirmLabel: 'Supprimer' })) {
      tpmMissions.filter((m) => m.contractId === c.id).forEach((m) => remove('tpmMissions', m.id))
      tpmExpenses.filter((e) => e.contractId === c.id).forEach((e) => remove('tpmExpenses', e.id))
      remove('tpmContracts', c.id); log('supprime', 'TPM', `Contrat supprimé : ${c.code}`)
    }
  }

  return (
    <div>
      {node}
      <PageHeader icon={Handshake} title="Suivi tiers (TPM)" subtitle="Contrats de prestataires, missions et circuit de validation"
        actions={canEdit && <Button icon={Plus} onClick={() => setEditContract({})}>Nouveau contrat</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Contrats actifs" value={totals.active} sub={`sur ${tpmContracts.length}`} icon={Handshake} tone="brand" />
        <Kpi label="Plafond total" value={moneyShort(totals.ceiling)} icon={FileText} tone="ink" />
        <Kpi label="Dépensé" value={moneyShort(totals.spent)} sub={pct(totals.ceiling ? (totals.spent / totals.ceiling) * 100 : 0)} icon={Coins} tone="ok" />
        <Kpi label="Missions" value={totals.missions} tone="brand" />
      </div>

      <SectionTitle className="mt-6">Contrats</SectionTitle>
      <DataTable
        empty="Aucun contrat TPM"
        onRowClick={(c) => setDetail(c)}
        rows={tpmContracts}
        columns={[
          { key: 'code', label: 'Réf.', render: (c) => <span className="font-mono text-xs font-bold text-brand-d">{c.code}</span> },
          { key: 'provider', label: 'Prestataire', render: (c) => <span className="font-semibold text-ink">{byId(partners, c.providerId)?.name}</span> },
          { key: 'title', label: 'Objet', render: (c) => <span className="text-ink-soft">{c.title}</span> },
          { key: 'ceiling', label: 'Plafond', align: 'right', render: (c) => <span className="tabnum">{money(c.ceiling)}</span> },
          { key: 'spent', label: 'Consommé', width: 150, render: (c) => { const s = spentOf(c.id); const b = c.ceiling ? (s / c.ceiling) * 100 : 0; return <div className="flex items-center gap-2"><Progress value={b} tone={b > 90 ? 'bad' : b > 75 ? 'warn' : 'ok'} /><span className="w-9 text-right text-xs tabnum">{pct(b)}</span></div> } },
          { key: 'status', label: 'Statut', render: (c) => <StatusBadge map={TPM_STATUS} value={c.status} /> },
          canEdit && {
            key: 'act', label: '', width: 40, render: (c) => (
              <Dropdown trigger={<button className="text-ink-mute hover:text-ink" onClick={(e) => e.stopPropagation()}><MoreVertical size={16} /></button>}>
                <MenuItem icon={Pencil} onClick={() => setEditContract(c)}>Modifier</MenuItem>
                <MenuItem icon={Trash2} tone="bad" onClick={() => del(c)}>Supprimer</MenuItem>
              </Dropdown>
            ),
          },
        ].filter(Boolean)}
      />

      {detail && <ContractDetail contract={detail} onClose={() => setDetail(null)} />}
      {editContract && <ContractForm contract={editContract} partners={partners} onClose={() => setEditContract(null)}
        onSave={(data) => {
          if (editContract.id) { update('tpmContracts', editContract.id, data); log('modifie', 'TPM', `Contrat modifié : ${data.code}`) }
          else { add('tpmContracts', { zones: [], ...data }); log('cree', 'TPM', `Nouveau contrat : ${data.code}`) }
          setEditContract(null)
        }} />}
    </div>
  )
}

function ContractDetail({ contract, onClose }) {
  const { tpmMissions, tpmExpenses, partners, add, update, remove, log } = useStore((s) => s)
  const { canEdit, canValidate } = useCan()
  const [missionForm, setMissionForm] = useState(null)
  const [expenseForm, setExpenseForm] = useState(null)
  const missions = tpmMissions.filter((m) => m.contractId === contract.id)
  const expenses = tpmExpenses.filter((e) => e.contractId === contract.id)
  const spent = expenses.reduce((n, e) => n + e.amount, 0)
  const burn = contract.ceiling ? (spent / contract.ceiling) * 100 : 0
  const provider = byId(partners, contract.providerId)

  return (
    <Modal open onClose={onClose} size="xl" title={`${contract.code} — ${provider?.name}`} subtitle={contract.title}
      footer={<Button onClick={onClose}>Fermer</Button>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Info label="Plafond" value={money(contract.ceiling)} />
        <Info label="Consommé" value={money(spent)} />
        <Info label="Barème / site" value={money(contract.ratePerSite)} />
        <Info label="Statut" value={<StatusBadge map={TPM_STATUS} value={contract.status} />} />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs text-ink-mute"><span>Consommation du plafond</span><span className="font-semibold tabnum">{pct(burn)}</span></div>
        <Progress value={burn} tone={burn > 90 ? 'bad' : burn > 75 ? 'warn' : 'ok'} height="h-2.5" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="text-xs text-ink-mute">Zones :</span>
        {(contract.zones || []).map((z) => <Badge key={z} tone="ink">{byId(REGIONS.map((r) => ({ id: r.pcode, ...r })), z)?.name || z}</Badge>)}
      </div>

      <div className="mb-2 mt-5 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">Missions (plans mensuels)</span>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setMissionForm({ contractId: contract.id })}>Mission</Button>}
      </div>
      <DataTable
        empty="Aucune mission" dense
        rows={missions}
        columns={[
          { key: 'period', label: 'Période', render: (m) => <span className="font-semibold text-ink">{m.period}</span> },
          { key: 'mode', label: 'Mode', render: (m) => <span className="text-xs text-ink-soft">{m.mode === 'equipe_unique' ? 'Équipe unique' : 'Par commune'}</span> },
          { key: 'sites', label: 'Sites', align: 'right', render: (m) => m.sitesCount },
          { key: 'agents', label: 'Agents', align: 'right', render: (m) => m.agents },
          { key: 'budget', label: 'Budget', align: 'right', render: (m) => <span className="tabnum">{money(m.budget)}</span> },
          { key: 'status', label: 'Statut', render: (m) => <StatusBadge map={TPM_STATUS} value={m.status} /> },
          (canEdit || canValidate) && {
            key: 'act', label: '', width: 36, render: (m) => (
              <Dropdown trigger={<button className="text-ink-mute hover:text-ink"><MoreVertical size={15} /></button>}>
                {canValidate && m.status !== 'valide_pays' && <MenuItem onClick={() => { update('tpmMissions', m.id, { status: 'valide_pays' }); log('valide', 'TPM', `Mission validée : ${m.period}`) }}>Valider (pays)</MenuItem>}
                {canEdit && <MenuItem icon={Pencil} onClick={() => setMissionForm(m)}>Modifier</MenuItem>}
                {canEdit && <MenuItem icon={Trash2} tone="bad" onClick={() => remove('tpmMissions', m.id)}>Supprimer</MenuItem>}
              </Dropdown>
            ),
          },
        ].filter(Boolean)}
      />

      <div className="mb-2 mt-5 flex items-center justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-ink-soft">Dépenses</span>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setExpenseForm({ contractId: contract.id })}>Dépense</Button>}
      </div>
      <DataTable
        empty="Aucune dépense" dense
        rows={expenses}
        columns={[
          { key: 'date', label: 'Date', render: (e) => fmtDate(e.date) },
          { key: 'label', label: 'Libellé', render: (e) => <span className="font-semibold text-ink">{e.label}</span> },
          { key: 'amount', label: 'Montant', align: 'right', render: (e) => <span className="tabnum">{money(e.amount)}</span> },
          { key: 'status', label: 'Statut', render: (e) => <Badge tone={e.status === 'valide' ? 'ok' : 'warn'}>{e.status}</Badge> },
          canEdit && { key: 'act', label: '', width: 36, render: (e) => <button className="text-ink-mute hover:text-bad" onClick={() => remove('tpmExpenses', e.id)}><Trash2 size={15} /></button> },
        ].filter(Boolean)}
      />

      {missionForm && <MissionForm mission={missionForm} onClose={() => setMissionForm(null)}
        onSave={(data) => {
          if (missionForm.id) update('tpmMissions', missionForm.id, data)
          else add('tpmMissions', data)
          log(missionForm.id ? 'modifie' : 'cree', 'TPM', `Mission ${data.period}`); setMissionForm(null)
        }} />}
      {expenseForm && <ExpenseForm expense={expenseForm} onClose={() => setExpenseForm(null)}
        onSave={(data) => { add('tpmExpenses', data); log('cree', 'TPM', `Dépense : ${data.label}`); setExpenseForm(null) }} />}
    </Modal>
  )
}

function Info({ label, value }) {
  return <div className="rounded-lg border border-line bg-inset px-3 py-2"><div className="text-[11px] text-ink-mute">{label}</div><div className="mt-0.5 text-sm font-bold text-ink tabnum">{value}</div></div>
}

function ContractForm({ contract, partners, onClose, onSave }) {
  const providers = partners.filter((p) => p.type === 'prestataire')
  const [f, setF] = useState({ code: '', providerId: providers[0]?.id || '', title: '', ceiling: '', currency: 'USD', startDate: '', endDate: '', status: 'brouillon', ratePerSite: '', zones: [], ...contract })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const toggleZone = (z) => set('zones', f.zones.includes(z) ? f.zones.filter((x) => x !== z) : [...f.zones, z])
  return (
    <Modal open onClose={onClose} size="lg" title={contract.id ? 'Modifier le contrat' : 'Nouveau contrat TPM'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, ceiling: Number(f.ceiling) || 0, ratePerSite: Number(f.ratePerSite) || 0 })} disabled={!f.code || !f.title}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Référence" required><Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="TPM-2025-00" /></Field>
        <Field label="Prestataire"><Select value={f.providerId} onChange={(e) => set('providerId', e.target.value)}>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Objet du contrat" required className="col-span-2"><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Plafond"><Input type="number" value={f.ceiling} onChange={(e) => set('ceiling', e.target.value)} /></Field>
        <Field label="Barème par site"><Input type="number" value={f.ratePerSite} onChange={(e) => set('ratePerSite', e.target.value)} /></Field>
        <Field label="Début"><Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
        <Field label="Fin"><Input type="date" value={f.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(TPM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Zones (régions)" className="col-span-2">
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-line bg-inset p-2">
            {REGIONS.map((r) => <button key={r.pcode} type="button" onClick={() => toggleZone(r.pcode)} className={`rounded-full border px-2 py-0.5 text-[11px] transition ${f.zones.includes(r.pcode) ? 'border-brand bg-brand-tint text-brand-d' : 'border-line bg-surface text-ink-mute'}`}>{r.name}</button>)}
          </div>
        </Field>
      </div>
    </Modal>
  )
}

function MissionForm({ mission, onClose, onSave }) {
  const [f, setF] = useState({ period: '2025-T4', mode: 'par_commune', sitesCount: '', agents: '', budget: '', status: 'brouillon', ...mission })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title={mission.id ? 'Modifier la mission' : 'Nouvelle mission'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, sitesCount: Number(f.sitesCount) || 0, agents: Number(f.agents) || 0, budget: Number(f.budget) || 0 })}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Période"><Input value={f.period} onChange={(e) => set('period', e.target.value)} placeholder="2025-T4" /></Field>
        <Field label="Mode"><Select value={f.mode} onChange={(e) => set('mode', e.target.value)}><option value="par_commune">Par commune</option><option value="equipe_unique">Équipe unique</option></Select></Field>
        <Field label="Nombre de sites"><Input type="number" value={f.sitesCount} onChange={(e) => set('sitesCount', e.target.value)} /></Field>
        <Field label="Agents"><Input type="number" value={f.agents} onChange={(e) => set('agents', e.target.value)} /></Field>
        <Field label="Budget"><Input type="number" value={f.budget} onChange={(e) => set('budget', e.target.value)} /></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(TPM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      </div>
    </Modal>
  )
}

function ExpenseForm({ expense, onClose, onSave }) {
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), label: '', amount: '', status: 'soumis', ...expense })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title="Nouvelle dépense"
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, amount: Number(f.amount) || 0 })} disabled={!f.label}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Montant"><Input type="number" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Libellé" required className="col-span-2"><Input value={f.label} onChange={(e) => set('label', e.target.value)} /></Field>
        <Field label="Statut" className="col-span-2"><Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="soumis">Soumis</option><option value="valide">Validé</option></Select></Field>
      </div>
    </Modal>
  )
}
