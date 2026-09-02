// ============================================================================
// Coquille applicative — barre latérale + barre supérieure (style appli PM)
// ============================================================================
import { useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FolderKanban, Briefcase, ListChecks, CalendarRange, Target,
  Wallet, MapPin, ClipboardCheck, Users, Handshake, Upload, FileBarChart, UserCog,
  Settings, Menu, X, Bell, ChevronDown, Search, RefreshCw, Download, LogIn, Building2,
  CalendarCheck, ClipboardList, Boxes,
} from 'lucide-react'
import { NAV, ROLES } from '../lib/constants.js'
import { useStore } from '../lib/store.js'
import { exportJSON } from '../lib/export.js'
import { cx, Avatar, Badge, Dropdown, MenuItem, IconButton, useConfirm } from './ui.jsx'
import { fromNow } from '../lib/format.js'

const ICONS = {
  LayoutDashboard, FolderKanban, Briefcase, ListChecks, CalendarRange, Target,
  Wallet, MapPin, ClipboardCheck, Users, Handshake, Upload, FileBarChart, UserCog, Settings,
  CalendarCheck, ClipboardList, Boxes,
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const org = useStore((s) => s.organization)
  return (
    <div className="flex h-screen overflow-hidden bg-ground">
      {/* backdrop mobile */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-brand-deep/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <Sidebar org={org} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function Sidebar({ org, mobileOpen, onClose }) {
  return (
    <aside className={cx(
      'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-brand-deep text-white transition-transform lg:static lg:translate-x-0',
      mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
      {/* Logo / bandeau */}
      <div className="relative overflow-hidden px-5 pb-4 pt-5"
        style={{ background: 'radial-gradient(120% 140% at 88% -10%, rgba(0,125,188,.55), transparent 55%), linear-gradient(160deg,#03293d,#06405f 70%,#085387)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight">MEM<span className="text-[#54b6e6]">S</span></div>
            <div className="mt-0.5 text-[11px] font-medium text-[#a9d3ec]">Suivi &amp; Évaluation</div>
          </div>
          <IconButton icon={X} onClick={onClose} className="text-white hover:bg-white/10 lg:hidden" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-4">
        {NAV.map((grp) => (
          <div key={grp.group} className="mb-4">
            <div className="px-3 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6f97ad]">{grp.group}</div>
            <div className="space-y-0.5">
              {grp.items.map((it) => {
                const Icon = ICONS[it.icon] || LayoutDashboard
                return (
                  <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onClose}
                    className={({ isActive }) => cx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                      isActive ? 'bg-brand text-white shadow-card' : 'text-[#c9e3f3]/85 hover:bg-white/10 hover:text-white')}>
                    <Icon size={17} strokeWidth={2} />
                    <span>{it.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-[#a9d3ec]">
          <Building2 size={15} />
          <span className="truncate text-xs">{org.name}</span>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ onMenu }) {
  return (
    <header className="z-20 flex flex-none items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
      <IconButton icon={Menu} onClick={onMenu} className="lg:hidden" />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        <Notifications />
        <AccountMenu />
      </div>
    </header>
  )
}

function GlobalSearch() {
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
    <div className="relative w-full max-w-md">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un projet, un site, un indicateur…"
        className="w-full rounded-lg border border-line bg-inset py-2 pl-9 pr-3 text-sm outline-none transition placeholder:text-ink-mute focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/15" />
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
      <div className="px-2.5 py-2 text-xs font-bold uppercase tracking-wide text-ink-mute">Activité récente</div>
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
  const me = users.find((u) => u.id === currentUserId) || users[0]
  const role = ROLES[me?.role]

  const doReset = async () => {
    if (await confirm({ title: 'Réinitialiser la démonstration', message: 'Toutes les modifications locales seront remplacées par le jeu de données de démonstration. Continuer ?', confirmLabel: 'Réinitialiser', danger: true })) {
      resetDemo()
    }
  }
  return (
    <>
      {node}
      <Dropdown trigger={
        <button className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-surface-2">
          <Avatar name={me?.name} size={32} />
          <div className="hidden text-left sm:block">
            <div className="text-xs font-bold leading-tight text-ink">{me?.name}</div>
            <div className="text-[11px] leading-tight text-ink-mute">{role?.label}</div>
          </div>
          <ChevronDown size={15} className="text-ink-mute" />
        </button>}>
        <div className="px-2.5 py-2">
          <div className="text-sm font-bold text-ink">{me?.name}</div>
          <div className="text-xs text-ink-mute">{me?.email}</div>
          <div className="mt-1"><Badge tone={role?.color || 'ink'}>{role?.label}</Badge></div>
        </div>
        <div className="my-1 border-t border-line" />
        <div className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-mute">Se connecter en tant que (démo)</div>
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
