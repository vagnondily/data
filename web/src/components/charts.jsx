// ============================================================================
// Graphiques MEMS — habillage Recharts aux couleurs de la charte
// ============================================================================
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { C, CHART_COLORS } from '../lib/constants.js'
import { num } from '../lib/format.js'

const AXIS = { fontSize: 11, fill: C.inkMute }
const gridProps = { stroke: '#E6EEF4', vertical: false }

function TooltipBox({ active, payload, label, fmt = num }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label != null && <div className="mb-1 font-bold text-ink">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-ink-soft">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto font-semibold text-ink tabnum">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const legendStyle = { fontSize: 11, color: C.inkSoft }

export function ChartBars({ data, xKey, series, height = 240, stacked = false, fmt = num, layout = 'horizontal' }) {
  const vertical = layout === 'vertical'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 6, right: 8, left: vertical ? 8 : 0, bottom: 0 }} barCategoryGap={vertical ? '20%' : '28%'}>
        <CartesianGrid {...gridProps} horizontal={!vertical} vertical={vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={44} />
          </>
        )}
        <Tooltip content={<TooltipBox fmt={fmt} />} cursor={{ fill: 'rgba(0,125,188,.06)' }} />
        {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={vertical ? [0, 5, 5, 0] : [5, 5, 0, 0]}
            stackId={stacked ? 'a' : undefined} maxBarSize={vertical ? 20 : 46} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ChartLines({ data, xKey, series, height = 240, fmt = num, area = false }) {
  const Comp = area ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Comp data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: C.line }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={44} />
        <Tooltip content={<TooltipBox fmt={fmt} />} />
        {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
        {series.map((s) => (
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.4}
              fill={`url(#grad-${s.key})`} dot={false} activeDot={{ r: 4 }} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.4}
              dot={{ r: 2.5, fill: s.color }} activeDot={{ r: 4 }} />
          )
        ))}
      </Comp>
    </ResponsiveContainer>
  )
}

export function ChartDonut({ data, nameKey = 'name', valueKey = 'value', height = 240, colors = CHART_COLORS, centerLabel, centerSub, fmt = num }) {
  const total = data.reduce((n, d) => n + (d[valueKey] || 0), 0)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color || colors[i % colors.length]} />)}
          </Pie>
          <Tooltip content={<TooltipBox fmt={fmt} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel != null || centerSub) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ top: -8 }}>
          <div className="text-2xl font-extrabold text-ink tabnum">{centerLabel ?? num(total)}</div>
          {centerSub && <div className="text-xs text-ink-mute">{centerSub}</div>}
        </div>
      )}
    </div>
  )
}

export function Legendette({ items }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}{it.value != null && <b className="text-ink tabnum">{it.value}</b>}
        </span>
      ))}
    </div>
  )
}

export function Sparkline({ data, dataKey = 'v', color = C.brand, height = 34 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 3, right: 2, left: 2, bottom: 0 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
