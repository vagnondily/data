// ============================================================================
// Panneau Indicateurs — cadre de mesure : référence, cible, réalisé, atteinte
// ============================================================================
import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, MoreVertical, Ruler, Library, Search, Check } from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { INDICATOR_LEVEL, POLARITY, PERIODS, C } from '../../lib/constants.js'
import { indicatorAchievement, indicatorActual, plannedToDate, achievementTone } from '../../lib/compute.js'
import { MASTERLIST } from '../../lib/masterlist.js'
import { num, pct } from '../../lib/format.js'
import { t } from '../../lib/i18n.js'
import {
  Badge, Button, Progress, Modal, Field, Input, Select, Textarea, RowActions,
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
          {
            key: 'act', label: '', width: 180, align: 'right',
            render: (r) => <RowActions onOpen={() => setEditVals(r)} openLabel="Saisie"
              onEdit={canEdit ? () => setEditDef(r) : undefined}
              onDelete={canEdit ? () => del(r) : undefined} />,
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
  const [picker, setPicker] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const applyStd = (m) => {
    setF((p) => ({ ...p, code: m.code, name: m.name, unit: m.unit, level: m.level, category: m.category, polarity: m.polarity, source: m.source || p.source }))
    setPicker(false)
  }
  const save = () => {
    const data = { ...f, baseline: Number(f.baseline) || 0, target: Number(f.target) || 0 }
    if (indicator.id) { update('indicators', indicator.id, data); log('modifie', 'indicateur', `Indicateur modifié : ${data.code}`) }
    else { add('indicators', { ...data, values: PERIODS.map((period) => ({ period, planned: 0, actual: null })) }); log('cree', 'indicateur', `Nouvel indicateur : ${data.code}`) }
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={indicator.id ? 'Modifier l’indicateur' : 'Nouvel indicateur'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={save} disabled={!f.name}>Enregistrer</Button></>}>
      {!indicator.id && (
        <div className="mb-4">
          <button type="button" onClick={() => setPicker((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-brand/40 bg-brand-tint/40 px-3 py-2 text-sm font-semibold text-brand-d transition hover:bg-brand-tint">
            <Library size={16} /> {t('Partir d’un indicateur standard (référentiel)')}
            <span className="ml-auto text-xs font-normal text-ink-mute">{MASTERLIST.length} {t('indicateurs')}</span>
          </button>
          {picker && <MasterlistBrowser onPick={applyStd} />}
        </div>
      )}
      <div className="form-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
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

// Navigateur du référentiel d'indicateurs standard (recherche + filtre niveau)
function MasterlistBrowser({ onPick }) {
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return MASTERLIST.filter((m) =>
      (!level || m.level === level)
      && (!needle || m.name.toLowerCase().includes(needle) || m.code.toLowerCase().includes(needle) || m.category.toLowerCase().includes(needle)))
  }, [q, level])
  // Regroupe par catégorie en conservant l'ordre
  const groups = []
  for (const m of rows) {
    let g = groups.find((x) => x.cat === m.category)
    if (!g) { g = { cat: m.category, items: [] }; groups.push(g) }
    g.items.push(m)
  }
  return (
    <div className="mt-2 rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="mb-2 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Rechercher un indicateur…')}
            className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-ink outline-none focus:border-brand" />
        </div>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-auto">
          <option value="">Tous les niveaux</option>
          {Object.entries(INDICATOR_LEVEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
      </div>
      <div className="max-h-72 overflow-y-auto pr-1">
        {groups.length === 0 ? (
          <div className="py-6 text-center text-sm text-ink-mute">{t('Aucun indicateur ne correspond.')}</div>
        ) : groups.map((g) => (
          <div key={g.cat} className="mb-2">
            <div className="sticky top-0 bg-surface-2/95 px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-ink-mute">{g.cat}</div>
            {g.items.map((m) => (
              <button key={m.code} type="button" onClick={() => onPick(m)}
                className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-brand-tint">
                <Badge tone={LEVEL_TONE[m.level]}>{INDICATOR_LEVEL[m.level]?.label}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{m.name}</span>
                  <span className="text-xs text-ink-mute">{m.code} · {m.unit}</span>
                </span>
                <Check size={16} className="mt-0.5 flex-none text-brand opacity-0 transition group-hover:opacity-100" />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
