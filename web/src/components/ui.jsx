// ============================================================================
// Kit d'interface MEMS — primitives réutilisables (charte WFP, style appli PM)
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, ChevronDown, Search, Inbox, Pencil, Trash2, ChevronRight, ChevronsUpDown, Copy } from 'lucide-react'
import { initials, clamp } from '../lib/format.js'

export const cx = (...a) => a.filter(Boolean).join(' ')

// ---- Tons (classes complètes, requis par Tailwind JIT) ---------------------
const BADGE = {
  brand: 'bg-brand-tint text-brand-d',
  ok: 'bg-ok-tint text-ok',
  warn: 'bg-warn-tint text-warn',
  bad: 'bg-bad-tint text-bad',
  ink: 'bg-inset text-ink-soft',
}
const BAR = {
  brand: 'bg-brand', ok: 'bg-ok-dot', warn: 'bg-warn-dot', bad: 'bg-bad', ink: 'bg-ink-mute',
}
const DOT = {
  brand: 'bg-brand', ok: 'bg-ok-dot', warn: 'bg-warn-dot', bad: 'bg-bad-dot', ink: 'bg-ink-mute',
}

// ---- Badge / Pill ----------------------------------------------------------
export function Badge({ tone = 'ink', children, dot = false, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', BADGE[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  )
}

export function StatusBadge({ map, value, dot = true }) {
  const s = map?.[value]
  if (!s) return <Badge tone="ink">{value || '—'}</Badge>
  return <Badge tone={s.tone} dot={dot}>{s.label}</Badge>
}

// ---- Card ------------------------------------------------------------------
export function Card({ className, children, pad = true, hover = false, ...rest }) {
  return (
    <div
      className={cx('rounded-xl2 border border-line bg-surface shadow-card', pad && 'p-5',
        hover && 'transition hover:shadow-lift hover:border-brand/40 cursor-pointer', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

// ---- KPI / StatTile --------------------------------------------------------
export function Kpi({ label, value, sub, icon: Icon, tone = 'brand', className }) {
  return (
    <Card className={cx('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <div className="whitespace-nowrap text-2xl font-extrabold leading-none text-ink tabnum">{value}</div>
        <div className="mt-1.5 text-xs font-medium text-ink-mute">{label}</div>
        {sub != null && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
      </div>
      {Icon && (
        <span className={cx('grid h-9 w-9 flex-none place-items-center rounded-lg', BADGE[tone])}>
          <Icon size={18} strokeWidth={2} />
        </span>
      )}
    </Card>
  )
}

// ---- Progress bar ----------------------------------------------------------
export function Progress({ value = 0, tone = 'brand', className, showValue = false, height = 'h-2' }) {
  const v = clamp(value)
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className={cx('relative w-full overflow-hidden rounded-full bg-inset', height)}>
        <div className={cx('absolute inset-y-0 left-0 rounded-full transition-all', BAR[tone])} style={{ width: `${v}%` }} />
      </div>
      {showValue && <span className="w-10 flex-none text-right text-xs font-semibold text-ink-soft tabnum">{Math.round(value)}%</span>}
    </div>
  )
}

// ---- Ring / jauge ----------------------------------------------------------
export function Ring({ value = 0, size = 92, stroke = 9, tone = 'brand', label, sub }) {
  const colors = { brand: '#007DBC', ok: '#689E18', warn: '#F7B825', bad: '#C5192D', ink: '#6F8798' }
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c - (clamp(value) / 100) * c
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EAF1F7" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors[tone]} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-lg font-extrabold text-ink tabnum leading-none">{label ?? `${Math.round(value)}%`}</div>
        {sub && <div className="text-[10px] text-ink-mute mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

// ---- Button ----------------------------------------------------------------
const BTN = {
  primary: 'bg-brand text-white hover:bg-brand-d shadow-card',
  outline: 'border border-line bg-surface text-ink-soft hover:bg-surface-2 hover:text-ink',
  ghost: 'text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger: 'bg-bad text-white hover:brightness-95',
  soft: 'bg-brand-tint text-brand-d hover:bg-brand-100',
}
export function Button({ variant = 'primary', size = 'md', icon: Icon, children, className, ...rest }) {
  const sizes = { sm: 'h-8 px-2.5 text-xs gap-1.5', md: 'h-9 px-3.5 text-sm gap-2', lg: 'h-11 px-5 text-sm gap-2' }
  return (
    <button
      className={cx('inline-flex items-center justify-center rounded-lg font-semibold transition disabled:opacity-50 disabled:pointer-events-none',
        BTN[variant], sizes[size], className)}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  )
}

export function IconButton({ icon: Icon, className, size = 18, ...rest }) {
  return (
    <button className={cx('grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition hover:bg-surface-2 hover:text-ink', className)} {...rest}>
      <Icon size={size} strokeWidth={2} />
    </button>
  )
}

// ---- Avatar ----------------------------------------------------------------
export function Avatar({ name, size = 34, tone = 'brand' }) {
  const bg = { brand: 'bg-brand text-white', ok: 'bg-ok-dot text-white', warn: 'bg-warn-dot text-brand-deep', ink: 'bg-brand-deep text-white' }
  return (
    <span className={cx('grid flex-none place-items-center rounded-full font-bold', bg[tone])}
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  )
}

// ---- Champs de formulaire ---------------------------------------------------
export function Field({ label, hint, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-ink-soft">
          {label}{required && <span className="text-bad">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  )
}
const INPUT = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition placeholder:text-ink-mute focus:border-brand focus:ring-2 focus:ring-brand/20'
export function Input({ className, ...rest }) { return <input className={cx(INPUT, className)} {...rest} /> }
export function Textarea({ className, ...rest }) { return <textarea className={cx(INPUT, 'min-h-[80px] resize-y', className)} {...rest} /> }
export function Select({ className, children, ...rest }) {
  return (
    <div className="relative">
      <select className={cx(INPUT, 'appearance-none pr-9', className)} {...rest}>{children}</select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute" />
    </div>
  )
}

// ---- Segmented control -----------------------------------------------------
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx('inline-flex rounded-lg border border-line bg-surface p-0.5', className)}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition',
            value === o.value ? 'bg-brand text-white shadow-card' : 'text-ink-soft hover:text-ink')}>
          {o.icon && <o.icon size={14} />}{o.label}
        </button>
      ))}
    </div>
  )
}

// ---- Tabs ------------------------------------------------------------------
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto no-scrollbar border-b border-line', className)}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={cx('relative whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition',
            value === t.value ? 'text-brand' : 'text-ink-mute hover:text-ink-soft')}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-inset px-1.5 py-0.5 text-[10px] text-ink-soft">{t.count}</span>}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
        </button>
      ))}
    </div>
  )
}

