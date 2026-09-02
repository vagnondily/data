// ============================================================================
// Palette de commandes (⌘K / Ctrl+K) — navigation rapide + recherche globale
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { NAV } from '../lib/constants.js'
import { useStore } from '../lib/store.js'
import { cx, Badge } from './ui.jsx'

const PAGES = NAV.flatMap((g) => g.items.map((it) => ({ label: it.label, sub: g.group, to: it.to, type: 'Page' })))

export default function CommandPalette({ open, onClose }) {
  const nav = useNavigate()
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const { projects, sites, indicators, planDocs } = useStore((s) => s)

  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    let list = PAGES.filter((p) => !t || p.label.toLowerCase().includes(t) || p.sub.toLowerCase().includes(t))
    if (t.length >= 1) {
      const add = (arr) => { list = list.concat(arr) }
      add(projects.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(t)).slice(0, 6).map((p) => ({ label: p.name, sub: p.code, to: `/projets/${p.id}`, type: 'Projet' })))
      add(sites.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 4).map((s) => ({ label: s.name, sub: s.district, to: '/sites', type: 'Site' })))
      add(indicators.filter((x) => `${x.name} ${x.code}`.toLowerCase().includes(t)).slice(0, 4).map((x) => ({ label: x.name, sub: x.code, to: '/indicateurs', type: 'Indicateur' })))
      add(planDocs.filter((d) => d.ref.toLowerCase().includes(t)).slice(0, 4).map((d) => ({ label: d.ref, sub: d.period, to: `${d.kind === 'pdd' ? '/pdd' : '/plan-suivi'}/${d.id}`, type: 'Document' })))
    }
    return list.slice(0, 12)
  }, [q, projects, sites, indicators, planDocs])

  useEffect(() => { if (i >= results.length) setI(0) }, [results, i])

  if (!open) return null
  const go = (r) => { if (r) { nav(r.to); onClose() } }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(n + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(n - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[i]) }
    else if (e.key === 'Escape') { onClose() }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-brand-deep/40 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl2 border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={17} className="text-ink-mute" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} onKeyDown={onKey}
            placeholder="Aller à… (page, projet, site, indicateur, document)"
            className="w-full bg-transparent py-3.5 text-sm text-ink outline-none placeholder:text-ink-mute" />
          <kbd className="hidden rounded border border-line bg-inset px-1.5 py-0.5 font-mono text-[10px] text-ink-mute sm:block">Échap</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-ink-mute">Aucun résultat</div>}
          {results.map((r, idx) => (
            <button key={idx} onMouseEnter={() => setI(idx)} onClick={() => go(r)}
              className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left', idx === i ? 'bg-brand-tint' : 'hover:bg-surface-2')}>
              <Badge tone={r.type === 'Page' ? 'ink' : r.type === 'Projet' ? 'brand' : 'ok'}>{r.type}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.label}</span>
              <span className="truncate text-xs text-ink-mute">{r.sub}</span>
              {idx === i && <CornerDownLeft size={14} className="flex-none text-brand" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
