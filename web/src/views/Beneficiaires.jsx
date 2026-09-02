// ============================================================================
// Bénéficiaires — ciblage (prévu) vs atteint, désagrégation par genre
// ============================================================================
import { useMemo, useState } from 'react'
import { Users, Plus, Pencil, Trash2, MoreVertical } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { beneficiaryRollup } from '../lib/compute.js'
import { C } from '../lib/constants.js'
import { num, pct } from '../lib/format.js'
import {
  PageHeader, Kpi, Card, SectionTitle, Select, Button, Badge, Progress, DataTable, Modal, Field, Input,
  RowActions, useConfirm,
} from '../components/ui.jsx'
import { ChartBars, ChartDonut, Legendette } from '../components/charts.jsx'

export default function Beneficiaires() {
  const { beneficiaries, projects, sites, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [projectId, setProjectId] = useState('')
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()

  const rows = useMemo(() => beneficiaries.filter((b) => !projectId || b.projectId === projectId), [beneficiaries, projectId])
  const roll = useMemo(() => beneficiaryRollup(rows), [rows])

  const byProject = useMemo(() => projects.map((p) => {
    const r = beneficiaryRollup(beneficiaries.filter((b) => b.projectId === p.id))
    return { name: p.code, Prévu: r.planned, Atteint: r.reached }
  }).filter((x) => x.Prévu > 0), [projects, beneficiaries])

  const genderData = [
    { name: 'Femmes', value: roll.reachedF, color: C.brand },
    { name: 'Hommes', value: roll.reachedM, color: C.ok },
  ]

  const del = async (b) => {
    if (await confirm({ title: 'Supprimer la ligne', message: 'Confirmer la suppression ?', danger: true, confirmLabel: 'Supprimer' })) {
      remove('beneficiaries', b.id); log('supprime', 'bénéficiaires', 'Ligne de ciblage supprimée')
    }
  }

  return (
    <div>
      {node}
      <PageHeader icon={Users} title="Bénéficiaires" subtitle="Ciblage de la population et personnes atteintes"
        actions={<>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto"><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          {canEdit && <Button icon={Plus} onClick={() => setEditing({ projectId: projectId || projects[0]?.id })}>Ajouter</Button>}
        </>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cible totale" value={num(roll.planned)} icon={Users} tone="brand" />
        <Kpi label="Personnes atteintes" value={num(roll.reached)} sub={pct(roll.rate)} icon={Users} tone="ok" />
        <Kpi label="Taux d’atteinte" value={pct(roll.rate)} tone={roll.rate >= 90 ? 'ok' : roll.rate >= 70 ? 'warn' : 'bad'} />
        <Kpi label="Part des femmes" value={pct(roll.femRate)} tone="brand" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Prévu vs atteint — par projet</SectionTitle>
          <ChartBars data={byProject} xKey="name" fmt={num}
            series={[{ key: 'Prévu', label: 'Ciblé', color: C.brand }, { key: 'Atteint', label: 'Atteint', color: C.ok }]} height={260} />
        </Card>
        <Card>
          <SectionTitle>Désagrégation par genre</SectionTitle>
          <ChartDonut data={genderData} centerLabel={num(roll.reached)} centerSub="atteints" fmt={num} height={210} />
          <div className="mt-2"><Legendette items={genderData.map((d) => ({ label: d.name, color: d.color, value: num(d.value) }))} /></div>
        </Card>
      </div>

      <SectionTitle className="mt-6">Détail du ciblage</SectionTitle>
      <DataTable
        empty="Aucune donnée de ciblage"
        rows={rows}
        columns={[
          { key: 'project', label: 'Projet', render: (r) => <Badge tone="ink">{byId(projects, r.projectId)?.code || '—'}</Badge> },
          { key: 'site', label: 'Site', render: (r) => <span className="text-ink-soft">{byId(sites, r.siteId)?.name || '—'}</span> },
          { key: 'category', label: 'Catégorie', render: (r) => <span className="font-semibold text-ink">{r.category}</span> },
          { key: 'planned', label: 'Ciblé', align: 'right', render: (r) => <span className="tabnum">{num(r.plannedTotal)}</span> },
          { key: 'reached', label: 'Atteint', align: 'right', render: (r) => <span className="tabnum font-semibold">{num(r.reachedTotal)}</span> },
          { key: 'rate', label: 'Taux', width: 140, render: (r) => { const rt = r.plannedTotal ? (r.reachedTotal / r.plannedTotal) * 100 : 0; return <div className="flex items-center gap-2"><Progress value={rt} tone={rt >= 90 ? 'ok' : rt >= 70 ? 'warn' : 'bad'} /><span className="w-9 text-right text-xs tabnum">{pct(rt)}</span></div> } },
          { key: 'gender', label: 'F / H', align: 'right', render: (r) => <span className="text-xs text-ink-mute tabnum">{num(r.reachedF)} / {num(r.reachedM)}</span> },
          canEdit && {
            key: 'act', label: '', width: 110, align: 'right',
            render: (r) => <RowActions onEdit={() => setEditing(r)} onDelete={() => del(r)} />,
          },
        ].filter(Boolean)}
      />

      {editing && <BeneficiaryModal ben={editing} projects={projects} sites={sites} onClose={() => setEditing(null)}
        onSave={(data) => {
          const rec = { ...data, plannedM: Number(data.plannedM) || 0, plannedF: Number(data.plannedF) || 0, reachedM: Number(data.reachedM) || 0, reachedF: Number(data.reachedF) || 0 }
          rec.plannedTotal = rec.plannedM + rec.plannedF; rec.reachedTotal = rec.reachedM + rec.reachedF
          if (editing.id) { update('beneficiaries', editing.id, rec); log('modifie', 'bénéficiaires', `Ciblage modifié : ${rec.category}`) }
          else { add('beneficiaries', rec); log('cree', 'bénéficiaires', `Ciblage ajouté : ${rec.category}`) }
          setEditing(null)
        }} />}
    </div>
  )
}

function BeneficiaryModal({ ben, projects, sites, onClose, onSave }) {
  const [f, setF] = useState({ projectId: '', siteId: '', category: '', plannedM: '', plannedF: '', reachedM: '', reachedF: '', ...ben })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const projSites = sites.filter((s) => !f.projectId || (s.projectIds || []).includes(f.projectId))
  return (
    <Modal open onClose={onClose} size="lg" title={ben.id ? 'Modifier le ciblage' : 'Nouveau ciblage'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.category || !f.projectId}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Projet" required><Select value={f.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</Select></Field>
        <Field label="Site"><Select value={f.siteId} onChange={(e) => set('siteId', e.target.value)}><option value="">—</option>{projSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Catégorie de bénéficiaires" required className="col-span-2"><Input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Ex. Ménages vulnérables, Enfants 6-59 mois…" /></Field>
        <Field label="Ciblé — Femmes"><Input type="number" value={f.plannedF} onChange={(e) => set('plannedF', e.target.value)} /></Field>
        <Field label="Ciblé — Hommes"><Input type="number" value={f.plannedM} onChange={(e) => set('plannedM', e.target.value)} /></Field>
        <Field label="Atteint — Femmes"><Input type="number" value={f.reachedF} onChange={(e) => set('reachedF', e.target.value)} /></Field>
        <Field label="Atteint — Hommes"><Input type="number" value={f.reachedM} onChange={(e) => set('reachedM', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
