// ============================================================================
// Visite guidée (spotlight) — met en évidence les zones clés de l'interface.
// Bilingue FR/EN. Se relance via le bouton « ? » de la barre haute.
// ============================================================================
import { useEffect, useLayoutEffect, useState } from 'react'
import { X, ArrowRight, ArrowLeft, Sparkles, Check } from 'lucide-react'
import { useTour } from '../lib/tour.js'
import { useLang } from '../lib/i18n.js'

// Étapes : `sel` cible un élément via data-tour ; sans `sel` = carte centrée.
const STEPS = [
  {
    center: true,
    title: { fr: 'Bienvenue dans MEMS', en: 'Welcome to MEMS' },
    body: {
      fr: "Votre espace de suivi & évaluation de projets humanitaires. Ce guide rapide présente l'essentiel en quelques étapes.",
      en: 'Your monitoring & evaluation workspace for humanitarian projects. This quick tour covers the essentials in a few steps.',
    },
  },
  {
    sel: '[data-tour="nav"]', placement: 'right',
    title: { fr: 'Navigation par thèmes', en: 'Themed navigation' },
    body: {
      fr: 'Toutes les fonctions sont regroupées en sections repliables : programmes & projets, mise en œuvre, suivi & évaluation, terrain, données & rapports, administration.',
      en: 'Everything is grouped into collapsible sections: programs & projects, implementation, monitoring & evaluation, field, data & reports, administration.',
    },
  },
  {
    sel: '[data-tour="create"]', placement: 'bottom',
    title: { fr: 'Créer en un clic', en: 'Create in one click' },
    body: {
      fr: "Le bouton « Créer » ouvre directement le formulaire d'un nouveau projet, programme, site, plan de suivi ou PDD.",
      en: 'The “Create” button opens the form for a new project, program, site, monitoring plan or PDD right away.',
    },
  },
  {
    sel: '[data-tour="search"]', placement: 'bottom',
    title: { fr: 'Rechercher partout', en: 'Search anything' },
    body: {
      fr: 'Tapez pour retrouver un projet, un site ou un indicateur. Astuce : ⌘K (ou Ctrl+K) ouvre la palette de commandes.',
      en: 'Type to find a project, site or indicator. Tip: ⌘K (or Ctrl+K) opens the command palette.',
    },
  },
  {
    center: true,
    title: { fr: 'Des tableaux puissants', en: 'Powerful tables' },
    body: {
      fr: "Dans les listes (projets, sites, indicateurs…) : triez en cliquant sur les en-têtes, agissez ligne par ligne (Ouvrir, Modifier, Supprimer), cochez plusieurs lignes pour un export Excel ou une suppression groupée — annulable d'un clic.",
      en: 'In lists (projects, sites, indicators…): sort by clicking headers, act row by row (Open, Edit, Delete), tick several rows for an Excel export or bulk delete — undoable in one click.',
    },
  },
  {
    sel: '[data-tour="theme"]', placement: 'bottom',
    title: { fr: 'Thème & langue', en: 'Theme & language' },
    body: {
      fr: 'Basculez entre thème clair et sombre, et entre français et anglais à tout moment.',
      en: 'Switch between light and dark theme, and between French and English at any time.',
    },
  },
  {
    center: true, icon: Check,
    title: { fr: "C'est parti !", en: 'You’re all set!' },
    body: {
      fr: 'Vous pourrez rouvrir ce guide à tout moment via le bouton « ? » en haut à droite.',
      en: 'You can reopen this tour anytime via the “?” button in the top-right.',
    },
  },
]

const PAD = 8
const TIP_W = 340

// Un rect est-il visible dans la fenêtre ? (sinon on bascule en carte centrée)
function visible(r) {
  return r && r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 &&
    r.left < window.innerWidth && r.top < window.innerHeight
}

export default function Tour() {
  const { open, stop } = useTour()
  const lang = useLang((s) => s.lang)
  const L = (o) => (lang === 'en' ? o.en : o.fr)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  useEffect(() => { if (open) setI(0) }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const el = step?.sel ? document.querySelector(step.sel) : null
      if (el) { try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) } catch { /* ignore */ } }
      const r = el ? el.getBoundingClientRect() : null
      setRect(visible(r) ? r : null)
    }
    measure()
    const id = setTimeout(measure, 260) // après le scroll fluide
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(id); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [open, i]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') stop()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); last ? stop() : setI((n) => n + 1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setI((n) => Math.max(0, n - 1)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, last, stop])

  if (!open) return null

  const box = rect ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null

  // Position de l'infobulle
  const vw = window.innerWidth, vh = window.innerHeight
  const clampL = (l) => Math.max(12, Math.min(l, vw - TIP_W - 12))
  let tip
  if (!box) {
    tip = { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }
  } else if (step.placement === 'right' && rect.right + TIP_W + 24 < vw) {
    tip = { left: rect.right + 16, top: Math.max(12, Math.min(rect.top, vh - 220)) }
  } else if (step.placement === 'top') {
    tip = { left: clampL(rect.left), bottom: vh - rect.top + 16 }
  } else { // bottom (défaut)
    tip = { left: clampL(rect.left), top: rect.bottom + 16 }
  }

  const Icon = step.icon || Sparkles

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Capteur de clics + voile (si pas de cible) */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {box ? (
        <div className="pointer-events-none absolute rounded-xl2 ring-2 ring-brand transition-all duration-200"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: '0 0 0 9999px rgba(3,41,61,.58)' }} />
      ) : (
        <div className="absolute inset-0 bg-brand-deep/60 backdrop-blur-[1px]" />
      )}

      {/* Infobulle */}
      <div className="absolute w-[340px] max-w-[calc(100vw-24px)] rounded-xl2 border border-line bg-surface p-4 shadow-pop" style={tip}>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-tint text-brand-d"><Icon size={17} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-ink">{L(step.title)}</h3>
          </div>
          <button onClick={stop} className="flex-none text-ink-mute transition hover:text-ink" title={lang === 'en' ? 'Close' : 'Fermer'}><X size={16} /></button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{L(step.body)}</p>

        <div className="mt-3.5 flex items-center gap-2">
          <div className="flex items-center gap-1">
            {STEPS.map((_, k) => (
              <span key={k} className={k === i ? 'h-1.5 w-4 rounded-full bg-brand' : 'h-1.5 w-1.5 rounded-full bg-line'} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {i > 0 && (
              <button onClick={() => setI((n) => n - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-surface-2">
                <ArrowLeft size={13} />{lang === 'en' ? 'Back' : 'Précédent'}
              </button>
            )}
            {!last ? (
              <button onClick={() => setI((n) => n + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-d">
                {lang === 'en' ? 'Next' : 'Suivant'}<ArrowRight size={13} />
              </button>
            ) : (
              <button onClick={stop}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-d">
                <Check size={13} />{lang === 'en' ? 'Done' : 'Terminer'}
              </button>
            )}
          </div>
        </div>
        {!last && (
          <button onClick={stop} className="mt-2 block w-full text-center text-[11px] font-medium text-ink-mute transition hover:text-ink">
            {lang === 'en' ? 'Skip the tour' : 'Passer la visite'}
          </button>
        )}
      </div>
    </div>
  )
}
