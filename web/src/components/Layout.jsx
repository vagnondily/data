// ============================================================================
// Coquille applicative — barre latérale en accordéon (repliable) + barre haute
// Raccourcis : ⌘K / Ctrl+K (palette), « / » (recherche). Bouton « + Créer » global.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderKanban, Briefcase, ListChecks, CalendarRange, Target,
  Wallet, MapPin, ClipboardCheck, Users, Handshake, Upload, FileBarChart, UserCog,
  Settings, Menu, X, Bell, ChevronDown, ChevronRight, Search, RefreshCw, Download, LogIn, Building2,
  CalendarCheck, ClipboardList, Boxes, PanelLeftClose, PanelLeftOpen, Plus, Sun, Moon, HelpCircle,
} from 'lucide-react'
import { NAV, NAV_LEAVES, ROLES } from '../lib/constants.js'
import { useStore } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { exportJSON } from '../lib/export.js'
import { cx, Avatar, Badge, Dropdown, MenuItem, IconButton, useConfirm } from './ui.jsx'
import { fromNow } from '../lib/format.js'
import { t, useLang } from '../lib/i18n.js'
import { useTheme } from '../lib/theme.js'
import { useTour, TOUR_SEEN_KEY } from '../lib/tour.js'
import Toaster from './Toaster.jsx'
import Tour from './Tour.jsx'
import CommandPalette from './CommandPalette.jsx'

