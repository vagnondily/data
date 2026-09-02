// Pile de notifications (bas-droite) — feedback des actions
import { CheckCircle2, AlertTriangle, XCircle, Info, X, Undo2 } from 'lucide-react'
import { useToasts, notify } from '../lib/toast.js'
import { t } from '../lib/i18n.js'
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
      {items.map((n) => {
        const c = CFG[n.kind] || CFG.brand
        const I = c.icon
        const runUndo = () => { dismiss(n.id); try { n.undo() } catch { /* rien */ } notify(t('Suppression annulée'), { kind: 'ok', ttl: 2500 }) }
        return (
          <div key={n.id}
            className={cx('pointer-events-auto flex items-start gap-2.5 rounded-xl border border-l-4 border-line bg-surface px-3.5 py-3 shadow-pop', c.border)}
            style={{ animation: 'mems-toast-in .18s ease-out' }}>
            <I size={17} className={cx('mt-0.5 flex-none', c.text)} />
            <div className="min-w-0 flex-1 text-sm text-ink-soft">{n.message}</div>
            {n.undo && (
              <button onClick={runUndo}
                className="flex-none inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-brand-d transition hover:bg-brand-tint">
                <Undo2 size={13} />{t('Rétablir')}
              </button>
            )}
            <button onClick={() => dismiss(n.id)} className="flex-none text-ink-mute transition hover:text-ink"><X size={15} /></button>
          </div>
        )
      })}
    </div>
  )
}
