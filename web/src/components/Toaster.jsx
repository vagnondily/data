// Pile de notifications (bas-droite) — feedback des actions
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { useToasts } from '../lib/toast.js'
import { cx } from './ui.jsx'

const CFG = {
  ok: { icon: CheckCircle2, border: 'border-l-ok-dot', text: 'text-ok' },
  warn: { icon: AlertTriangle, border: 'border-l-warn-dot', text: 'text-warn' },
  bad: { icon: XCircle, border: 'border-l-bad', text: 'text-bad' },
  brand: { icon: Info, border: 'border-l-brand', text: 'text-brand-d' },
}

export default function Toaster() {
  const { items, dismiss } = useToasts()
  if (!items.length) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((t) => {
        const c = CFG[t.kind] || CFG.brand
        const I = c.icon
        return (
          <div key={t.id}
            className={cx('pointer-events-auto flex items-start gap-2.5 rounded-xl border border-l-4 border-line bg-surface px-3.5 py-3 shadow-pop', c.border)}
            style={{ animation: 'mems-toast-in .18s ease-out' }}>
            <I size={17} className={cx('mt-0.5 flex-none', c.text)} />
            <div className="min-w-0 flex-1 text-sm text-ink-soft">{t.message}</div>
            <button onClick={() => dismiss(t.id)} className="flex-none text-ink-mute transition hover:text-ink"><X size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}
