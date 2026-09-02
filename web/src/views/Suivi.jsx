// ============================================================================
// Suivi & visites — couverture (MMR), conformité /100, plan et registre de visites
// ============================================================================
import { useMemo, useState } from 'react'
import { ClipboardCheck, Plus, Pencil, Trash2, MoreVertical, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { coverageStats, complianceStats } from '../lib/compute.js'
import { VISIT_STATUS, VISIT_TYPE, COMPLIANCE_BANDS, complianceBand, MMR_TARGET } from '../lib/constants.js'
import { fmtDate, pct, todayISO } from '../lib/format.js'
import {
  PageHeader, Kpi, Card, Ring, Badge, Button, Select, StatusBadge, DataTable, Modal, Field, Input,
  Textarea, RowActions, useConfirm, SectionTitle,
} from '../components/ui.jsx'

export default function Suivi() {
  const { visits, sites, projects, users, add, update, remove, log } = useStore((s) => s)
  const { canEdit, canValidate } = useCan()
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()

  const scoped = useMemo(() => visits.filter((v) => !projectId || v.projectId === projectId), [visits, projectId])
  const cov = useMemo(() => coverageStats(sites, scoped, (s) => !projectId || (s.projectIds || []).includes(projectId)), [sites, scoped, projectId])
  const comp = useMemo(() => complianceStats(scoped), [scoped])

  const bands = useMemo(() => {
    const scored = scoped.filter((v) => v.status === 'realise' && v.score != null)
    const counts = { exc: 0, sat: 0, amel: 0, urg: 0 }
    scored.forEach((v) => { counts[complianceBand(v.score).key] += 1 })
    return { counts, total: scored.length }
  }, [scoped])

  const uncovered = useMemo(() => {
    const monitored = new Set(scoped.filter((v) => v.status === 'realise').map((v) => v.siteId))
    return sites.filter((s) => s.status === 'actif' && !monitored.has(s.id) && (!projectId || (s.projectIds || []).includes(projectId)))
  }, [sites, scoped, projectId])

  const rows = scoped.filter((v) => !status || v.status === status).sort((a, b) => (a.date < b.date ? 1 : -1))

  const del = async (v) => {
    if (await confirm({ title: 'Supprimer la visite', message: 'Confirmer la suppression de cette visite ?', danger: true, confirmLabel: 'Supprimer' })) {
      remove('visits', v.id); log('supprime', 'visite', `Visite supprimée`)
    }
  }
  const validate = (v) => { update('visits', v.id, { status: 'realise' }); log('valide', 'visite', `Visite validée : ${byId(sites, v.siteId)?.name}`) }

  return (
    <div>
      {node}
      <PageHeader icon={ClipboardCheck} title="Suivi & visites" subtitle="Couverture du suivi fondé sur le risque et conformité des processus"
        actions={<>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto"><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
          {canEdit && <Button icon={Plus} onClick={() => setEditing({ date: todayISO(), status: 'planifie', type: 'routine', mmr: true })}>Planifier une visite</Button>}
        </>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="flex flex-col items-center justify-center">
          <Ring value={cov.coverage} tone={cov.coverage >= MMR_TARGET ? 'ok' : cov.coverage >= 60 ? 'warn' : 'bad'} size={104} stroke={10} sub={`cible ${MMR_TARGET}%`} />
          <div className="mt-2 text-sm font-semibold text-ink">Couverture MMR</div>
          <div className="text-xs text-ink-mute">{cov.monitored}/{cov.required} sites suivis</div>
        </Card>
        <Card className="flex flex-col items-center justify-center">
          <Ring value={comp.avg || 0} tone={comp.avg >= 65 ? 'ok' : comp.avg >= 50 ? 'warn' : 'bad'} label={comp.avg ?? '—'} size={104} stroke={10} sub="/100" />
          <div className="mt-2"><Badge tone={comp.band.tone || 'ink'} dot>{comp.band.label}</Badge></div>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <Kpi label="Visites réalisées" value={scoped.filter((v) => v.status === 'realise').length} icon={CheckCircle2} tone="ok" />
          <Kpi label="Visites planifiées" value={scoped.filter((v) => v.status === 'planifie').length} tone="brand" />
          <Kpi label="Action urgente (<50)" value={comp.urgent} icon={AlertTriangle} tone={comp.urgent ? 'bad' : 'ink'} />
          <Kpi label="Sites non couverts" value={uncovered.length} tone={uncovered.length ? 'warn' : 'ok'} />
        </div>
      </div>

      {/* Distribution des bandes de conformité */}
      <Card className="mt-4">
        <SectionTitle>Répartition de la conformité (visites réalisées)</SectionTitle>
        {bands.total === 0 ? <p className="text-sm text-ink-mute">Aucune visite notée.</p> : (
          <>
            <div className="flex h-6 w-full overflow-hidden rounded-lg">
              {COMPLIANCE_BANDS.map((b) => {
                const c = bands.counts[b.key]; if (!c) return null
                return <div key={b.key} style={{ width: `${(c / bands.total) * 100}%`, background: b.color }} className="grid place-items-center text-[11px] font-bold text-white" title={`${b.label}: ${c}`}>{c}</div>
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {COMPLIANCE_BANDS.map((b) => (
                <span key={b.key} className="flex items-center gap-1.5 text-xs text-ink-soft"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.label} <b className="tabnum">{bands.counts[b.key]}</b></span>
              ))}
            </div>
          </>
        )}
      </Card>

      {uncovered.length > 0 && (
        <Card className="mt-4 border-l-4 border-l-warn-dot">
          <SectionTitle>Sites actifs non encore couverts</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {uncovered.map((s) => (
              <button key={s.id} onClick={() => canEdit && setEditing({ siteId: s.id, projectId: s.projectIds?.[0], date: todayISO(), status: 'planifie', type: 'routine', mmr: true })}
                className="rounded-full border border-warn-dot/40 bg-warn-tint px-3 py-1 text-xs font-semibold text-warn transition hover:brightness-95">
                {s.name}{canEdit ? ' + planifier' : ''}
              </button>
            ))}
          </div>
        </Card>
      )}

      <SectionTitle className="mt-6" action={
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto"><option value="">Tous statuts</option>{Object.entries(VISIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
      }>Registre des visites</SectionTitle>
      <DataTable
        empty="Aucune visite"
        rows={rows}
        columns={[
          { key: 'site', label: 'Site', render: (r) => <span className="font-semibold text-ink">{byId(sites, r.siteId)?.name || '—'}</span> },
          { key: 'project', label: 'Projet', render: (r) => <Badge tone="ink">{byId(projects, r.projectId)?.code || '—'}</Badge> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'type', label: 'Type', render: (r) => <span className="text-xs text-ink-soft">{VISIT_TYPE[r.type]?.label}</span> },
          { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={VISIT_STATUS} value={r.status} /> },
          { key: 'score', label: 'Score', align: 'right', render: (r) => r.score == null ? '—' : <span className={`font-bold tabnum ${r.score >= 65 ? 'text-ok' : r.score >= 50 ? 'text-warn' : 'text-bad'}`}>{r.score}</span> },
          { key: 'monitor', label: 'Suivi par', render: (r) => byId(users, r.monitorId)?.name?.split(' ')[0] || '—' },
          (canEdit || canValidate) && {
            key: 'act', label: '', width: 150, align: 'right', render: (r) => (
              <div className="flex items-center justify-end gap-1">
                {canValidate && r.status === 'planifie' && (
                  <button title="Marquer réalisée" onClick={() => validate(r)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute transition hover:bg-ok-tint hover:text-ok"><CheckCircle2 size={16} /></button>
                )}
                <RowActions onEdit={canEdit ? () => setEditing(r) : undefined} onDelete={canEdit ? () => del(r) : undefined} />
              </div>
            ),
          },
        ].filter(Boolean)}
      />

      {editing && <VisitModal visit={editing} sites={sites} projects={projects} users={users} onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing.id) { update('visits', editing.id, data); log('modifie', 'visite', `Visite modifiée`) }
          else { add('visits', data); log('cree', 'visite', `Visite planifiée : ${byId(sites, data.siteId)?.name}`) }
          setEditing(null)
        }} />}
    </div>
  )
}

function VisitModal({ visit, sites, projects, users, onClose, onSave }) {
  const [f, setF] = useState({ siteId: '', projectId: '', date: todayISO(), monitorId: '', type: 'routine', status: 'planifie', score: '', findings: '', recommendations: '', mmr: true, ...visit })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const onSite = (id) => { const s = byId(sites, id); set('siteId', id); if (s?.projectIds?.length && !f.projectId) set('projectId', s.projectIds[0]) }
  return (
    <Modal open onClose={onClose} size="lg" title={visit.id ? 'Modifier la visite' : 'Planifier une visite'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, score: f.score === '' ? null : Number(f.score) })} disabled={!f.siteId}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Site" required><Select value={f.siteId} onChange={(e) => onSite(e.target.value)}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Projet"><Select value={f.projectId} onChange={(e) => set('projectId', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Suivi par"><Select value={f.monitorId} onChange={(e) => set('monitorId', e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(VISIT_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(VISIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Score de conformité /100" hint="Laisser vide si non évalué"><Input type="number" min="0" max="100" value={f.score} onChange={(e) => set('score', e.target.value)} /></Field>
        <Field label="Exigence MMR"><Select value={f.mmr ? '1' : '0'} onChange={(e) => set('mmr', e.target.value === '1')}><option value="1">Oui</option><option value="0">Non</option></Select></Field>
        <Field label="Constats" className="col-span-2"><Textarea value={f.findings} onChange={(e) => set('findings', e.target.value)} /></Field>
        <Field label="Recommandations" className="col-span-2"><Textarea value={f.recommendations} onChange={(e) => set('recommendations', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
