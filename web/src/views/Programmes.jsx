// ============================================================================
// Programmes / portefeuilles — liste (tableau) avec actions de ligne
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Download, Trash2 } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { budgetForProject } from '../lib/compute.js'
import { exportRowsXlsx } from '../lib/docs.js'
import { useOpenOnNew } from '../lib/hooks.js'
import { PROGRAMME_STATUS } from '../lib/constants.js'
import { moneyShort, pct } from '../lib/format.js'
import {
  Badge, Button, PageHeader, Progress, StatusBadge, DataTable, RowActions, useConfirm, EmptyState,
} from '../components/ui.jsx'
import { ProgrammeForm } from './ProgrammeForm.jsx'

export default function Programmes() {
  const { programmes, projects, partners, budgetLines, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const nav = useNavigate()
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()
  useOpenOnNew(() => setEditing({}), canEdit)

  const rows = useMemo(() => programmes.map((pg) => {
    const projs = projects.filter((p) => p.programmeId === pg.id)
    const spent = projs.reduce((n, p) => n + budgetForProject(budgetLines, p.id).spent, 0)
    const burn = pg.budget ? (spent / pg.budget) * 100 : 0
    return { id: pg.id, pg, count: projs.length, burn }
  }), [programmes, projects, budgetLines])

  const open = (pg) => nav(`/programmes/${pg.id}`)

  const onDelete = async (pg) => {
    const count = projects.filter((p) => p.programmeId === pg.id).length
    if (await confirm({
      title: 'Supprimer le programme',
      message: count ? `Ce programme contient ${count} projet(s) qui deviendront non rattachés (ils ne sont pas supprimés). Continuer ?` : 'Confirmer la suppression de ce programme ?',
      danger: true, confirmLabel: 'Supprimer',
    })) {
      remove('programmes', pg.id)
      log('supprime', 'programme', `Programme supprimé : ${pg.name}`)
    }
  }
  const bulkDelete = async (rows) => {
    if (await confirm({
      title: 'Supprimer les programmes',
      message: `Supprimer ${rows.length} programme(s) ? Les projets rattachés ne sont pas supprimés. Action annulable juste après.`,
      danger: true, confirmLabel: 'Supprimer',
    })) {
      rows.forEach((r) => remove('programmes', r.pg.id))
      log('supprime', 'programme', `${rows.length} programme(s) supprimé(s)`)
    }
  }
  const EXPORT_COLS = [
    { label: 'Code', get: (r) => r.pg.code }, { label: 'Programme', get: (r) => r.pg.name },
    { label: 'Bailleur', get: (r) => byId(partners, r.pg.donorId)?.name || '' },
    { label: 'Projets', get: (r) => r.count }, { label: 'Budget', get: (r) => r.pg.budget },
    { label: 'Devise', get: (r) => r.pg.currency }, { label: 'Consommation %', get: (r) => Math.round(r.burn) },
    { label: 'Statut', get: (r) => PROGRAMME_STATUS[r.pg.status]?.label || r.pg.status },
  ]
  const bulkActions = [
    { key: 'export', label: 'Exporter la sélection', icon: Download, keepSelection: true,
      onClick: (rows) => exportRowsXlsx('programmes-selection', rows, EXPORT_COLS) },
    canEdit && { key: 'del', label: 'Supprimer', icon: Trash2, tone: 'bad', keepSelection: true,
      onClick: (rows) => bulkDelete(rows) },
  ].filter(Boolean)

  return (
    <div>
      {node}
      <PageHeader icon={FolderKanban} title="Programmes" subtitle={`${programmes.length} portefeuille(s) · gestion par programme`}
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau programme</Button>} />

      {rows.length === 0 ? (
        <EmptyState title="Aucun programme" hint="Créez un premier programme pour regrouper vos projets."
          action={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau programme</Button>} />
      ) : (
        <DataTable
          onRowClick={(r) => open(r.pg)}
          selectable bulkActions={bulkActions}
          rows={rows}
          columns={[
            { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-xs font-bold text-brand-d">{r.pg.code}</span> },
            { key: 'name', label: 'Programme', render: (r) => (<div><div className="font-semibold text-ink">{r.pg.name}</div><div className="line-clamp-1 text-xs text-ink-mute">{r.pg.description}</div></div>) },
            { key: 'donor', label: 'Bailleur', render: (r) => <Badge tone="ink">{byId(partners, r.pg.donorId)?.acronym || '—'}</Badge> },
            { key: 'count', label: 'Projets', align: 'right', render: (r) => <span className="tabnum font-semibold">{r.count}</span> },
            { key: 'budget', label: 'Budget', align: 'right', render: (r) => <span className="tabnum">{moneyShort(r.pg.budget, r.pg.currency)}</span> },
            { key: 'burn', label: 'Consommation', width: 150, render: (r) => <div className="flex items-center gap-2"><Progress value={r.burn} tone={r.burn > 90 ? 'bad' : r.burn > 75 ? 'warn' : 'ok'} /><span className="w-9 text-right text-xs tabnum">{pct(r.burn)}</span></div> },
            { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={PROGRAMME_STATUS} value={r.pg.status} /> },
            {
              key: 'act', label: '', width: 200, align: 'right',
              render: (r) => <RowActions onOpen={() => open(r.pg)}
                onEdit={canEdit ? () => setEditing(r.pg) : undefined}
                onDelete={canEdit ? () => onDelete(r.pg) : undefined} />,
            },
          ]}
        />
      )}

      {editing && <ProgrammeForm programme={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
