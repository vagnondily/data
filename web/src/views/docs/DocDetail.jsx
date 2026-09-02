// ============================================================================
// Détail d'un document versionné — tableau filtrable par bureau,
// export .xlsx, remplissage hors-ligne, réimport (.xlsx/.csv).
// ============================================================================
import { useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Plus, Download, Upload, CheckCircle2, FileSpreadsheet, ShieldAlert, Trash2,
} from 'lucide-react'
import { useStore, byId } from '../../lib/store.js'
import { useCan } from '../../lib/perms.js'
import { uid } from '../../lib/id.js'
import { DOC_KINDS, DOC_STATUS, RISK_LEVELS, freqForRisk, exportDocXlsx, importDocRows } from '../../lib/docs.js'
import { fmtDate } from '../../lib/format.js'
import {
  PageHeader, Card, Button, Badge, StatusBadge, DataTable, RowActions, Modal, Field, Input, Select,
  useConfirm, EmptyState, Dropdown, MenuItem,
} from '../../components/ui.jsx'
import { DocMetaModal } from './DocRegistry.jsx'

export default function DocDetail({ kind }) {
  const cfg = DOC_KINDS[kind]
  const columns = cfg.columns
  const { id } = useParams()
  const nav = useNavigate()
  const { canEdit, canValidate } = useCan()
  const { planDocs, offices, update, log } = useStore((s) => s)
  const fileRef = useRef(null)
  const [bureau, setBureau] = useState('')
  const [editRow, setEditRow] = useState(null)
  const [editMeta, setEditMeta] = useState(false)
  const { confirm, node } = useConfirm()

  const doc = byId(planDocs, id)
  if (!doc) return <EmptyState title="Document introuvable" action={<Button onClick={() => nav(cfg.route)}>Retour au registre</Button>} />

  const allRows = doc.rows || []
  const bureaus = useMemo(() => [...new Set(allRows.map((r) => String(r.bureau || '').trim()).filter(Boolean))], [allRows])
  const rows = bureau ? allRows.filter((r) => String(r.bureau || '').trim() === bureau) : allRows

  const touch = (patch) => update('planDocs', doc.id, { ...patch, updatedAt: new Date().toISOString() })

  const saveRow = (data) => {
    const next = editRow.id ? allRows.map((r) => (r.id === editRow.id ? { ...r, ...data } : r)) : [...allRows, { ...data, id: uid('row') }]
    touch({ rows: next }); log(editRow.id ? 'modifie' : 'cree', 'document', `${cfg.label} ${doc.ref} — ligne ${editRow.id ? 'modifiée' : 'ajoutée'}`)
    setEditRow(null)
  }
  const deleteRow = async (r) => {
    if (await confirm({ title: 'Supprimer la ligne', message: 'Confirmer la suppression de cette ligne ?', danger: true, confirmLabel: 'Supprimer' })) {
      touch({ rows: allRows.filter((x) => x.id !== r.id) })
    }
  }
  const validate = () => { touch({ status: 'valide' }); log('valide', 'document', `${cfg.label} validé : ${doc.ref}`) }

  const doExport = async () => {
    const scoped = { ...doc, rows, ref: bureau ? `${doc.ref} — ${bureau}` : doc.ref }
    await exportDocXlsx(scoped, columns)
  }
  const onImport = async (file) => {
    if (!file) return
    let newRows = []
    try { newRows = await importDocRows(file, columns) } catch (e) { alert('Fichier illisible : ' + e); return }
    if (fileRef.current) fileRef.current.value = ''
    if (!newRows.length) { alert('Aucune ligne détectée dans le fichier.'); return }
    const covered = new Set(newRows.map((r) => String(r.bureau || '').trim()).filter(Boolean))
    const msg = covered.size
      ? `${newRows.length} ligne(s) détectée(s), couvrant ${covered.size} bureau(x). Les lignes existantes de ces bureaux seront remplacées par le fichier.`
      : `${newRows.length} ligne(s) détectée(s). Elles seront ajoutées au tableau.`
    if (!(await confirm({ title: 'Importer le tableau', message: msg, confirmLabel: 'Importer' }))) return
    const kept = covered.size ? allRows.filter((r) => !covered.has(String(r.bureau || '').trim())) : allRows
    touch({ rows: [...kept, ...newRows] })
    log('importe', 'document', `Import Excel : ${doc.ref} (${newRows.length} lignes)`)
  }

  return (
    <div>
      {node}
      <Link to={cfg.route} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-mute hover:text-brand"><ArrowLeft size={15} /> {cfg.label}</Link>

      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold text-ink">{doc.ref}</h1>
              <StatusBadge map={DOC_STATUS} value={doc.status} />
              {cfg.riskBased && doc.riskBased && <Badge tone="brand" dot>Fondé sur le risque</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-mute">
              <span>Période <b className="text-ink-soft">{doc.period}</b></span>
              <span>Périmètre <b className="text-ink-soft">{doc.officeId ? byId(offices, doc.officeId)?.name : 'Tous les bureaux'}</b></span>
              <span>Lignes <b className="text-ink-soft tabnum">{allRows.length}</b></span>
              <span>MàJ <b className="text-ink-soft">{fmtDate(doc.updatedAt || doc.createdAt)}</b></span>
            </div>
            {doc.note && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{doc.note}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canValidate && doc.status === 'brouillon' && <Button variant="soft" icon={CheckCircle2} onClick={validate}>Valider</Button>}
            {canEdit && <Button variant="outline" icon={Pencil} onClick={() => setEditMeta(true)}>Modifier</Button>}
          </div>
        </div>
      </Card>

      {/* Barre d'outils : filtre bureau + Excel */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={bureau} onChange={(e) => setBureau(e.target.value)} className="w-auto min-w-[200px]">
          <option value="">Tous les bureaux ({allRows.length})</option>
          {bureaus.map((b) => <option key={b} value={b}>{b} ({allRows.filter((r) => String(r.bureau || '').trim() === b).length})</option>)}
        </Select>
        <Button variant="outline" icon={Download} onClick={doExport}>Exporter Excel{bureau ? ' (bureau)' : ''}</Button>
        {canEdit && <>
          <Button variant="outline" icon={Upload} onClick={() => fileRef.current?.click()}>Importer Excel</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
          <Button className="ml-auto" icon={Plus} onClick={() => setEditRow({})}>Ajouter une ligne</Button>
        </>}
      </div>

      {cfg.riskBased && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-brand-tint/30 px-3 py-2 text-xs text-ink-soft">
          <ShieldAlert size={14} className="text-brand-d" /> Fréquence recommandée selon le risque :
          {Object.entries(RISK_LEVELS).map(([lvl, v]) => <Badge key={lvl} tone={v.tone}>{lvl} → {v.freq}</Badge>)}
        </div>
      )}

      <DataTable
        empty="Tableau vide — ajoutez une ligne ou importez un fichier Excel."
        rows={rows}
        columns={[
          ...columns.map((c) => ({
            key: c.key, label: c.label, align: c.type === 'number' ? 'right' : undefined,
            render: (r) => renderCell(c, r[c.key]),
          })),
          canEdit && { key: 'act', label: '', width: 110, align: 'right', render: (r) => <RowActions onEdit={() => setEditRow(r)} onDelete={() => deleteRow(r)} /> },
        ].filter(Boolean)}
      />

      {editRow && <DocRowModal row={editRow} columns={columns} kind={kind} offices={offices} onClose={() => setEditRow(null)} onSave={saveRow} />}
      {editMeta && <DocMetaModal doc={doc} kind={kind} offices={offices} onClose={() => setEditMeta(false)}
        onSave={(data) => { touch(data); log('modifie', 'document', `${cfg.label} modifié : ${data.ref}`); setEditMeta(false) }} />}
    </div>
  )
}

function renderCell(col, value) {
  if (value == null || value === '') return <span className="text-ink-mute">—</span>
  if (col.type === 'number') return <span className="tabnum">{new Intl.NumberFormat('fr-FR').format(value)}</span>
  if (col.key === 'risque') return <Badge tone={RISK_LEVELS[value]?.tone || 'ink'} dot>{value}</Badge>
  if (col.key === 'statut') {
    const tone = /réalis|distribu/i.test(value) ? 'ok' : /cours|planifi/i.test(value) ? 'warn' : 'ink'
    return <Badge tone={tone}>{value}</Badge>
  }
  if (col.type === 'select') return <span className="text-ink-soft">{value}</span>
  return <span className={col.key === 'site' ? 'font-semibold text-ink' : 'text-ink-soft'}>{value}</span>
}

function DocRowModal({ row, columns, kind, offices, onClose, onSave }) {
  const cfg = DOC_KINDS[kind]
  const init = {}
  columns.forEach((c) => { init[c.key] = row[c.key] ?? (c.type === 'number' ? '' : '') })
  const [f, setF] = useState({ ...init, ...row })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const onRisk = (v) => { const freq = freqForRisk(v); setF((p) => ({ ...p, risque: v, frequence: freq || p.frequence })) }

  return (
    <Modal open onClose={onClose} size="lg" title={row.id ? 'Modifier la ligne' : 'Nouvelle ligne'}
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button onClick={() => {
        const data = { ...f }
        columns.forEach((c) => { if (c.type === 'number') data[c.key] = Number(data[c.key]) || 0 })
        onSave(data)
      }} disabled={!f.site}>Enregistrer</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        {columns.map((c) => (
          <Field key={c.key} label={c.label} className={c.key === 'site' || c.key === 'activite' ? 'col-span-2' : ''}>
            {c.key === 'bureau' ? (
              <Select value={f.bureau || ''} onChange={(e) => set('bureau', e.target.value)}>
                <option value="">—</option>
                {offices.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
              </Select>
            ) : c.type === 'select' ? (
              <Select value={f[c.key] || ''} onChange={(e) => (c.key === 'risque' && cfg.riskBased ? onRisk(e.target.value) : set(c.key, e.target.value))}>
                <option value="">—</option>
                {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <Input type={c.type === 'number' ? 'number' : 'text'} value={f[c.key] ?? ''} onChange={(e) => set(c.key, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  )
}
