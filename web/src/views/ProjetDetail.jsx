// ============================================================================
// Détail projet — espace de travail à onglets (aperçu, cadre logique, activités,
// indicateurs, budget, sites, suivi, équipe)
// ============================================================================
import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Pencil, MapPin, Users as UsersIcon, Calendar, Building2, Target, Wallet,
  ClipboardCheck, AlertTriangle, ExternalLink,
} from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import {
  budgetForProject, projectProgress, projectHealth, beneficiaryRollup, coverageStats,
  complianceStats, indicatorAchievement, achievementTone,
} from '../lib/compute.js'
import { PROJECT_STATUS, PRIORITY, REGIONS, VISIT_STATUS, VISIT_TYPE, SECURITY, SITE_STATUS, ROLES } from '../lib/constants.js'
import { money, moneyShort, num, pct, fmtDate, daysBetween } from '../lib/format.js'
import {
  Card, Badge, Button, Tabs, StatusBadge, Progress, Ring, Avatar, DataTable, EmptyState, SectionTitle,
} from '../components/ui.jsx'
import SiteMap from '../components/Map.jsx'
import { ProjectForm } from './ProjectForm.jsx'
import { LogframePanel } from './panels/Logframe.jsx'
import { ActivityBoard } from './panels/Activities.jsx'
import { IndicatorPanel } from './panels/Indicators.jsx'
import { BudgetPanel } from './panels/Budget.jsx'
import { MonitoringGrid } from './PlanSuivi.jsx'
import { MrePanel } from './Mre.jsx'

