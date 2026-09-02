// ============================================================================
// Indicateurs (global) — vue portefeuille + accès à la saisie par projet
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, TrendingUp } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { indicatorAchievement, indicatorActual, achievementTone } from '../lib/compute.js'
import { INDICATOR_LEVEL } from '../lib/constants.js'
import { num, pct } from '../lib/format.js'
import { PageHeader, Select, Kpi, DataTable, Badge, Progress, RowActions } from '../components/ui.jsx'
import { IndicatorPanel } from './panels/Indicators.jsx'

const LEVEL_TONE = { impact: 'brand', outcome: 'ok', output: 'warn', process: 'ink' }

export default function Indicateurs() {
  const { indicators, projects } = useStore((s) => s)
  const nav = useNavigate()
  const [scope, setScope] = useState('all')

  const stats = useMemo(() => {
    const ach = indicators.map(indicatorAchievement).filter((x) => x != null)
    const avg = ach.length ? Math.round(ach.reduce((a, b) => a + b, 0) / ach.length) : null
    const onTrack = ach.filter((a) => a >= 90).length
    return { total: indicators.length, avg, onTrack, measured: ach.length }
  }, [indicators])

  return (
    <div>
      <PageHeader icon={Target} title="Indicateurs" subtitle="Cadre de mesure du portefeuille — référence, cible, réalisé"
        actions={
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-auto min-w-[220px]">
            <option value="all">Tous les projets</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        } />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Indicateurs suivis" value={stats.total} icon={Target} tone="brand" />
        <Kpi label="Atteinte moyenne" value={stats.avg != null ? pct(stats.avg) : '—'} icon={TrendingUp} tone={stats.avg >= 75 ? 'ok' : 'warn'} />
        <Kpi label="Cibles ≥ 90 %" value={stats.onTrack} sub={`sur ${stats.measured} mesurés`} tone="ok" />
        <Kpi label="Non encore mesurés" value={stats.total - stats.measured} tone="ink" />
      </div>

      {scope === 'all' ? (
        <DataTable
          empty="Aucun indicateur"
          onRowClick={(r) => nav(`/projets/${r.projectId}`)}
          rows={indicators}
          columns={[
            { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs font-bold text-brand-d">{r.code}</span> },
            { key: 'name', label: 'Indicateur', render: (r) => <div><div className="font-semibold text-ink">{r.name}</div><div className="text-[11px] text-ink-mute">{r.unit}</div></div> },
            { key: 'project', label: 'Projet', render: (r) => <span className="text-xs text-ink-mute">{byId(projects, r.projectId)?.code}</span> },
            { key: 'level', label: 'Niveau', render: (r) => <Badge tone={LEVEL_TONE[r.level]}>{INDICATOR_LEVEL[r.level]?.label}</Badge> },
            { key: 'target', label: 'Cible', align: 'right', render: (r) => <span className="tabnum font-semibold">{num(r.target)}</span> },
            { key: 'actual', label: 'Réalisé', align: 'right', render: (r) => <span className="tabnum">{num(indicatorActual(r))}</span> },
            { key: 'ach', label: 'Atteinte', width: 150, render: (r) => { const a = indicatorAchievement(r); return <div className="flex items-center gap-2"><Progress value={a} tone={achievementTone(a)} /><span className="w-11 text-right text-xs font-bold tabnum">{a == null ? '—' : pct(a)}</span></div> } },
            { key: 'act', label: '', width: 120, align: 'right', render: (r) => <RowActions onOpen={() => nav(`/projets/${r.projectId}`)} openLabel="Projet" /> },
          ]}
        />
      ) : (
        <IndicatorPanel projectId={scope} />
      )}
    </div>
  )
}
