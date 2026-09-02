// ============================================================================
// Tableau de bord — cockpit du portefeuille (KPIs, prévu vs réalisé, alertes)
// ============================================================================
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, Users, Wallet, ClipboardCheck, Target, Gauge, ArrowRight, TrendingUp, AlertTriangle,
} from 'lucide-react'
import { useStore } from '../lib/store.js'
import {
  portfolioKpis, budgetForProject, projectProgress, projectHealth, coverageStats, complianceStats,
  indicatorAchievement,
} from '../lib/compute.js'
import { PERIODS, C, CHART_COLORS } from '../lib/constants.js'
import { money, moneyShort, num, pct, clamp, fromNow } from '../lib/format.js'
import { Card, Kpi, Ring, Progress, Badge, SectionTitle, PageHeader, Avatar } from '../components/ui.jsx'
import { ChartBars, ChartLines, ChartDonut, Legendette } from '../components/charts.jsx'
import { t } from '../lib/i18n.js'

export default function Dashboard() {
  const state = useStore((s) => s)
  const nav = useNavigate()
  const { projects, programmes, budgetLines, indicators, sites, visits, audit, users, organization } = state

  const kpi = useMemo(() => portfolioKpis(state), [state])
  const cov = useMemo(() => coverageStats(sites, visits), [sites, visits])
  const comp = useMemo(() => complianceStats(visits), [visits])

  const budgetByProject = useMemo(() => projects
    .filter((p) => !['annule'].includes(p.status))
    .map((p) => {
      const b = budgetForProject(budgetLines, p.id)
      return { name: p.code, Prévu: b.planned, Dépensé: b.spent }
    }), [projects, budgetLines])

  const trend = useMemo(() => PERIODS.map((period) => {
    const arr = indicators.map((ind) => {
      const v = (ind.values || []).find((x) => x.period === period)
      if (!v || v.actual == null || !ind.target) return null
      return clamp((v.actual / ind.target) * 100)
    }).filter((x) => x != null)
    const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
    return { period: period.replace('2025-', ''), 'Taux d’atteinte': avg }
  }), [indicators])

  const budgetByProg = useMemo(() => programmes.map((pg, i) => {
    const val = projects.filter((p) => p.programmeId === pg.id)
      .reduce((n, p) => n + budgetForProject(budgetLines, p.id).planned, 0)
    return { name: pg.code, value: val, color: CHART_COLORS[i % CHART_COLORS.length] }
  }), [programmes, projects, budgetLines])

  const watchlist = useMemo(() => projects
    .filter((p) => p.status === 'en_cours')
    .map((p) => {
      const prog = projectProgress(state.activities, p.id)
      const b = budgetForProject(budgetLines, p.id)
      const h = projectHealth(p, prog, b)
      return { p, prog, health: h }
    })
    .filter((x) => x.health.tone !== 'ok')
    .sort((a, b) => a.prog - b.prog)
    .slice(0, 4), [projects, state.activities, budgetLines])

  const topIndicators = useMemo(() => indicators
    .map((ind) => ({ ind, ach: indicatorAchievement(ind) }))
    .filter((x) => x.ach != null)
    .sort((a, b) => b.ach - a.ach).slice(0, 5), [indicators])

  return (
    <div>
      <PageHeader icon={Gauge} title="Tableau de bord"
        subtitle={`${organization.name} · ${t("vue d'ensemble du portefeuille")}`} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Projets actifs" value={kpi.projectsActive} sub={`${t('sur')} ${kpi.projectsTotal} ${t('au total')}`} icon={Briefcase} tone="brand" />
        <Kpi label="Bénéficiaires atteints" value={num(kpi.beneficiariesReached)} sub={pct(kpi.beneficiaryRate)} icon={Users} tone="ok" />
        <Kpi label="Budget dépensé" value={moneyShort(kpi.budgetSpent)} sub={`${pct(kpi.budgetBurn)} ${t('du prévu')}`} icon={Wallet} tone="brand" />
        <Kpi label="Couverture suivi" value={pct(cov.coverage)} sub={`${t('cible')} ${cov.target} %`} icon={ClipboardCheck} tone={cov.coverage >= 80 ? 'ok' : cov.coverage >= 60 ? 'warn' : 'bad'} />
        <Kpi label="Conformité /100" value={comp.avg ?? '—'} sub={comp.band.label} icon={Target} tone={comp.avg >= 65 ? 'ok' : comp.avg >= 50 ? 'warn' : 'bad'} />
        <Kpi label="Atteinte indicateurs" value={kpi.avgAchievement != null ? pct(kpi.avgAchievement) : '—'} sub="moyenne pondérée" icon={TrendingUp} tone="brand" />
      </div>

      {/* Charts row 1 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Budget prévu vs dépensé — par projet</SectionTitle>
          <ChartBars data={budgetByProject} xKey="name" fmt={(v) => moneyShort(v)}
            series={[{ key: 'Prévu', label: t('Prévu'), color: C.brand }, { key: 'Dépensé', label: t('Dépensé'), color: C.ok }]} height={260} />
        </Card>
        <Card>
          <SectionTitle>Suivi & conformité</SectionTitle>
          <div className="flex items-center justify-around py-2">
            <div className="text-center">
              <Ring value={cov.coverage} tone={cov.coverage >= 80 ? 'ok' : 'warn'} sub={t('couverture')} />
              <div className="mt-2 text-xs text-ink-mute">{t('Sites suivis')} {cov.monitored}/{cov.required}</div>
            </div>
            <div className="text-center">
              <Ring value={comp.avg || 0} tone={comp.avg >= 65 ? 'ok' : comp.avg >= 50 ? 'warn' : 'bad'} label={comp.avg ?? '—'} sub="/100" />
              <div className="mt-2"><Badge tone={comp.band.tone || 'ink'} dot>{t(comp.band.label)}</Badge></div>
            </div>
          </div>
          {comp.urgent > 0 && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-bad-tint px-3 py-2 text-xs font-semibold text-bad">
              <AlertTriangle size={15} /> {comp.urgent} {t('site(s) en action urgente (score < 50)')}
            </div>
          )}
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Taux d’atteinte moyen des indicateurs</SectionTitle>
          <ChartLines data={trend} xKey="period" area fmt={(v) => `${v}%`}
            series={[{ key: 'Taux d’atteinte', label: t('Taux d’atteinte (%)'), color: C.brand }]} height={230} />
        </Card>
        <Card>
          <SectionTitle>Budget par programme</SectionTitle>
          <ChartDonut data={budgetByProg} centerSub={t('prévu total')} fmt={(v) => moneyShort(v)} height={200} />
          <div className="mt-2"><Legendette items={budgetByProg.map((d) => ({ label: d.name, color: d.color, value: moneyShort(d.value) }))} /></div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle action={<button onClick={() => nav('/projets')} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">{t('Tous les projets')} <ArrowRight size={13} /></button>}>
            Projets à surveiller
          </SectionTitle>
          {watchlist.length === 0 && <p className="py-6 text-center text-sm text-ink-mute">{t('Tous les projets actifs sont sur la bonne voie 👍')}</p>}
          <div className="space-y-2.5">
            {watchlist.map(({ p, prog, health }) => (
              <button key={p.id} onClick={() => nav(`/projets/${p.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-line-soft px-3 py-2.5 text-left transition hover:border-brand/40 hover:bg-surface-2">
                <span className={`h-9 w-1 flex-none rounded-full ${health.tone === 'bad' ? 'bg-bad' : 'bg-warn-dot'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                    <Badge tone={health.tone} dot>{health.label}</Badge>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress value={prog} tone={health.tone} className="max-w-[200px]" />
                    <span className="text-xs text-ink-mute tabnum">{prog}%</span>
                  </div>
                </div>
                <span className="hidden text-xs text-ink-mute sm:block">{p.code}</span>
              </button>
            ))}
          </div>

          <SectionTitle className="mt-5">Meilleurs indicateurs</SectionTitle>
          <div className="space-y-2">
            {topIndicators.map(({ ind, ach }) => (
              <div key={ind.id} className="flex items-center gap-3">
                <span className="w-16 flex-none font-mono text-xs text-ink-mute">{ind.code}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{ind.name}</span>
                <Progress value={ach} tone={ach >= 90 ? 'ok' : ach >= 65 ? 'warn' : 'bad'} className="max-w-[140px]" />
                <span className="w-12 flex-none text-right text-xs font-bold text-ink tabnum">{pct(ach)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>Activité récente</SectionTitle>
          <div className="space-y-3">
            {audit.slice(0, 8).map((a) => {
              const u = users.find((x) => x.id === a.userId)
              return (
                <div key={a.id} className="flex gap-2.5">
                  <Avatar name={u?.name} size={28} tone="ink" />
                  <div className="min-w-0">
                    <div className="text-sm text-ink-soft">{a.summary}</div>
                    <div className="text-[11px] text-ink-mute">{u?.name?.split(' ')[0]} · {fromNow(a.date)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
