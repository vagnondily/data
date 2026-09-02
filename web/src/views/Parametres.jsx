// ============================================================================
// Paramètres — organisation, référentiels (partenaires, bureaux), données
// ============================================================================
import { useRef, useState } from 'react'
import { Settings, Save, Plus, Pencil, Trash2, MoreVertical, Download, Upload, RefreshCw, Trash } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { SECTORS, REGIONS } from '../lib/constants.js'
import { exportJSON } from '../lib/export.js'
import {
  PageHeader, Card, Tabs, Field, Input, Select, Button, Badge, DataTable, Modal, Dropdown, MenuItem,
  SectionTitle, useConfirm,
} from '../components/ui.jsx'

const PARTNER_TYPES = { bailleur: 'Bailleur', partenaire: 'Partenaire de mise en œuvre', prestataire: 'Prestataire (TPM)' }

export default function Parametres() {
  const [tab, setTab] = useState('org')
  const { canAdmin } = useCan()
  return (
    <div>
      <PageHeader icon={Settings} title="Paramètres" subtitle="Configuration de l’instance et des référentiels" />
      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { value: 'org', label: 'Organisation' },
        { value: 'partners', label: 'Partenaires' },
        { value: 'offices', label: 'Bureaux' },
        { value: 'ref', label: 'Référentiels' },
        { value: 'data', label: 'Données' },
      ]} />
      {tab === 'org' && <OrgTab canAdmin={canAdmin} />}
      {tab === 'partners' && <PartnersTab canAdmin={canAdmin} />}
      {tab === 'offices' && <OfficesTab canAdmin={canAdmin} />}
      {tab === 'ref' && <RefTab />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

function OrgTab({ canAdmin }) {
  const { organization, setOrg } = useStore((s) => s)
  const [f, setF] = useState(organization)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Card className="max-w-2xl">
      <SectionTitle>Identité du bureau pays</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom" className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} disabled={!canAdmin} /></Field>
        <Field label="Acronyme"><Input value={f.acronym} onChange={(e) => set('acronym', e.target.value)} disabled={!canAdmin} /></Field>
        <Field label="Pays"><Input value={f.country} onChange={(e) => set('country', e.target.value)} disabled={!canAdmin} /></Field>
        <Field label="Devise"><Select value={f.currency} onChange={(e) => set('currency', e.target.value)} disabled={!canAdmin}><option>USD</option><option>EUR</option><option>MGA</option></Select></Field>
        <Field label="Exercice fiscal"><Input type="number" value={f.fiscalYear} onChange={(e) => set('fiscalYear', Number(e.target.value))} disabled={!canAdmin} /></Field>
        <Field label="Périmètre par défaut" className="col-span-2"><Select value={f.scopeMode} onChange={(e) => set('scopeMode', e.target.value)} disabled={!canAdmin}><option value="national">National (tous les sites)</option><option value="office">Par bureau</option></Select></Field>
      </div>
      {canAdmin && <Button className="mt-4" icon={Save} onClick={() => setOrg(f)}>Enregistrer</Button>}
    </Card>
  )
}

