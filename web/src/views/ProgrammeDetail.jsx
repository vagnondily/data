// ============================================================================
// Détail programme — onglets Aperçu · Projets · Budget
// ============================================================================
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Building2, User, Wallet, Calendar, Briefcase } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { budgetForProject, projectProgress, projectHealth, beneficiaryRollup } from '../lib/compute.js'
import { PROGRAMME_STATUS, PROJECT_STATUS, C } from '../lib/constants.js'
import { money, moneyShort, num, pct, fmtDate } from '../lib/format.js'
import {
  Card, Badge, Button, Tabs, StatusBadge, Progress, DataTable, RowActions, EmptyState,
  SectionTitle, Kpi, useConfirm,
} from '../components/ui.jsx'
import { ChartBars } from '../components/charts.jsx'
import { ProgrammeForm } from './ProgrammeForm.jsx'
import { ProjectForm } from './ProjectForm.jsx'

export default function ProgrammeDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { canEdit } = useCan()
  const store = useStore((s) => s)
  const { programmes, projects, partners, users, activities, budgetLines, beneficiaries } = store
  const [tab, setTab] = useState('apercu')
  const [editing, setEditing] = useState(false)
  const [projForm, setProjForm] = useState(null)
  const { confirm, node } = useConfirm()

  const pg = byId(programmes, id)
  if (!pg) return <EmptyState title="Programme introuvable" action={<Button onClick={() => nav('/programmes')}>Retour aux programmes</Button>} />

  const projs = projects.filter((p) => p.programmeId === pg.id)
  const aggBudget = projs.reduce((a, p) => {
    const b = budgetForProject(budgetLines, p.id)
    a.planned += b.planned; a.spent += b.spent; return a
  }, { planned: 0, spent: 0 })
  const agg = {
    budget: aggBudget,
    ben: beneficiaryRollup(beneficiaries, (x) => projs.some((p) => p.id === x.projectId)),
    prog: projs.length ? Math.round(projs.reduce((n, p) => n + projectProgress(activities, p.id), 0) / projs.length) : 0,
  }

  const donor = byId(partners, pg.donorId)
  const mgr = byId(users, pg.managerId)

  const onDeleteProject = async (p) => {
    if (await confirm({ title: 'Supprimer le projet', message: `Supprimer « ${p.name} » et ses données rattachées ?`, danger: true, confirmLabel: 'Supprimer' })) {
      store.deleteProject(p.id); store.log('supprime', 'projet', `Projet supprimé : ${p.name}`)
    }
  }

  const budgetByProject = projs.map((p) => {
    const b = budgetForProject(budgetLines, p.id)
    return { name: p.code, Prévu: b.planned, Dépensé: b.spent }
  })

  return (
    <div>
      {node}
      <Link to="/programmes" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-mute hover:text-brand"><ArrowLeft size={15} /> Programmes</Link>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-brand-d">{pg.code}</span>
              <StatusBadge map={PROGRAMME_STATUS} value={pg.status} />
            </div>
            <h1 className="mt-2 text-xl font-extrabold text-ink">{pg.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">{pg.description}</p>
          </div>
          {canEdit && <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Modifier</Button>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Fact icon={Building2} label="Bailleur" value={donor?.acronym || '—'} />
          <Fact icon={User} label="Gestionnaire" value={mgr?.name?.split(' ')[0] || '—'} />
          <Fact icon={Briefcase} label="Projets" value={projs.length} />
          <Fact icon={Wallet} label="Budget" value={moneyShort(pg.budget, pg.currency)} />
          <Fact icon={Calendar} label="Période" value={fmtDate(pg.startDate)} sub={`→ ${fmtDate(pg.endDate)}`} />
          <Fact icon={Wallet} label="Secteurs" value={`${(pg.sectors || []).length}`} />
        </div>
      </Card>

      <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[
        { value: 'apercu', label: 'Aperçu' },
        { value: 'projets', label: 'Projets', count: projs.length },
        { value: 'budget', label: 'Budget' },
      ]} />

      {tab === 'apercu' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Projets" value={projs.length} icon={Briefcase} tone="brand" />
            <Kpi label="Budget dépensé" value={moneyShort(agg.budget.spent)} sub={`${pct(agg.budget.planned ? (agg.budget.spent / agg.budget.planned) * 100 : 0)} du prévu`} icon={Wallet} tone="ok" />
            <Kpi label="Bénéficiaires atteints" value={num(agg.ben.reached)} sub={pct(agg.ben.rate)} tone="brand" />
            <Kpi label="Avancement moyen" value={pct(agg.prog)} tone={agg.prog >= 66 ? 'ok' : agg.prog >= 33 ? 'warn' : 'bad'} />
          </div>
          {(pg.sectors || []).length > 0 && (
            <Card>
              <SectionTitle>Secteurs d’intervention</SectionTitle>
              <div className="flex flex-wrap gap-1.5">{pg.sectors.map((s) => <Badge key={s} tone="brand">{s}</Badge>)}</div>
            </Card>
          )}
          {budgetByProject.length > 0 && (
            <Card>
              <SectionTitle>Budget prévu vs dépensé — par projet</SectionTitle>
              <ChartBars data={budgetByProject} xKey="name" fmt={(v) => moneyShort(v)}
                series={[{ key: 'Prévu', label: 'Prévu', color: C.brand }, { key: 'Dépensé', label: 'Dépensé', color: C.ok }]} height={260} />
            </Card>
          )}
        </div>
      )}

      {tab === 'projets' && (
        <div>
          {canEdit && <div className="mb-3 flex justify-end"><Button icon={Plus} onClick={() => setProjForm({ programmeId: pg.id })}>Nouveau projet</Button></div>}
          {projs.length === 0 ? <EmptyState title="Aucun projet dans ce programme" hint="Ajoutez-en un pour démarrer." icon={Briefcase} /> : (
            <DataTable
              onRowClick={(p) => nav(`/projets/${p.id}`)}
              rows={projs}
              columns={[
                { key: 'code', label: 'Code', render: (p) => <span className="font-mono text-xs font-bold text-brand-d">{p.code}</span> },
                { key: 'name', label: 'Projet', render: (p) => <span className="font-semibold text-ink">{p.name}</span> },
                { key: 'status', label: 'Statut', render: (p) => <StatusBadge map={PROJECT_STATUS} value={p.status} /> },
                { key: 'health', label: 'Santé', render: (p) => { const h = projectHealth(p, projectProgress(activities, p.id), budgetForProject(budgetLines, p.id)); return <Badge tone={h.tone} dot>{h.label}</Badge> } },
                { key: 'prog', label: 'Avancement', width: 140, render: (p) => <Progress value={projectProgress(activities, p.id)} tone="brand" showValue /> },
                { key: 'dep', label: 'Dépensé', align: 'right', render: (p) => <span className="tabnum">{moneyShort(budgetForProject(budgetLines, p.id).spent)}</span> },
                { key: 'end', label: 'Échéance', align: 'right', render: (p) => <span className="text-xs">{fmtDate(p.endDate)}</span> },
                {
                  key: 'act', label: '', width: 200, align: 'right',
                  render: (p) => <RowActions onOpen={() => nav(`/projets/${p.id}`)}
                    onEdit={canEdit ? () => setProjForm(p) : undefined}
                    onDelete={canEdit ? () => onDeleteProject(p) : undefined} />,
                },
              ]}
            />
          )}
        </div>
      )}

      {tab === 'budget' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi label="Budget prévu (projets)" value={money(agg.budget.planned)} tone="brand" />
            <Kpi label="Dépensé" value={money(agg.budget.spent)} sub={pct(agg.budget.planned ? (agg.budget.spent / agg.budget.planned) * 100 : 0)} tone="ok" />
            <Kpi label="Solde" value={money(agg.budget.planned - agg.budget.spent)} tone="ink" />
          </div>
          {budgetByProject.length > 0 ? (
            <Card>
              <SectionTitle>Prévu vs dépensé — par projet</SectionTitle>
              <ChartBars data={budgetByProject} xKey="name" fmt={(v) => moneyShort(v)}
                series={[{ key: 'Prévu', label: 'Prévu', color: C.brand }, { key: 'Dépensé', label: 'Dépensé', color: C.ok }]} height={280} />
            </Card>
          ) : <EmptyState title="Aucune donnée budgétaire" icon={Wallet} />}
        </div>
      )}

      {editing && <ProgrammeForm programme={pg} onClose={() => setEditing(false)} />}
      {projForm && <ProjectForm project={projForm} onClose={() => setProjForm(null)} />}
    </div>
  )
}

function Fact({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 flex-none text-ink-mute" />
      <div className="min-w-0"><div className="text-[11px] text-ink-mute">{label}</div><div className="truncate text-sm font-semibold text-ink">{value}</div>{sub && <div className="text-[11px] text-ink-mute">{sub}</div>}</div>
    </div>
  )
}
