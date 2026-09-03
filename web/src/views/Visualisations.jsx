// ============================================================================
// Mes visualisations — constructeur de graphiques sur les données de l'app
// Choisir un jeu de données, une dimension, une mesure et un type de graphe,
// prévisualiser en direct, puis enregistrer des vues nommées (localStorage).
// ============================================================================
import { useMemo, useState, useEffect } from 'react'
import { BarChart3, Plus, Save, Download, Sparkles } from 'lucide-react'
import { useStore } from '../lib/store.js'
import { uid } from '../lib/id.js'
import { exportRowsXlsx } from '../lib/docs.js'
import { C, CHART_COLORS } from '../lib/constants.js'
import {
  DATASETS, DATASET_KEYS, CHART_TYPES, datasetOf, buildSeries, loadViz, saveViz, defaultCfg,
} from '../lib/viz.js'
import { t } from '../lib/i18n.js'
import { ChartBars, ChartLines, ChartDonut } from '../components/charts.jsx'
import {
  PageHeader, Card, Select, Button, Field, Input, EmptyState, RowActions, useConfirm, Badge,
} from '../components/ui.jsx'

// Rend le graphe adapté au type choisi à partir d'une série {name,value}.
function VizChart({ series, chart, height = 260 }) {
  if (series.empty) return <EmptyState title="Aucune donnée" hint="Ce croisement ne renvoie rien." icon={BarChart3} />
  const { data, fmt, measure, total } = series
  const one = [{ key: 'value', label: measure.label, color: C.brand }]
  if (chart === 'donut') {
    const colored = data.map((d, i) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }))
    return <ChartDonut data={colored} height={height} centerLabel={fmt(total)} centerSub={t(measure.label)} fmt={fmt} />
  }
  if (chart === 'line') return <ChartLines data={data} xKey="name" series={one} height={height} fmt={fmt} area />
  if (chart === 'bar') return <ChartBars data={data} xKey="name" series={one} height={height} fmt={fmt} layout="vertical" />
  return <ChartBars data={data} xKey="name" series={one} height={height} fmt={fmt} />
}

export default function Visualisations() {
  const store = useStore((s) => s)
  const [cfg, setCfg] = useState(defaultCfg())
  const [name, setName] = useState('')
  const [editId, setEditId] = useState(null)
  const [saved, setSaved] = useState(() => loadViz())
  const { confirm, node } = useConfirm()

  useEffect(() => { saveViz(saved) }, [saved])

  const ds = datasetOf(cfg.dataset)
  const series = useMemo(() => buildSeries(store, cfg), [store, cfg])

  // Changer de jeu de données réinitialise dimension & mesure sur des clés valides.
  const setDataset = (key) => {
    const nds = datasetOf(key)
    setCfg({ dataset: key, dim: nds.dimensions[0].key, measure: nds.measures[0].key, chart: cfg.chart })
  }
  const patch = (p) => setCfg((c) => ({ ...c, ...p }))

  const suggestName = () => `${t(ds.measures.find((m) => m.key === cfg.measure)?.label || '')} ${t('par')} ${t(ds.dimensions.find((d) => d.key === cfg.dim)?.label || '').toLowerCase()}`

  const save = () => {
    const label = (name || suggestName()).trim()
    if (editId) {
      setSaved((list) => list.map((v) => v.id === editId ? { ...v, name: label, cfg } : v))
    } else {
      setSaved((list) => [{ id: uid('viz'), name: label, cfg }, ...list])
    }
    setEditId(null); setName('')
  }
  const edit = (v) => { setCfg(v.cfg); setName(v.name); setEditId(v.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const del = async (v) => {
    if (await confirm({ title: 'Supprimer la visualisation', message: `Supprimer « ${v.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      setSaved((list) => list.filter((x) => x.id !== v.id))
      if (editId === v.id) { setEditId(null); setName('') }
    }
  }
  const exportViz = (s, label) => {
    exportRowsXlsx(label || 'visualisation', s.data, [
      { label: s.dim.label, get: (r) => r.name },
      { label: s.measure.label, get: (r) => r.value },
    ])
  }

  return (
    <div>
      {node}
      <PageHeader icon={BarChart3} title="Mes visualisations"
        subtitle={t('Composez vos propres graphiques à partir des données de la plateforme.')} />

      {/* Constructeur */}
      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Sparkles size={15} className="text-brand" /> {editId ? t('Modifier la visualisation') : t('Nouvelle visualisation')}</div>
            <div className="form-grid grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Jeu de données" className="col-span-2">
                <Select value={cfg.dataset} onChange={(e) => setDataset(e.target.value)}>
                  {DATASET_KEYS.map((k) => <option key={k} value={k}>{DATASETS[k].label}</option>)}
                </Select>
              </Field>
              <Field label="Dimension (regrouper par)">
                <Select value={cfg.dim} onChange={(e) => patch({ dim: e.target.value })}>
                  {ds.dimensions.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </Select>
              </Field>
              <Field label="Mesure">
                <Select value={cfg.measure} onChange={(e) => patch({ measure: e.target.value })}>
                  {ds.measures.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </Select>
              </Field>
              <Field label="Type de graphique" className="col-span-2">
                <Select value={cfg.chart} onChange={(e) => patch({ chart: e.target.value })}>
                  {CHART_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
              </Field>
              <Field label="Nom de la visualisation" className="col-span-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestName()} />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button icon={editId ? Save : Plus} onClick={save}>{editId ? 'Enregistrer' : 'Ajouter à mes visualisations'}</Button>
              {editId && <Button variant="outline" onClick={() => { setEditId(null); setName(''); setCfg(defaultCfg()) }}>Annuler</Button>}
              <Button variant="ghost" icon={Download} onClick={() => exportViz(series, name || suggestName())}>Exporter</Button>
            </div>
          </div>

          {/* Aperçu en direct */}
          <div className="min-w-0 rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">{name || suggestName()}</div>
              <Badge tone="ink">{series.data.length} {t('éléments')}</Badge>
            </div>
            <VizChart series={series} chart={cfg.chart} />
          </div>
        </div>
      </Card>

      {/* Galerie des visualisations enregistrées */}
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-soft">
        {t('Visualisations enregistrées')} <span className="rounded-full bg-inset px-2 py-0.5 text-xs text-ink-mute">{saved.length}</span>
      </div>
      {saved.length === 0 ? (
        <EmptyState title="Aucune visualisation enregistrée" hint="Composez un graphique ci-dessus puis « Ajouter à mes visualisations »." icon={BarChart3} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {saved.map((v) => <SavedCard key={v.id} viz={v} onEdit={() => edit(v)} onDelete={() => del(v)} onExport={(s) => exportViz(s, v.name)} />)}
        </div>
      )}
    </div>
  )
}

function SavedCard({ viz, onEdit, onDelete, onExport }) {
  const store = useStore((s) => s)
  const series = useMemo(() => buildSeries(store, viz.cfg), [store, viz.cfg])
  const ds = datasetOf(viz.cfg.dataset)
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink">{viz.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <Badge tone="brand">{ds.label}</Badge>
            <Badge tone="ink">{CHART_TYPES.find((c) => c.key === viz.cfg.chart)?.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button title={t('Exporter (Excel)')} onClick={() => onExport(series)}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute transition hover:bg-surface-2 hover:text-brand-d"><Download size={15} /></button>
          <RowActions onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
      <VizChart series={series} chart={viz.cfg.chart} height={220} />
    </Card>
  )
}