export default function ProjetDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { canEdit } = useCan()
  const store = useStore((s) => s)
  const { projects, programmes, partners, users, activities, budgetLines, beneficiaries, sites, visits, indicators, objectives, results, mreActivities } = store
  const [tab, setTab] = useState('apercu')
  const [editing, setEditing] = useState(false)

  const p = byId(projects, id)
  if (!p) return <EmptyState title="Projet introuvable" hint="Ce projet a peut-être été supprimé." action={<Button onClick={() => nav('/projets')}>Retour aux projets</Button>} />

  const prog = projectProgress(activities, p.id)
  const budget = budgetForProject(budgetLines, p.id)
  const ben = beneficiaryRollup(beneficiaries, (x) => x.projectId === p.id)
  const health = projectHealth(p, prog, budget)
  const projSites = sites.filter((s) => (s.projectIds || []).includes(p.id))
  const projVisits = visits.filter((v) => v.projectId === p.id)
  const cov = coverageStats(projSites, projVisits)
  const comp = complianceStats(projVisits)
  const projInd = indicators.filter((i) => i.projectId === p.id)
  const donor = byId(partners, p.donorId)
  const mgr = byId(users, p.managerId)
  const programme = byId(programmes, p.programmeId)

  const tabs = [
    { value: 'apercu', label: 'Aperçu' },
    { value: 'cadre', label: 'Cadre logique', count: results.filter((r) => r.projectId === p.id).length },
    { value: 'activites', label: 'Activités', count: activities.filter((a) => a.projectId === p.id).length },
    { value: 'indicateurs', label: 'Indicateurs', count: projInd.length },
    { value: 'budget', label: 'Budget' },
    { value: 'sites', label: 'Sites', count: projSites.length },
    { value: 'plansuivi', label: 'Plan de suivi' },
    { value: 'suivi', label: 'Suivi', count: projVisits.length },
    { value: 'mre', label: 'Plan MRE', count: mreActivities.filter((m) => m.projectId === p.id).length },
    { value: 'equipe', label: 'Équipe' },
  ]

  return (
    <div>
      <Link to="/projets" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-mute hover:text-brand">
        <ArrowLeft size={15} /> Projets
      </Link>

      {/* En-tête */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-brand-d">{p.code}</span>
              <StatusBadge map={PROJECT_STATUS} value={p.status} />
              <Badge tone={health.tone} dot>{health.label}</Badge>
              <Badge tone={PRIORITY[p.priority]?.tone || 'ink'}>Priorité {PRIORITY[p.priority]?.label?.toLowerCase()}</Badge>
            </div>
            <h1 className="mt-2 text-xl font-extrabold text-ink">{p.name}</h1>
            {programme && <Link to={`/projets?prog=${programme.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-ink-mute hover:text-brand">{programme.name} <ExternalLink size={11} /></Link>}
          </div>
          {canEdit && <Button variant="outline" icon={Pencil} onClick={() => setEditing(true)}>Modifier</Button>}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
          <Fact icon={Building2} label="Bailleur" value={donor?.acronym || '—'} />
          <Fact icon={UsersIcon} label="Chef de projet" value={mgr?.name?.split(' ')[0] || '—'} />
          <Fact icon={Calendar} label="Période" value={`${fmtDate(p.startDate)}`} sub={`→ ${fmtDate(p.endDate)}`} />
          <Fact icon={MapPin} label="Zones" value={`${(p.regions || []).length} région(s)`} />
          <Fact icon={Wallet} label="Budget" value={moneyShort(p.budget, p.currency)} />
          <Fact icon={Target} label="Secteur" value={p.sector || '—'} />
        </div>
      </Card>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-4" />

      {tab === 'apercu' && (
        <Overview p={p} prog={prog} budget={budget} ben={ben} health={health} cov={cov} comp={comp}
          projInd={projInd} projVisits={projVisits} users={users} sites={sites} />
      )}
      {tab === 'cadre' && <LogframePanel projectId={p.id} />}
      {tab === 'activites' && <ActivityBoard projectId={p.id} />}
      {tab === 'indicateurs' && <IndicatorPanel projectId={p.id} />}
      {tab === 'budget' && <BudgetPanel projectId={p.id} />}
      {tab === 'sites' && <SitesTab sites={projSites} />}
      {tab === 'plansuivi' && <MonitoringGrid fixedProject={p.id} />}
      {tab === 'suivi' && <SuiviTab visits={projVisits} sites={sites} users={users} cov={cov} comp={comp} />}
      {tab === 'mre' && <MrePanel fixedProject={p.id} />}
      {tab === 'equipe' && <TeamTab project={p} users={users} activities={activities.filter((a) => a.projectId === p.id)} />}

      {editing && <ProjectForm project={p} onClose={() => setEditing(false)} />}
    </div>
  )
}

function Fact({ icon: Icon, label, value, sub }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 flex-none text-ink-mute" />
      <div className="min-w-0">
        <div className="text-[11px] text-ink-mute">{label}</div>
        <div className="truncate text-sm font-semibold text-ink">{value}</div>
        {sub && <div className="text-[11px] text-ink-mute">{sub}</div>}
      </div>
    </div>
  )
}

function Overview({ p, prog, budget, ben, health, cov, comp, projInd, projVisits, users, sites }) {
  const topInd = projInd.map((i) => ({ i, a: indicatorAchievement(i) })).filter((x) => x.a != null).sort((a, b) => b.a - a.a).slice(0, 5)
  const recentVisits = [...projVisits].filter((v) => v.status === 'realise').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4)
  const remaining = daysBetween(new Date().toISOString(), p.endDate)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <SectionTitle>Description & objectif global</SectionTitle>
          <p className="text-sm text-ink-soft">{p.description || '—'}</p>
          {p.objectiveGlobal && <div className="mt-3 rounded-xl border-l-4 border-l-brand bg-brand-tint/30 p-3 text-sm font-semibold text-ink">🎯 {p.objectiveGlobal}</div>}
        </Card>

        <Card>
          <SectionTitle>Indicateurs clés</SectionTitle>
          {topInd.length === 0 ? <p className="text-sm text-ink-mute">Aucune valeur d’indicateur saisie.</p> : (
            <div className="space-y-2.5">
              {topInd.map(({ i, a }) => (
                <div key={i.id} className="flex items-center gap-3">
                  <span className="w-16 flex-none font-mono text-xs text-ink-mute">{i.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft" title={i.name}>{i.name}</span>
                  <Progress value={a} tone={achievementTone(a)} className="max-w-[160px]" />
                  <span className="w-12 flex-none text-right text-xs font-bold text-ink tabnum">{pct(a)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Dernières visites de suivi</SectionTitle>
          {recentVisits.length === 0 ? <p className="text-sm text-ink-mute">Aucune visite réalisée.</p> : (
            <div className="space-y-2">
              {recentVisits.map((v) => {
                const s = byId(sites, v.siteId)
                return (
                  <div key={v.id} className="flex items-center gap-3 rounded-xl border border-line-soft px-3 py-2">
                    <span className={`grid h-8 w-8 flex-none place-items-center rounded-lg text-xs font-bold ${v.score >= 65 ? 'bg-ok-tint text-ok' : v.score >= 50 ? 'bg-warn-tint text-warn' : 'bg-bad-tint text-bad'}`}>{v.score}</span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-ink">{s?.name}</div><div className="truncate text-xs text-ink-mute">{v.findings}</div></div>
                    <span className="text-xs text-ink-mute">{fmtDate(v.date)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="flex flex-col items-center">
          <SectionTitle className="w-full">Avancement</SectionTitle>
          <Ring value={prog} tone={health.tone} size={120} stroke={11} sub="activités" />
          <Badge tone={health.tone} dot className="mt-3">{health.label}</Badge>
          <div className="mt-2 text-xs text-ink-mute">{remaining > 0 ? `${remaining} jours restants` : 'Échéance dépassée'}</div>
        </Card>

        <Card>
          <SectionTitle>Chiffres clés</SectionTitle>
          <div className="space-y-3">
            <MiniStat label="Budget dépensé" value={money(budget.spent)} sub={`${pct(budget.burn)} de ${moneyShort(budget.planned)}`} tone={budget.burn > 90 ? 'bad' : 'ok'} bar={budget.burn} />
            <MiniStat label="Bénéficiaires atteints" value={num(ben.reached)} sub={`${pct(ben.rate)} de la cible · ${pct(ben.femRate)} femmes`} tone="brand" bar={ben.rate} />
            <MiniStat label="Couverture suivi (MMR)" value={pct(cov.coverage)} sub={`${cov.monitored}/${cov.required} sites suivis`} tone={cov.coverage >= 80 ? 'ok' : 'warn'} bar={cov.coverage} />
            <MiniStat label="Conformité moyenne" value={comp.avg != null ? `${comp.avg}/100` : '—'} sub={comp.band.label} tone={comp.avg >= 65 ? 'ok' : comp.avg >= 50 ? 'warn' : 'bad'} bar={comp.avg || 0} />
          </div>
          {comp.urgent > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-bad-tint px-3 py-2 text-xs font-semibold text-bad">
              <AlertTriangle size={14} /> {comp.urgent} site(s) en action urgente
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub, tone, bar }) {
  return (
    <div>
      <div className="flex items-baseline justify-between"><span className="text-xs text-ink-mute">{label}</span><span className="text-sm font-extrabold text-ink tabnum">{value}</span></div>
      <Progress value={bar} tone={tone} className="mt-1" />
      {sub && <div className="mt-1 text-[11px] text-ink-mute">{sub}</div>}
    </div>
  )
}

function SitesTab({ sites }) {
  if (sites.length === 0) return <EmptyState title="Aucun site rattaché" hint="Rattachez des sites à ce projet depuis le module Sites." icon={MapPin} />
  const mapped = sites.map((s) => ({ ...s, tone: SECURITY[s.security]?.tone || 'brand', badge: SECURITY[s.security]?.label, meta: s.district }))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2"><SiteMap sites={mapped} height={420} /></div>
      <Card pad={false}>
        <div className="max-h-[420px] overflow-y-auto">
          {sites.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0">
              <span className={`h-2.5 w-2.5 flex-none rounded-full ${{ ok: 'bg-ok-dot', warn: 'bg-warn-dot', bad: 'bg-bad' }[SECURITY[s.security]?.tone] || 'bg-brand'}`} />
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold text-ink">{s.name}</div><div className="text-xs text-ink-mute">{s.district}</div></div>
              <StatusBadge map={SITE_STATUS} value={s.status} dot={false} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function SuiviTab({ visits, sites, users, cov, comp }) {
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><div className="text-xs text-ink-mute">Visites réalisées</div><div className="mt-1 text-xl font-extrabold text-ink">{visits.filter((v) => v.status === 'realise').length}</div></Card>
        <Card><div className="text-xs text-ink-mute">Couverture</div><div className="mt-1 text-xl font-extrabold text-ink">{pct(cov.coverage)}</div></Card>
        <Card><div className="text-xs text-ink-mute">Conformité</div><div className="mt-1 text-xl font-extrabold text-ink">{comp.avg ?? '—'}</div></Card>
        <Card><div className="text-xs text-ink-mute">Action urgente</div><div className="mt-1 text-xl font-extrabold text-bad">{comp.urgent}</div></Card>
      </div>
      <DataTable
        empty="Aucune visite"
        rows={[...visits].sort((a, b) => (a.date < b.date ? 1 : -1))}
        columns={[
          { key: 'site', label: 'Site', render: (r) => <span className="font-semibold text-ink">{byId(sites, r.siteId)?.name}</span> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'type', label: 'Type', render: (r) => <Badge tone="ink">{VISIT_TYPE[r.type]?.label}</Badge> },
          { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={VISIT_STATUS} value={r.status} /> },
          { key: 'score', label: 'Score', align: 'right', render: (r) => r.score == null ? '—' : <span className={`font-bold tabnum ${r.score >= 65 ? 'text-ok' : r.score >= 50 ? 'text-warn' : 'text-bad'}`}>{r.score}</span> },
          { key: 'monitor', label: 'Suivi par', render: (r) => byId(users, r.monitorId)?.name?.split(' ')[0] || '—' },
        ]}
      />
    </div>
  )
}

function TeamTab({ project, users, activities }) {
  const ids = new Set([project.managerId, ...activities.map((a) => a.responsibleId)].filter(Boolean))
  const team = users.filter((u) => ids.has(u.id))
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {team.map((u) => {
        const load = activities.filter((a) => a.responsibleId === u.id && a.status !== 'done').length
        return (
          <Card key={u.id} className="flex items-center gap-3">
            <Avatar name={u.name} size={44} tone={u.id === project.managerId ? 'brand' : 'ink'} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-ink">{u.name}</div>
              <div className="text-xs text-ink-mute">{u.title}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge tone={ROLES[u.role]?.color || 'ink'}>{ROLES[u.role]?.label}</Badge>
                {u.id === project.managerId && <Badge tone="brand">Chef de projet</Badge>}
              </div>
            </div>
            <div className="ml-auto text-center"><div className="text-lg font-extrabold text-ink tabnum">{load}</div><div className="text-[10px] text-ink-mute">en cours</div></div>
          </Card>
        )
      })}
      {team.length === 0 && <EmptyState title="Aucun membre identifié" icon={UsersIcon} />}
    </div>
  )
}