const ICONS = {
  LayoutDashboard, FolderKanban, Briefcase, ListChecks, CalendarRange, Target,
  Wallet, MapPin, ClipboardCheck, Users, Handshake, Upload, FileBarChart, UserCog, Settings,
  CalendarCheck, ClipboardList, Boxes,
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('mems-collapsed') === '1' } catch { return false } })
  const org = useStore((s) => s.organization)
  const lang = useLang((s) => s.lang)
  const theme = useTheme((s) => s.theme)
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('mems-collapsed', n ? '1' : '0') } catch { /* ignore */ } return n })

  const startTour = useTour((s) => s.start)

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])

  // Visite guidée au premier lancement (une seule fois).
  useEffect(() => {
    let seen = true
    try { seen = localStorage.getItem(TOUR_SEEN_KEY) === '1' } catch { /* ignore */ }
    if (seen) return
    const id = setTimeout(() => {
      try { localStorage.setItem(TOUR_SEEN_KEY, '1') } catch { /* ignore */ }
      startTour()
    }, 700)
    return () => clearTimeout(id)
  }, [startTour])

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      const typing = /input|textarea|select/i.test(el?.tagName || '') || el?.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setPaletteOpen((o) => !o) }
      else if (e.key === '/' && !typing && !paletteOpen) { e.preventDefault(); document.getElementById('global-search')?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

  return (
    <div key={lang} className="flex h-screen overflow-hidden bg-ground">
      {mobileOpen && <div className="fixed inset-0 z-30 bg-brand-deep/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <Sidebar org={org} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} onPalette={() => setPaletteOpen(true)} />
        <main data-tour="content" className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-7"><Outlet /></div>
        </main>
      </div>
      <Toaster />
      <Tour />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

const matchTo = (to, pathname) => (to === '/' ? pathname === '/' : (pathname === to || pathname.startsWith(to + '/')))

function Sidebar({ org, mobileOpen, onClose, collapsed, onToggleCollapse }) {
  const { pathname } = useLocation()
  const activeIdx = NAV.findIndex((s) => (s.items ? s.items.some((it) => matchTo(it.to, pathname)) : matchTo(s.to, pathname)))
  const [open, setOpen] = useState(() => new Set())
  const toggle = (i) => setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const itemCls = ({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-brand text-white shadow-card' : 'text-[#c9e3f3]/85 hover:bg-white/10 hover:text-white')

  return (
    <aside data-tour="nav" className={cx(
      'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-deep text-white transition-all lg:static lg:translate-x-0',
      collapsed && 'lg:w-16', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
      {/* Logo */}
      <div className="relative overflow-hidden px-5 pb-4 pt-5"
        style={{ background: 'radial-gradient(120% 140% at 88% -10%, rgba(0,125,188,.55), transparent 55%), linear-gradient(160deg,#03293d,#06405f 70%,#085387)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className={cx('font-display text-2xl font-extrabold tracking-tight', collapsed && 'lg:hidden')}>MEM<span className="text-[#54b6e6]">S</span></div>
            <div className={cx('mt-0.5 text-[11px] font-medium text-[#a9d3ec]', collapsed && 'lg:hidden')}>{t('Suivi & Évaluation')}</div>
            {collapsed && <div className="hidden font-display text-2xl font-extrabold lg:block">M<span className="text-[#54b6e6]">S</span></div>}
          </div>
          <IconButton icon={X} onClick={onClose} className="text-white hover:bg-white/10 lg:hidden" />
        </div>
      </div>

      {/* Accordéon (mobile + desktop déplié) */}
      <nav className={cx('flex-1 space-y-1 overflow-y-auto no-scrollbar px-3 py-4', collapsed && 'lg:hidden')}>
        {NAV.map((s, i) => {
          const Icon = ICONS[s.icon] || LayoutDashboard
          if (!s.items) {
            return (
              <NavLink key={s.to} to={s.to} end={s.to === '/'} onClick={onClose} className={itemCls}>
                <Icon size={17} strokeWidth={2} className="flex-none" /><span>{t(s.label)}</span>
              </NavLink>
            )
          }
          const isOpen = open.has(i) || i === activeIdx
          return (
            <div key={s.label}>
              <button onClick={() => toggle(i)}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  i === activeIdx ? 'text-white' : 'text-[#c9e3f3]/90 hover:bg-white/10 hover:text-white')}>
                <Icon size={17} strokeWidth={2} className="flex-none" />
                <span className="flex-1 text-left">{t(s.label)}</span>
                <ChevronRight size={15} className={cx('flex-none text-[#6f97ad] transition-transform', isOpen && 'rotate-90')} />
              </button>
              {isOpen && (
                <div className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                  {s.items.map((it) => {
                    const SubIcon = ICONS[it.icon] || Briefcase
                    return (
                      <NavLink key={it.to} to={it.to} onClick={onClose} className={itemCls}>
                        <SubIcon size={16} strokeWidth={2} className="flex-none" /><span>{t(it.label)}</span>
                      </NavLink>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Rail d'icônes (desktop replié) */}
      <nav className={cx('hidden flex-1 space-y-1 overflow-y-auto no-scrollbar px-2 py-4', collapsed && 'lg:block')}>
        {NAV_LEAVES.map((it) => {
          const Icon = ICONS[it.icon] || Briefcase
          return (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} title={t(it.label)}
              className={({ isActive }) => cx('flex items-center justify-center rounded-lg py-2.5 transition',
                isActive ? 'bg-brand text-white shadow-card' : 'text-[#c9e3f3]/85 hover:bg-white/10 hover:text-white')}>
              <Icon size={18} strokeWidth={2} />
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-2">
        <button onClick={onToggleCollapse} title={collapsed ? 'Déplier' : 'Replier'}
          className={cx('hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#a9d3ec] transition hover:bg-white/10 hover:text-white lg:flex', collapsed && 'lg:justify-center lg:px-0')}>
          {collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span>{t('Replier le menu')}</span></>}
        </button>
        <div className={cx('flex items-center gap-2 px-1.5 py-1 text-[#a9d3ec]', collapsed && 'lg:hidden')}>
          <Building2 size={15} className="flex-none" /><span className="truncate text-xs">{org.name}</span>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ onMenu, onPalette }) {
  return (
    <header className="z-20 flex flex-none items-center gap-2 border-b border-line bg-surface px-4 py-2.5 sm:gap-3 sm:px-6">
      <IconButton icon={Menu} onClick={onMenu} className="lg:hidden" />
      <GlobalSearch onPalette={onPalette} />
      <div className="ml-auto flex items-center gap-1.5">
        <div data-tour="theme" className="flex items-center gap-1.5">
          <LangToggle />
          <ThemeToggle />
        </div>
        <HelpButton />
        <QuickCreate />
        <Notifications />
        <AccountMenu />
      </div>
    </header>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return <IconButton icon={theme === 'dark' ? Sun : Moon} onClick={toggle} title={theme === 'dark' ? t('Thème clair') : t('Thème sombre')} />
}

function HelpButton() {
  const start = useTour((s) => s.start)
  return <IconButton icon={HelpCircle} onClick={start} title={t('Aide — visite guidée')} />
}

function LangToggle() {
  const { lang, setLang } = useLang()
  return (
    <div className="hidden items-center rounded-lg border border-line bg-inset p-0.5 sm:flex">
      {['fr', 'en'].map((l) => (
        <button key={l} onClick={() => setLang(l)}
          className={cx('rounded px-2 py-1 text-[11px] font-bold uppercase transition', lang === l ? 'bg-brand text-white shadow-card' : 'text-ink-mute hover:text-ink')}>{l}</button>
      ))}
    </div>
  )
}

function QuickCreate() {
  const { canEdit } = useCan()
  const nav = useNavigate()
  if (!canEdit) return null
  return (
    <Dropdown trigger={
      <button data-tour="create" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-d">
        <Plus size={16} strokeWidth={2.4} /><span className="hidden sm:inline">{t('Créer')}</span>
      </button>}>
      <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{t('Créer…')}</div>
      <MenuItem icon={Briefcase} onClick={() => nav('/projets?new=1')}>Nouveau projet</MenuItem>
      <MenuItem icon={FolderKanban} onClick={() => nav('/programmes?new=1')}>Nouveau programme</MenuItem>
      <MenuItem icon={MapPin} onClick={() => nav('/sites?new=1')}>Nouveau site</MenuItem>
      <MenuItem icon={CalendarCheck} onClick={() => nav('/plan-suivi?new=1')}>Nouveau plan de suivi</MenuItem>
      <MenuItem icon={Boxes} onClick={() => nav('/pdd?new=1')}>Nouveau PDD</MenuItem>
    </Dropdown>
  )
}

function GlobalSearch({ onPalette }) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const { projects, sites, indicators } = useStore((s) => ({ projects: s.projects, sites: s.sites, indicators: s.indicators }))
  const results = useMemo(() => {
    if (q.trim().length < 2) return []
    const t = q.toLowerCase()
    const r = []
    projects.filter((p) => p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t))
      .slice(0, 4).forEach((p) => r.push({ type: 'Projet', label: p.name, to: `/projets/${p.id}` }))
    sites.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 3).forEach((s) => r.push({ type: 'Site', label: s.name, to: '/sites' }))
    indicators.filter((i) => i.name.toLowerCase().includes(t)).slice(0, 3).forEach((i) => r.push({ type: 'Indicateur', label: i.name, to: '/indicateurs' }))
    return r
  }, [q, projects, sites, indicators])

  return (
    <div data-tour="search" className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input id="global-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Rechercher…')}
        className="w-full rounded-lg border border-line bg-inset py-2 pl-9 pr-14 text-sm outline-none transition placeholder:text-ink-mute focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15" />
      <button onClick={onPalette} title="Palette de commandes (⌘K)" className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-mute transition hover:border-brand hover:text-brand-d sm:block">⌘K</button>
      {results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop">
          {results.map((r, i) => (
            <button key={i} onMouseDown={() => { nav(r.to); setQ('') }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2">
              <Badge tone="ink" className="text-[10px]">{r.type}</Badge>
              <span className="truncate text-ink-soft">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const audit = useStore((s) => s.audit)
  const recent = audit.slice(0, 6)
  return (
    <Dropdown trigger={
      <button className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-soft transition hover:bg-surface-2 hover:text-ink">
        <Bell size={18} />
        {recent.length > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-bad" />}
      </button>}>
      <div className="px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-ink-mute">{t('Activité récente')}</div>
      {recent.map((a) => (
        <div key={a.id} className="rounded-lg px-2.5 py-2 hover:bg-surface-2">
          <div className="text-sm text-ink-soft">{a.summary}</div>
          <div className="mt-0.5 text-[11px] text-ink-mute">{fromNow(a.date)}</div>
        </div>
      ))}
    </Dropdown>
  )
}

function AccountMenu() {
  const { users, currentUserId, setCurrentUser, resetDemo, exportState } = useStore((s) => ({
    users: s.users, currentUserId: s.currentUserId, setCurrentUser: s.setCurrentUser,
    resetDemo: s.resetDemo, exportState: s.exportState,
  }))
  const nav = useNavigate()
  const { confirm, node } = useConfirm()
  const { lang, setLang } = useLang()
  const me = users.find((u) => u.id === currentUserId) || users[0]
  const role = ROLES[me?.role]

  const doReset = async () => {
    if (await confirm({ title: 'Réinitialiser la démonstration', message: 'Toutes les modifications locales seront remplacées par le jeu de données de démonstration. Continuer ?', confirmLabel: 'Réinitialiser', danger: true })) resetDemo()
  }
  return (
    <>
      {node}
      <Dropdown trigger={
        <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-surface-2">
          <Avatar name={me?.name} size={32} />
          <div className="hidden text-left sm:block">
            <div className="text-xs font-bold leading-tight text-ink">{me?.name}</div>
            <div className="text-[11px] leading-tight text-ink-mute">{t(role?.label)}</div>
          </div>
          <ChevronDown size={15} className="text-ink-mute" />
        </button>}>
        <div className="px-2.5 py-2">
          <div className="text-sm font-bold text-ink">{me?.name}</div>
          <div className="text-xs text-ink-mute">{me?.email}</div>
          <div className="mt-1"><Badge tone={role?.color || 'ink'}>{t(role?.label)}</Badge></div>
        </div>
        {/* Langue — accessible sur mobile (la bascule de la barre haute est masquée < sm) */}
        <div className="flex items-center justify-between px-2.5 py-1.5 sm:hidden">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">{t('Langue')}</span>
          <div className="flex items-center rounded-lg border border-line bg-inset p-0.5">
            {['fr', 'en'].map((l) => (
              <button key={l} onClick={() => setLang(l)}
                className={cx('rounded px-2.5 py-1 text-[11px] font-bold uppercase transition', lang === l ? 'bg-brand text-white shadow-card' : 'text-ink-mute hover:text-ink')}>{l}</button>
            ))}
          </div>
        </div>
        <div className="my-1 border-t border-line" />
        <div className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-mute">{t('Se connecter en tant que (démo)')}</div>
        {users.map((u) => (
          <MenuItem key={u.id} icon={u.id === currentUserId ? LogIn : undefined} onClick={() => setCurrentUser(u.id)}>
            <span className={cx(u.id === currentUserId && 'font-bold text-brand-d')}>{u.name}</span>
            <span className="ml-auto text-[10px] text-ink-mute">{ROLES[u.role]?.label}</span>
          </MenuItem>
        ))}
        <div className="my-1 border-t border-line" />
        <MenuItem icon={Settings} onClick={() => nav('/parametres')}>Paramètres</MenuItem>
        <MenuItem icon={Download} onClick={() => exportJSON(`mems-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, exportState())}>Sauvegarde (JSON)</MenuItem>
        <MenuItem icon={RefreshCw} tone="bad" onClick={doReset}>Réinitialiser la démo</MenuItem>
      </Dropdown>
    </>
  )
}
