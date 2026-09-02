// ============================================================================
// Registre de documents versionnés (générique) — Plan de suivi / PDD
// Liste les versions par période ; « Ouvrir → » mène au tableau du document.
// ============================================================================
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, Boxes, Plus } from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { DOC_KINDS, DOC_STATUS, nextVersion } from '../../lib/docs.js'
import { uid } from '../../lib/id.js'
import { useOpenOnNew } from '../../lib/hooks.js'
import { fmtDate } from '../../lib/format.js'
import {
  PageHeader, Button, Badge, StatusBadge, DataTable, RowActions, Modal, Field, Input, Select,
  Textarea, useConfirm, EmptyState,
} from '../../components/ui.jsx'

const ICONS = { CalendarCheck, Boxes }

export default function DocRegistry({ kind }) {
  const cfg = DOC_KINDS[kind]
  const { planDocs, offices, currentUserId, add, update, remove, log } = useStore((s) => s)
  const { canEdit } = useCan()
  const nav = useNavigate()
  const [editing, setEditing] = useState(null)
  const { confirm, node } = useConfirm()
  useOpenOnNew(() => setEditing({}), canEdit)
  const Icon = ICONS[cfg.icon] || CalendarCheck

  const rows = useMemo(() => planDocs.filter((d) => d.kind === kind)
    .sort((a, b) => (a.version < b.version ? 1 : -1)), [planDocs, kind])

  const del = async (d) => {
    if (await confirm({ title: `Supprimer le ${cfg.singular}`, message: `Supprimer « ${d.ref} » et son tableau ?`, danger: true, confirmLabel: 'Supprimer' })) {
      remove('planDocs', d.id); log('supprime', 'document', `${cfg.label} supprimé : ${d.ref}`)
    }
  }
  const dup = (d) => {
    const { id, ...rest } = d
    const now = new Date().toISOString()
    const rec = add('planDocs', {
      ...rest, ref: `${rest.ref} (copie)`, version: `${rest.version || ''}-copie`, status: 'brouillon',
      rows: (d.rows || []).map((r) => ({ ...r, id: uid('row') })), createdById: currentUserId, createdAt: now, updatedAt: now,
    })
    log('cree', 'document', `${cfg.label} dupliqué : ${rec.ref}`)
  }

  return (
    <div>
      {node}
      <PageHeader icon={Icon} title={cfg.label} subtitle={`${rows.length} version(s) · ${cfg.subtitle}`}
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau {cfg.singular}</Button>} />

      {rows.length === 0 ? (
        <EmptyState title={`Aucun ${cfg.singular}`} hint="Créez une première version pour démarrer." icon={Icon}
          action={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Nouveau {cfg.singular}</Button>} />
      ) : (
        <DataTable
          onRowClick={(d) => nav(`${cfg.route}/${d.id}`)}
          rows={rows}
          columns={[
            { key: 'ref', label: 'Référence', render: (d) => <span className="font-semibold text-ink">{d.ref}</span> },
            { key: 'period', label: 'Période', render: (d) => <span className="font-mono text-xs">{d.period}</span> },
            { key: 'bureau', label: 'Périmètre', render: (d) => <span className="text-xs text-ink-soft">{d.officeId ? byId(offices, d.officeId)?.name : 'Tous les bureaux'}</span> },
            cfg.riskBased && { key: 'risk', label: 'Fondé sur le risque', render: (d) => d.riskBased ? <Badge tone="brand" dot>Oui</Badge> : <Badge tone="ink">Non</Badge> },
            { key: 'rows', label: 'Lignes', align: 'right', render: (d) => <span className="tabnum">{(d.rows || []).length}</span> },
            { key: 'status', label: 'Statut', render: (d) => <StatusBadge map={DOC_STATUS} value={d.status} /> },
            { key: 'upd', label: 'Mise à jour', align: 'right', render: (d) => <span className="text-xs text-ink-mute">{fmtDate(d.updatedAt || d.createdAt)}</span> },
            {
              key: 'act', label: '', width: 200, align: 'right',
              render: (d) => <RowActions onOpen={() => nav(`${cfg.route}/${d.id}`)}
                onEdit={canEdit ? () => setEditing(d) : undefined}
                onDuplicate={canEdit ? () => dup(d) : undefined}
                onDelete={canEdit ? () => del(d) : undefined} />,
            },
          ].filter(Boolean)}
        />
      )}

      {editing && <DocMetaModal doc={editing} kind={kind} offices={offices}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          const now = new Date().toISOString()
          if (editing.id) { update('planDocs', editing.id, { ...data, updatedAt: now }); log('modifie', 'document', `${cfg.label} modifié : ${data.ref}`) }
          else {
            const rec = add('planDocs', { kind, rows: [], createdById: currentUserId, createdAt: now, updatedAt: now, ...data })
            log('cree', 'document', `Nouveau ${cfg.singular} : ${data.ref}`)
            nav(`${cfg.route}/${rec.id}`)
          }
          setEditing(null)
        }} />}
    </div>
  )
}

export function DocMetaModal({ doc, kind, offices, onClose, onSave }) {
  const cfg = DOC_KINDS[kind]
  const planDocs = useStore((s) => s.planDocs)
  const suggested = doc.id ? { version: doc.version, ref: doc.ref } : nextVersion(planDocs, kind)
  const [f, setF] = useState({
    ref: suggested.ref, version: suggested.version, period: '2025-T4', officeId: '', status: 'brouillon',
    riskBased: cfg.riskBased, note: '', ...doc,
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} size="md" title={doc.id ? `Modifier le ${cfg.singular}` : `Nouveau ${cfg.singular}`}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => onSave(f)} disabled={!f.ref}>Enregistrer</Button></>}>
      <div className="form-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Référence" required className="col-span-2"><Input value={f.ref} onChange={(e) => set('ref', e.target.value)} /></Field>
        <Field label="Version"><Input value={f.version} onChange={(e) => set('version', e.target.value)} placeholder="1.0" /></Field>
        <Field label="Période"><Input value={f.period} onChange={(e) => set('period', e.target.value)} placeholder="2025-T4" /></Field>
        <Field label="Périmètre (bureau)"><Select value={f.officeId} onChange={(e) => set('officeId', e.target.value)}><option value="">Tous les bureaux</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>{Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        {cfg.riskBased && (
          <Field label="Suivi fondé sur le risque" className="col-span-2">
            <Select value={f.riskBased ? '1' : '0'} onChange={(e) => set('riskBased', e.target.value === '1')}><option value="1">Oui</option><option value="0">Non</option></Select>
          </Field>
        )}
        <Field label="Note" className="col-span-2"><Textarea value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
