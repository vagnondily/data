// Formatage : dates, monnaie, nombres, pourcentages (locale selon la langue)
import { useLang } from './i18n.js'
const NF = new Intl.NumberFormat('fr-FR')
const NF1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export function num(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return NF.format(Math.round(n))
}
export function num1(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return NF1.format(n)
}
export function money(n, currency = 'USD') {
  if (n == null || Number.isNaN(n)) return '—'
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${NF.format(Math.round(n))} ${currency}`
  }
}
export function moneyShort(n, currency = 'USD') {
  if (n == null || Number.isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  if (abs >= 1e6) return `${sym}${NF1.format(n / 1e6)} M`
  if (abs >= 1e3) return `${sym}${NF1.format(n / 1e3)} k`
  return `${sym}${NF.format(n)}`
}
export function pct(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(digits)} %`
}

// Locale courante (dérivée de la langue de l'interface).
const locale = () => (useLang.getState().lang === 'en' ? 'en-GB' : 'fr-FR')

export function fmtDate(d) {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' })
}
export function fmtDateShort(d) {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' })
}
export function fromNow(d) {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - dt.getTime()
  const day = 86400000
  const en = useLang.getState().lang === 'en'
  if (diff < 3600000) { const n = Math.max(1, Math.round(diff / 60000)); return en ? `${n} min ago` : `il y a ${n} min` }
  if (diff < day) { const n = Math.round(diff / 3600000); return en ? `${n} h ago` : `il y a ${n} h` }
  if (diff < 7 * day) { const n = Math.round(diff / day); return en ? `${n} d ago` : `il y a ${n} j` }
  return fmtDate(dt)
}
export function daysBetween(a, b) {
  const da = new Date(a).getTime(), db = new Date(b).getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return 0
  return Math.round((db - da) / 86400000)
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')
}
export function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}