// ---- Page header -----------------------------------------------------------
export function PageHeader({ title, subtitle, icon: Icon, actions, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {Icon && <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-xl2 bg-brand-tint text-brand-d"><Icon size={20} /></span>}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-mute">{subtitle}</p>}
          {children}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function SectionTitle({ children, action, className }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-2', className)}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-soft">{children}</h3>
      {action}
    </div>
  )
}

// ---- Table -----------------------------------------------------------------
export function DataTable({ columns, rows, onRowClick, empty = 'Aucune donnée', keyField = 'id', className, dense = false }) {
  const [sort, setSort] = useState(null) // { key, dir }
  const sortableOf = (c) => c.sortable === false ? false
    : c.sortValue ? true
      : (rows.length ? ['string', 'number'].includes(typeof rows[0][c.key]) : false)
  const valueOf = (c, r) => (c.sortValue ? c.sortValue(r) : r[c.key])
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c && c.key === sort.key)
    if (!col) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = valueOf(col, a), vb = valueOf(col, b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'fr', { numeric: true }) * dir
    })
  }, [rows, sort, columns])
  const toggle = (c) => {
    if (!sortableOf(c)) return
    setSort((s) => (s && s.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }))
  }
  if (!rows.length) return <EmptyState title={empty} />
  return (
    <div className={cx('overflow-x-auto rounded-xl2 border border-line bg-surface shadow-card', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2">
            {columns.map((c) => {
              const sortable = sortableOf(c)
              const active = sort && sort.key === c.key
              return (
                <th key={c.key} onClick={sortable ? () => toggle(c) : undefined}
                  className={cx('px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-ink-soft',
                    c.align === 'right' && 'text-right', c.align === 'center' && 'text-center',
                    sortable && 'cursor-pointer select-none transition hover:text-ink')} style={c.width ? { width: c.width } : undefined}>
                  <span className={cx('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                    {c.label}
                    {sortable && (active
                      ? <span className="text-brand">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                      : <ChevronsUpDown size={11} className="text-ink-mute/40" />)}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r[keyField]} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx('border-b border-line-soft last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2')}>
              {columns.map((c) => (
                <td key={c.key} className={cx(dense ? 'px-3.5 py-2' : 'px-3.5 py-3', 'align-middle text-ink-soft',
                  c.align === 'right' && 'text-right tabnum', c.align === 'center' && 'text-center')}>
                  {c.render ? c.render(r) : (c.get ? c.get(r) : r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Actions de ligne (colonne de droite dans les tableaux) ----------------
export function RowActions({ onOpen, onEdit, onDelete, onDuplicate, openLabel = 'Ouvrir' }) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn?.() }
  return (
    <div className="flex items-center justify-end gap-1">
      {onDuplicate && (
        <button title="Dupliquer" onClick={stop(onDuplicate)}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute transition hover:bg-surface-2 hover:text-brand-d"><Copy size={15} /></button>
      )}
      {onEdit && (
        <button title="Modifier" onClick={stop(onEdit)}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute transition hover:bg-surface-2 hover:text-brand-d"><Pencil size={15} /></button>
      )}
      {onDelete && (
        <button title="Supprimer" onClick={stop(onDelete)}
          className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute transition hover:bg-bad-tint hover:text-bad"><Trash2 size={15} /></button>
      )}
      {onOpen && (
        <button onClick={stop(onOpen)}
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-semibold text-brand-d transition hover:border-brand/50 hover:bg-brand-tint">
          {openLabel}<ChevronRight size={14} />
        </button>
      )}
    </div>
  )
}

// ---- Empty state -----------------------------------------------------------
export function EmptyState({ title = 'Rien à afficher', hint, icon: Icon = Inbox, action }) {
  return (
    <div className="grid place-items-center rounded-xl2 border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-inset text-ink-mute"><Icon size={22} /></span>
      <p className="text-sm font-semibold text-ink-soft">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-mute">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---- Search input ----------------------------------------------------------
export function SearchInput({ value, onChange, placeholder = 'Rechercher…', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={cx(INPUT, 'pl-9')} />
    </div>
  )
}

// ---- Modal -----------------------------------------------------------------
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-deep/50 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('my-4 w-full rounded-xl2 border border-line bg-surface shadow-pop', w)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-mute">{subtitle}</p>}
          </div>
          <IconButton icon={X} onClick={onClose} className="-mr-2" />
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---- Confirmation ----------------------------------------------------------
export function useConfirm() {
  const [state, setState] = useState(null)
  const confirm = (opts) => new Promise((resolve) => setState({ ...opts, resolve }))
  const node = state ? (
    <Modal open onClose={() => { state.resolve(false); setState(null) }} title={state.title || 'Confirmer'} size="sm"
      footer={<>
        <Button variant="outline" onClick={() => { state.resolve(false); setState(null) }}>Annuler</Button>
        <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => { state.resolve(true); setState(null) }}>{state.confirmLabel || 'Confirmer'}</Button>
      </>}>
      <p className="text-sm text-ink-soft">{state.message}</p>
    </Modal>
  ) : null
  return { confirm, node }
}

// ---- Menu déroulant simple -------------------------------------------------
export function Dropdown({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className={cx('absolute z-40 mt-1 min-w-[200px] rounded-xl border border-line bg-surface p-1 shadow-pop',
          align === 'right' ? 'right-0' : 'left-0')} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
export function MenuItem({ icon: Icon, children, onClick, tone = 'ink' }) {
  return (
    <button onClick={onClick}
      className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition hover:bg-surface-2',
        tone === 'bad' ? 'text-bad' : 'text-ink-soft')}>
      {Icon && <Icon size={15} />}{children}
    </button>
  )
}
