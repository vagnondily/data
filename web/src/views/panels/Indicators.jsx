// ============================================================================
// Panneau Indicateurs — cadre de mesure : référence, cible, réalisé, atteinte
// ============================================================================
import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, MoreVertical, Ruler } from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { INDICATOR_LEVEL, POLARITY, PERIODS, C } from '../../lib/constants.js'
import { indicatorAchievement, indicatorActual, plannedToDate, achievementTone } from '../../lib/compute.js'
import { num, pct } from '../../lib/format.js'
import {
  Badge, Button, Progress, Modal, Field, Input, Select, Textarea, Dropdown, MenuItem,
  DataTable, useConfirm, EmptyState,
} from '../../components/ui.jsx'
import { ChartBars, Sparkline } from '../../components/charts.jsx'

const LEVEL_TONE = { impact: 'brand', outcome: 'ok', output: 'warn', process: 'ink' }

export function IndicatorPanel({ projectId, showAdd = true }) {
  const { indicators, results, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [editDef, setEditDef] = useState(null)
  const [editVals, setEditVals] = useState(null)
  const { confirm, node } = useConfirm()

  const inds = useMemo(() => indicators.filter((i) => i.projectId === projectId), [indicators, projectId])
  const projResults = results.filter((r) => r.projectId === projectId)

  const del = async (ind) => {
    if (await confirm({ title: 'Supprimer l’indicateur', message: `Supprimer « ${ind.name} » et ses valeurs ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('indicators', ind.id); log('supprime', 'indicateur', `Indicateur supprimé : ${ind.code}`)
    }
  }

  if (inds.length === 0 && !showAdd) return <EmptyState title="Aucun indicateur" />

  return (
    <div>
      {node}
      {showAdd && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-ink-mute">{inds.length} indicateur(s)</span>
          {canEdit && <Button size="sm" icon={Plus} onClick={() => setEditDef({ projectId })}>Ajouter un indicateur</Button>}
        </div>
      )}
      <DataTable
        empty="Aucun indicateur défini"
        onRowClick={(r) => setEditVals(r)}
        rows={inds}
        columns={[
          { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs font-bold text-brand-d">{r.code}</span> },
          { key: 'name', label: 'Indicateur', render: (r) => (<div><div className="font-semibold text-ink">{r.name}</div><div className="text-[11px] text-ink-mute">{r.unit}{r.category ? ` · ${r.category}` : ''}</div></div>) },
          { key: 'level', label: 'Niveau', render: (r) => <Badge tone={LEVEL_TONE[r.level]}>{INDICATOR_LEVEL[r.level]?.label}</Badge> },
          { key: 'baseline', label: 'Référence', align: 'right', render: (r) => <span className="tabnum text-ink-mute">{num(r.baseline)}</span> },
          { key: 'target', label: 'Cible', align: 'right', render: (r) => <span className="tabnum font-semibold">{num(r.target)}</span> },
          { key: 'actual', label: 'Réalisé', align: 'right', render: (r) => <span className="tabnum font-semibold text-ink">{num(indicatorActual(r))}</span> },
          {
            key: 'ach', label: 'Atteinte', width: 150, render: (r) => {
              const a = indicatorAchievement(r)
              return <div className="flex items-center gap-2"><Progress value={a} tone={achievementTone(a)} /><span className="w-11 text-right text-xs font-bold tabnum">{a == null ? '—' : pct(a)}</span></div>
            },
          },
          {
            key: 'trend', label: 'Tendance', width: 90, render: (r) => {
              const data = (r.values || []).filter((v) => v.actual != null).map((v) => ({ v: v.actual }))
              return data.length > 1 ? <Sparkline data={data} color={C.brand} /> : <span className="text-ink-mute">—</span>
            },
          },
          canEdit && {
            key: 'act', label: '', width: 40, render: (r) => (
              <Dropdown trigger={<button className="text-ink-mute hover:text-ink" onClick={(e) => e.stopPropagation()}><MoreVertical size={16} /></button>}>
                <MenuItem icon={Pencil} onClick={() => setEditDef(r)}>Modifier la définition</MenuItem>
                <MenuItem icon={Trash2} tone="bad" onClick={() => del(r)}>Supprimer</MenuItem>
              </Dropdown>
            ),
          },
        ].filter(Boolean)}
      />

      {editDef && <IndicatorModal indicator={editDef} results={projResults} onClose={() => setEditDef(null)} />}
      {editVals && <IndicatorValuesModal indicator={editVals} onClose={() => setEditVals(null)} canEdit={canEdit} />}
    </div>
  )
}

export function IndicatorModal({ indicator, results, onClose }) {
  const { add, update, log } = useStore((s) => s)
  const [f, setF] = useState({
    code: '', name: '', resultId: '', unit: 'personnes', level: 'output', polarity: 'positive',
    baseline: 0, target: '', category: '', source: '', frequency: 'Trimestrielle', values: [], ...indicator,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = () => {
    const data = { ...f, baseline: Number(f.baseline) || 0, target: Number(f.target) || 0 }
    if (indicator.id) { update('indicators', indicator.id, data); log('modifie', 'indicateur', `Indicateur modifié : ${data.code}`) }
    else { add('indicators', { ...data, values: PERIODS.map((period) => ({ period, planned: 0, actual: null })) }); log('cree', 'indicateur', `Nouvel indicateur : ${data.code}`) }
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={indicator.id ? 'Modifier l’indicateur' : 'Nouvel indicateur'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Code"><Input value={f.code} onChange={(e) => set('code', e.target.value)} placeholder="OUT-01" /></Field>
        <Field label="Niveau"><Select value={f.level} onChange={(e) => set('level', e.target.value)}>{Object.entries(INDICATOR_LEVEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Libellé de l’indicateur" required className="col-span-2"><Textarea value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Résultat rattaché" className="col-span-2"><Select value={f.resultId} onChange={(e) => set('resultId', e.target.value)}><option value="">—</option>{results.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.label}</option>)}</Select></Field>
        <Field label="Unité"><Input value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
        <Field label="Polarité"><Select value={f.polarity} onChange={(e) => set('polarity', e.target.value)}>{Object.entries(POLARITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Valeur de référence"><Input type="number" value={f.baseline} onChange={(e) => set('baseline', e.target.value)} /></Field>
        <Field label="Cible" required><Input type="number" value={f.target} onChange={(e) => set('target', e.target.value)} /></Field>
        <Field label="Catégorie"><Input value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
        <Field label="Source de vérification"><Input value={f.source} onChange={(e) => set('source', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function IndicatorValuesModal({ indicator, onClose, canEdit }) {
  const setIndicatorValue = useStore((s) => s.setIndicatorValue)
  const live = useStore((s) => s.indicators.find((i) => i.id === indicator.id)) || indicator
  const chartData = PERIODS.map((p) => {
    const v = (live.values || []).find((x) => x.period === p) || {}
    return { period: p.replace('2025-', ''), Prévu: v.planned || 0, Réalisé: v.actual || 0 }
  })
  return (
    <Modal open onClose={onClose} size="lg" title={`${live.code} — saisie prévu / réalisé`} subtitle={live.name}
      footer={<Button onClick={onClose}>Fermer</Button>}>
      <div className="mb-4 rounded-xl border border-line bg-surface-2/40 p-3">
        <ChartBars data={chartData} xKey="period" height={180}
          series={[{ key: 'Prévu', label: 'Prévu', color: C.brand }, { key: 'Réalisé', label: 'Réalisé', color: C.ok }]} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-xs uppercase text-ink-mute">
            <th className="py-2 text-left">Période</th><th className="py-2 text-right">Prévu ({live.unit})</th><th className="py-2 text-right">Réalisé ({live.unit})</th><th className="py-2 text-right">Atteinte</th>
          </tr></thead>
          <tbody>
            {PERIODS.map((p) => {
              const v = (live.values || []).find((x) => x.period === p) || { planned: 0, actual: null }
              const ach = live.target ? Math.round(((v.actual || 0) / live.target) * 100) : 0
              return (
                <tr key={p} className="border-b border-line-soft">
                  <td className="py-2 font-semibold text-ink">{p}</td>
                  <td className="py-2 text-right">
                    <input type="number" disabled={!canEdit} defaultValue={v.planned ?? ''} onBlur={(e) => setIndicatorValue(live.id, p, { planned: Number(e.target.value) || 0 })}
                      className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-right tabnum outline-none focus:border-brand disabled:bg-inset" />
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" disabled={!canEdit} defaultValue={v.actual ?? ''} placeholder="—" onBlur={(e) => setIndicatorValue(live.id, p, { actual: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-28 rounded-lg border border-line bg-surface px-2 py-1 text-right tabnum outline-none focus:border-brand disabled:bg-inset" />
                  </td>
                  <td className="py-2 text-right"><span className="font-semibold tabnum text-ink">{v.actual == null ? '—' : `${ach}%`}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {canEdit && <p className="mt-3 text-xs text-ink-mute">Les valeurs sont enregistrées automatiquement à la sortie du champ.</p>}
    </Modal>
  )
}
