// ============================================================================
// Sites & carte — répertoire des sites d'intervention + cartographie Leaflet
// ============================================================================
import { useMemo, useState } from 'react'
import { MapPin, Plus, Map as MapIcon, Table2, Pencil, Trash2, MoreVertical, Download } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { exportRowsXlsx } from '../lib/docs.js'
import { REGIONS, SECURITY, SITE_STATUS } from '../lib/constants.js'
import { num } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import {
  PageHeader, Segmented, Select, Button, Card, Badge, StatusBadge, DataTable, SearchInput,
  Modal, Field, Input, RowActions, useConfirm, EmptyState,
} from '../components/ui.jsx'
import SiteMap from '../components/Map.jsx'
import { useOpenOnNew } from '../lib/hooks.js'

export default function Sites() {
  const { sites, projects, offices, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const [view, setView] = useState('map')
  const [colorBy, setColorBy] = useState('security')
  const [region, setRegion] = useState('')
  const [projectId, setProjectId] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()
  useOpenOnNew(() => setEditing({}), canEdit)

  const filtered = useMemo(() => sites.filter((s) => {
    if (region && s.pcode !== region) return false
    if (projectId && !(s.projectIds || []).includes(projectId)) return false
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [sites, region, projectId, q])

  const toneOf = (s) => colorBy === 'security' ? (SECURITY[s.security]?.tone || 'brand') : (SITE_STATUS[s.status]?.tone || 'brand')
  const mapped = filtered.map((s) => ({
    ...s, tone: toneOf(s), meta: `${s.district || ''}`,
    badge: colorBy === 'security' ? SECURITY[s.security]?.label : SITE_STATUS[s.status]?.label,
  }))

  const del = async (s) => {
    if (await confirm({ title: 'Supprimer le site', message: `Supprimer « ${s.name} » ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('sites', s.id); log('supprime', 'site', `Site supprimé : ${s.name}`)
    }
  }
  const bulkDelete = async (rows) => {
    if (await confirm({ title: 'Supprimer les sites', message: `Supprimer ${rows.length} site(s) ? Action annulable juste après.`, danger: true, confirmLabel: 'Supprimer' })) {
      rows.forEach((r) => remove('sites', r.id)); log('supprime', 'site', `${rows.length} site(s) supprimé(s)`)
    }
  }
  const EXPORT_COLS = [
    { label: 'Site', get: (r) => r.name }, { label: 'District', get: (r) => r.district },
    { label: 'Région', get: (r) => byId(REGIONS.map((x) => ({ id: x.pcode, ...x })), r.pcode)?.name || r.pcode || '' },
    { label: 'Projets', get: (r) => (r.projectIds || []).map((id) => byId(projects, id)?.code).filter(Boolean).join(', ') },
    { label: 'Population', get: (r) => r.population },
    { label: 'Sécurité', get: (r) => SECURITY[r.security]?.label || r.security },
    { label: 'Statut', get: (r) => SITE_STATUS[r.status]?.label || r.status },
  ]
  const bulkActions = [
    { key: 'export', label: 'Exporter la sélection', icon: Download, keepSelection: true,
      onClick: (rows) => exportRowsXlsx('sites-selection', rows, EXPORT_COLS) },
    canEdit && { key: 'del', label: 'Supprimer', icon: Trash2, tone: 'bad', keepSelection: true,
      onClick: (rows) => bulkDelete(rows) },
  ].filter(Boolean)

  return (
    <div>
      {node}
      <PageHeader icon={MapPin} title="Sites & carte" subtitle={`${sites.length} ${t("site(s) d'intervention")}`}
        actions={<>
          <Segmented value={view} onChange={setView} options={[{ value: 'map', label: 'Carte', icon: MapIcon }, { value: 'table', label: 'Liste', icon: Table2 }]} />
          {canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau site</Button>}
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Rechercher un site…" className="w-full sm:w-56" />
        <Select value={region} onChange={(e) => setRegion(e.target.value)} className="w-auto"><option value="">Toutes les régions</option>{REGIONS.map((r) => <option key={r.pcode} value={r.pcode}>{r.name}</option>)}</Select>
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto"><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select>
        {view === 'map' && (
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-mute">
            {t('Colorer par')}
            <Segmented value={colorBy} onChange={setColorBy} options={[{ value: 'security', label: 'Sécurité' }, { value: 'status', label: 'Statut' }]} />
          </div>
        )}
      </div>

      {filtered.length === 0 ? <EmptyState title="Aucun site" hint="Ajustez les filtres ou ajoutez un site." icon={MapPin} /> : view === 'map' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><SiteMap sites={mapped} height={520} /></div>
          <Card pad={false} className="max-h-[520px] overflow-y-auto">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-3 border-b border-line-soft px-4 py-3 last:border-0">
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${dotClass(toneOf(s))}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{s.name}</div>
                  <div className="text-xs text-ink-mute">{s.district} · {num(s.population)} hab.</div>
                </div>
                <Badge tone={SECURITY[s.security]?.tone || 'ink'}>{SECURITY[s.security]?.label}</Badge>
              </div>
            ))}
          </Card>
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={[
            { key: 'name', label: 'Site', render: (r) => <span className="font-semibold text-ink">{r.name}</span> },
            { key: 'region', label: 'Région', render: (r) => <span className="text-ink-soft">{r.district}</span> },
            { key: 'projects', label: 'Projets', render: (r) => <div className="flex flex-wrap gap-1">{(r.projectIds || []).map((id) => <Badge key={id} tone="ink">{byId(projects, id)?.code}</Badge>)}</div> },
            { key: 'pop', label: 'Population', align: 'right', render: (r) => <span className="tabnum">{num(r.population)}</span> },
            { key: 'security', label: 'Sécurité', render: (r) => <StatusBadge map={SECURITY} value={r.security} /> },
            { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={SITE_STATUS} value={r.status} dot={false} /> },
            canEdit && {
              key: 'act', label: '', width: 110, align: 'right',
              render: (r) => <RowActions onEdit={() => setEditing(r)} onDelete={() => del(r)} />,
            },
          ].filter(Boolean)}
        />
      )}

      {editing && <SiteModal site={editing} projects={projects} offices={offices} onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing.id) { update('sites', editing.id, data); log('modifie', 'site', `Site modifié : ${data.name}`) }
          else { add('sites', data); log('cree', 'site', `Nouveau site : ${data.name}`) }
          setEditing(null)
        }} />}
    </div>
  )
}

function dotClass(tone) { return { ok: 'bg-ok-dot', warn: 'bg-warn-dot', bad: 'bg-bad', brand: 'bg-brand', ink: 'bg-ink-mute' }[tone] || 'bg-brand' }

function SiteModal({ site, projects, offices, onClose, onSave }) {
  const [f, setF] = useState({
    name: '', pcode: REGIONS[0].pcode, district: REGIONS[0].name, commune: '', lat: REGIONS[0].lat, lng: REGIONS[0].lng,
    status: 'actif', security: 'vert', population: '', projectIds: [], officeId: offices[0]?.id || '', ...site,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const onRegion = (pcode) => { const r = byId(REGIONS.map((x) => ({ id: x.pcode, ...x })), pcode); set('pcode', pcode); setF((p) => ({ ...p, pcode, district: r.name, lat: p.lat || r.lat, lng: p.lng || r.lng })) }
  const toggleProject = (id) => set('projectIds', f.projectIds.includes(id) ? f.projectIds.filter((x) => x !== id) : [...f.projectIds, id])
  return (
    <Modal open onClose={onClose} size="lg" title={site.id ? 'Modifier le site' : 'Nouveau site'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave({ ...f, population: Number(f.population) || 0, lat: Number(f.lat), lng: Number(f.lng) })} disabled={!f.name}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nom du site" required className="col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Région"><Select value={f.pcode} onChange={(e) => onRegion(e.target.value)}>{REGIONS.map((r) => <option key={r.pcode} value={r.pcode}>{r.name}</option>)}</Select></Field>
        <Field label="Commune"><Input value={f.commune} onChange={(e) => set('commune', e.target.value)} /></Field>
        <Field label="Latitude"><Input type="number" step="0.0001" value={f.lat} onChange={(e) => set('lat', e.target.value)} /></Field>
        <Field label="Longitude"><Input type="number" step="0.0001" value={f.lng} onChange={(e) => set('lng', e.target.value)} /></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(SITE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Sécurité"><Select value={f.security} onChange={(e) => set('security', e.target.value)}>{Object.entries(SECURITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Population"><Input type="number" value={f.population} onChange={(e) => set('population', e.target.value)} /></Field>
        <Field label="Bureau"><Select value={f.officeId} onChange={(e) => set('officeId', e.target.value)}>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Projets rattachés" className="col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {projects.map((p) => (
              <button key={p.id} type="button" onClick={() => toggleProject(p.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${f.projectIds.includes(p.id) ? 'border-brand bg-brand-tint text-brand-d' : 'border-line text-ink-mute hover:border-brand/40'}`}>
                {p.code}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
