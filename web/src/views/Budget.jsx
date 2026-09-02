// ============================================================================
// Budget (global) — vue portefeuille + détail par projet
// ============================================================================
import { useMemo, useState } from 'react'
import { Wallet } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { budgetByKey } from '../lib/compute.js'
import { C, CHART_COLORS } from '../lib/constants.js'
import { money, moneyShort, pct } from '../lib/format.js'
import { PageHeader, Select, Kpi, Card, SectionTitle, Progress, DataTable, Badge } from '../components/ui.jsx'
import { ChartBars, ChartDonut, Legendette } from '../components/charts.jsx'
import { BudgetPanel } from './panels/Budget.jsx'

export default function Budget() {
  const { budgetLines, projects, programmes, partners } = useStore((s) => s)
  const [scope, setScope] = useState('all')

  const totals = useMemo(() => ({
    planned: budgetLines.reduce((n, b) => n + b.planned, 0),
    committed: budgetLines.reduce((n, b) => n + b.committed, 0),
    spent: budgetLines.reduce((n, b) => n + b.spent, 0),
  }), [budgetLines])
  const burn = totals.planned ? (totals.spent / totals.planned) * 100 : 0

  const byProject = useMemo(() => projects.map((p) => {
    const lines = budgetLines.filter((b) => b.projectId === p.id)
    return { name: p.code, Prévu: lines.reduce((n, b) => n + b.planned, 0), Dépensé: lines.reduce((n, b) => n + b.spent, 0) }
  }).filter((x) => x.Prévu > 0), [projects, budgetLines])

  const byDonor = useMemo(() => budgetByKey(budgetLines, 'donorId').map((x, i) => ({
    name: byId(partners, x.key)?.acronym || '—', value: x.planned, color: CHART_COLORS[i % CHART_COLORS.length],
  })), [budgetLines, partners])

  return (
    <div>
      <PageHeader icon={Wallet} title="Budget" subtitle="Suivi financier prévu / engagé / dépensé"
        actions={
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-auto min-w-[220px]">
            <option value="all">Vue portefeuille</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        } />

      {scope !== 'all' ? <BudgetPanel projectId={scope} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Budget prévu" value={moneyShort(totals.planned)} tone="brand" icon={Wallet} />
            <Kpi label="Engagé" value={moneyShort(totals.committed)} sub={pct(totals.planned ? (totals.committed / totals.planned) * 100 : 0)} tone="warn" />
            <Kpi label="Dépensé" value={moneyShort(totals.spent)} sub={pct(burn)} tone="ok" />
            <Kpi label="Solde disponible" value={moneyShort(totals.planned - totals.spent)} tone="ink" />
          </div>

          <Card className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-ink-mute"><span>Consommation globale du portefeuille</span><span className="font-semibold tabnum">{pct(burn)} de {moneyShort(totals.planned)}</span></div>
            <Progress value={burn} tone={burn > 90 ? 'bad' : burn > 75 ? 'warn' : 'ok'} height="h-3" />
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <SectionTitle>Prévu vs dépensé — par projet</SectionTitle>
              <ChartBars data={byProject} xKey="name" fmt={(v) => moneyShort(v)}
                series={[{ key: 'Prévu', label: 'Prévu', color: C.brand }, { key: 'Dépensé', label: 'Dépensé', color: C.ok }]} height={280} />
            </Card>
            <Card>
              <SectionTitle>Répartition par bailleur</SectionTitle>
              <ChartDonut data={byDonor} centerSub="prévu" fmt={(v) => moneyShort(v)} height={210} />
              <div className="mt-2"><Legendette items={byDonor.map((d) => ({ label: d.name, color: d.color, value: moneyShort(d.value) }))} /></div>
            </Card>
          </div>

          <SectionTitle className="mt-6">Détail par projet</SectionTitle>
          <DataTable
            rows={projects.map((p) => {
              const lines = budgetLines.filter((b) => b.projectId === p.id)
              const planned = lines.reduce((n, b) => n + b.planned, 0)
              const spent = lines.reduce((n, b) => n + b.spent, 0)
              return { id: p.id, p, planned, spent, burn: planned ? (spent / planned) * 100 : 0, prog: byId(programmes, p.programmeId) }
            })}
            columns={[
              { key: 'code', label: 'Projet', render: (r) => <div><span className="font-mono text-xs font-bold text-brand-d">{r.p.code}</span><div className="text-sm font-semibold text-ink">{r.p.name}</div></div> },
              { key: 'prog', label: 'Programme', render: (r) => <Badge tone="ink">{r.prog?.code || '—'}</Badge> },
              { key: 'planned', label: 'Prévu', align: 'right', render: (r) => <span className="tabnum">{money(r.planned)}</span> },
              { key: 'spent', label: 'Dépensé', align: 'right', render: (r) => <span className="tabnum font-semibold">{money(r.spent)}</span> },
              { key: 'burn', label: 'Consommation', width: 160, render: (r) => <div className="flex items-center gap-2"><Progress value={r.burn} tone={r.burn > 90 ? 'bad' : r.burn > 75 ? 'warn' : 'ok'} /><span className="w-10 text-right text-xs tabnum">{pct(r.burn)}</span></div> },
            ]}
          />
        </>
      )}
    </div>
  )
}