function PartnersTab({ canAdmin }) {
  const { partners, add, update, remove, log } = useStore((s) => s)
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()
  const del = async (p) => { if (await confirm({ title: 'Supprimer', message: `Supprimer « ${p.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) { remove('partners', p.id); log('supprime', 'partenaire', `Partenaire supprimé : ${p.name}`) } }
  return (
    <div>
      {node}
      <div className="mb-3 flex justify-end">{canAdmin && <Button icon={Plus} onClick={() => setEditing({ type: 'bailleur' })}>Nouveau partenaire</Button>}</div>
      <DataTable
        rows={partners}
        columns={[
          { key: 'name', label: 'Nom', render: (r) => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'acronym', label: 'Acronyme', render: (r) => <span className="font-mono text-xs text-brand-d">{r.acronym}</span> },
          { key: 'type', label: 'Type', render: (r) => <Badge tone={r.type === 'bailleur' ? 'brand' : r.type === 'prestataire' ? 'warn' : 'ink'}>{PARTNER_TYPES[r.type]}</Badge> },
          canAdmin && { key: 'act', label: '', width: 40, render: (r) => <Dropdown trigger={<button className="text-ink-mute hover:text-ink"><MoreVertical size={16} /></button>}><MenuItem icon={Pencil} onClick={() => setEditing(r)}>Modifier</MenuItem><MenuItem icon={Trash2} tone="bad" onClick={() => del(r)}>Supprimer</MenuItem></Dropdown> },
        ].filter(Boolean)}
      />
      {editing && <PartnerModal partner={editing} onClose={() => setEditing(null)} onSave={(data) => { if (editing.id) { update('partners', editing.id, data); log('modifie', 'partenaire', `Modifié : ${data.name}`) } else { add('partners', data); log('cree', 'partenaire', `Nouveau : ${data.name}`) } setEditing(null) }} />}
    </div>
  )
}

function PartnerModal({ partner, onClose, onSave }) {
  const [f, setF] = useState({ name: '', acronym: '', type: 'bailleur', ...partner })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title={partner.id ? 'Modifier le partenaire' : 'Nouveau partenaire'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Acronyme"><Input value={f.acronym} onChange={(e) => set('acronym', e.target.value)} /></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(PARTNER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
    </Modal>
  )
}

function OfficesTab({ canAdmin }) {
  const { offices, add, update, remove, log } = useStore((s) => s)
  const [editing, setEditing] = useState(null)
  return (
    <div>
      <div className="mb-3 flex justify-end">{canAdmin && <Button icon={Plus} onClick={() => setEditing({ type: 'terrain', scopeMode: 'office' })}>Nouveau bureau</Button>}</div>
      <DataTable
        rows={offices}
        columns={[
          { key: 'name', label: 'Bureau', render: (r) => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'type', label: 'Type', render: (r) => <Badge tone="ink">{r.type}</Badge> },
          { key: 'parent', label: 'Rattaché à', render: (r) => byId(offices, r.parentId)?.name || '—' },
          { key: 'scope', label: 'Périmètre', render: (r) => <Badge tone={r.scopeMode === 'national' ? 'brand' : 'ink'}>{r.scopeMode === 'national' ? 'National' : 'Bureau'}</Badge> },
          canAdmin && { key: 'act', label: '', width: 40, render: (r) => <button className="text-ink-mute hover:text-brand" onClick={() => setEditing(r)}><Pencil size={15} /></button> },
        ].filter(Boolean)}
      />
      {editing && <OfficeModal office={editing} offices={offices} onClose={() => setEditing(null)} onSave={(data) => { if (editing.id) update('offices', editing.id, data); else add('offices', data); log(editing.id ? 'modifie' : 'cree', 'bureau', data.name); setEditing(null) }} />}
    </div>
  )
}

function OfficeModal({ office, offices, onClose, onSave }) {
  const [f, setF] = useState({ name: '', type: 'terrain', parentId: '', region: '', scopeMode: 'office', ...office })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title={office.id ? 'Modifier le bureau' : 'Nouveau bureau'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="pays">Pays</option><option value="terrain">Terrain</option><option value="antenne">Antenne</option></Select></Field>
        <Field label="Rattaché à"><Select value={f.parentId || ''} onChange={(e) => set('parentId', e.target.value)}><option value="">—</option>{offices.filter((o) => o.id !== office.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Région"><Select value={f.region} onChange={(e) => set('region', e.target.value)}><option value="">—</option>{REGIONS.map((r) => <option key={r.pcode} value={r.pcode}>{r.name}</option>)}</Select></Field>
        <Field label="Périmètre"><Select value={f.scopeMode} onChange={(e) => set('scopeMode', e.target.value)}><option value="office">Bureau</option><option value="national">National</option></Select></Field>
      </div>
    </Modal>
  )
}

function RefTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <SectionTitle>Secteurs d’activité</SectionTitle>
        <div className="flex flex-wrap gap-1.5">{SECTORS.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</div>
      </Card>
      <Card>
        <SectionTitle>Découpage géographique</SectionTitle>
        <p className="text-sm text-ink-soft"><b>{REGIONS.length} régions</b> de Madagascar chargées comme socle cartographique. Les communes/districts s’y rattachent par p-code.</p>
        <div className="mt-2 max-h-40 overflow-y-auto text-xs text-ink-mute">{REGIONS.map((r) => r.name).join(' · ')}</div>
      </Card>
    </div>
  )
}

function DataTab() {
  const { exportState, importState, resetDemo, wipe } = useStore((s) => s)
  const fileRef = useRef(null)
  const { confirm, node } = useConfirm()
  const [msg, setMsg] = useState('')

  const onImport = async (file) => {
    if (!file) return
    const text = await file.text()
    const res = importState(text)
    setMsg(res.ok ? '✓ Sauvegarde restaurée avec succès.' : `✗ Échec : ${res.error}`)
    if (fileRef.current) fileRef.current.value = ''
  }
  const doReset = async () => { if (await confirm({ title: 'Réinitialiser la démo', message: 'Remplacer toutes les données par le jeu de démonstration ?', danger: true, confirmLabel: 'Réinitialiser' })) { resetDemo(); setMsg('✓ Démonstration réinitialisée.') } }
  const doWipe = async () => { if (await confirm({ title: 'Vider les données', message: 'Supprimer toutes les données métier (programmes, projets, etc.) ? L’organisation et les comptes sont conservés.', danger: true, confirmLabel: 'Tout vider' })) { wipe(); setMsg('✓ Données vidées.') } }

  return (
    <div className="max-w-2xl space-y-4">
      {node}
      {msg && <div className="rounded-lg bg-brand-tint px-3 py-2 text-sm font-semibold text-brand-d">{msg}</div>}
      <Card>
        <SectionTitle>Sauvegarde & restauration</SectionTitle>
        <p className="mb-3 text-sm text-ink-mute">Les données sont stockées localement dans votre navigateur. Exportez une sauvegarde JSON pour la conserver ou la transférer.</p>
        <div className="flex flex-wrap gap-2">
          <Button icon={Download} onClick={() => exportJSON(`mems-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, exportState())}>Exporter (JSON)</Button>
          <Button variant="outline" icon={Upload} onClick={() => fileRef.current?.click()}>Restaurer une sauvegarde</Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
      </Card>
      <Card>
        <SectionTitle>Zone sensible</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={RefreshCw} onClick={doReset}>Réinitialiser la démo</Button>
          <Button variant="danger" icon={Trash} onClick={doWipe}>Vider les données métier</Button>
        </div>
      </Card>
    </div>
  )
}
