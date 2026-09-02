// ============================================================================
// Import de données — barrière de validation : Aperçu → Dépôt → Validation
// « Rien n'entre avant le troisième temps. »
// ============================================================================
import { useRef, useState } from 'react'
import { Upload, Eye, Inbox, CheckCircle2, XCircle, FileCheck2, AlertCircle } from 'lucide-react'
import { useStore, byId } from '../lib/store.js'
import { useCan } from '../lib/perms.js'
import { IMPORT_STATUS } from '../lib/constants.js'
import { fmtDate, num } from '../lib/format.js'
import { PageHeader, Card, SectionTitle, Select, Button, Field, Badge, StatusBadge, DataTable, EmptyState } from '../components/ui.jsx'

const SOURCES = ['Extraction fichier', 'ODK Central', 'KoboToolbox', 'HTTP / CSV', 'Foundry']

export default function Import() {
  const { imports, projects, currentUserId, add, update, log } = useStore((s) => s)
  const { canEdit, canValidate } = useCan()
  const fileRef = useRef(null)
  const [source, setSource] = useState(SOURCES[0])
  const [projectId, setProjectId] = useState(projects[0]?.id || '')
  const [preview, setPreview] = useState(null)

  const onFile = async (file) => {
    if (!file) return
    let columns = [], rowCount = 0
    if (/\.csv$/i.test(file.name)) {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      const delim = (lines[0]?.match(/;/g) || []).length >= (lines[0]?.match(/,/g) || []).length ? ';' : ','
      columns = (lines[0] || '').split(delim).map((c) => c.trim().replace(/^"|"$/g, ''))
      rowCount = Math.max(0, lines.length - 1)
    } else {
      // Aperçu simulé pour les fichiers binaires (xlsx/sav) : pas de parsing côté client
      columns = ['@_uuid', 'site_pcode', 'indicator', 'value', 'date']
      rowCount = 120 + Math.floor(Math.random() * 400)
    }
    const mappingOk = columns.some((c) => /uuid|instance|_id|pcode|code/i.test(c))
    setPreview({ filename: file.name, source, projectId, columns, rowCount, newRows: rowCount, mappingOk })
  }

  const deposit = () => {
    if (!preview) return
    add('imports', {
      filename: preview.filename, source: preview.source, projectId: preview.projectId, status: 'en_attente',
      rowsNew: preview.newRows, rowsUpdated: 0, rowsUnchanged: 0, date: new Date().toISOString().slice(0, 10),
      uploaderId: currentUserId, mappingOk: preview.mappingOk,
    })
    log('importe', 'données', `Dépôt en attente : ${preview.filename}`)
    setPreview(null); if (fileRef.current) fileRef.current.value = ''
  }
  const validate = (im) => { update('imports', im.id, { status: 'valide' }); log('valide', 'données', `Import validé : ${im.filename} (${im.rowsNew} lignes)`) }
  const reject = (im) => { update('imports', im.id, { status: 'rejete' }); log('rejette', 'données', `Import rejeté : ${im.filename}`) }

  return (
    <div>
      <PageHeader icon={Upload} title="Import de données" subtitle="Un dépôt franchit trois temps avant d'alimenter les tableaux de bord" />

      {/* Barrière en 3 temps */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StepCard n={1} icon={Eye} title="Aperçu" api="ne écrit rien" desc="Format, colonnes, correspondances déduites et décompte des lignes. Aucune écriture." />
        <StepCard n={2} icon={Inbox} title="Dépôt" api="EN ATTENTE" desc="Le fichier est rangé en attente. Rien n'entre encore dans les indicateurs." />
        <StepCard n={3} icon={FileCheck2} title="Validation" api="ingestion" desc="La donnée entre : sites marqués visités, historique conservé. Un rejet l'écarte." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Nouveau dépôt</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source"><Select value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Projet"><Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</Select></Field>
          </div>
          <div className="mt-3">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.sav,.zip" onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-d" />
            <p className="mt-1.5 text-xs text-ink-mute">CSV parsé réellement ; autres formats (xlsx, sav, zip) en aperçu simulé.</p>
          </div>

          {preview && (
            <div className="mt-4 rounded-xl border border-line bg-inset p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">{preview.filename}</span>
                <Badge tone={preview.mappingOk ? 'ok' : 'warn'} dot>{preview.mappingOk ? 'Clé détectée' : 'Clé manquante'}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <PreviewStat label="Nouveaux" value={preview.newRows} tone="text-ok" />
                <PreviewStat label="Modifiés" value={0} tone="text-brand" />
                <PreviewStat label="Colonnes" value={preview.columns.length} tone="text-ink" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {preview.columns.slice(0, 8).map((c, i) => <span key={i} className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">{c}</span>)}
                {preview.columns.length > 8 && <span className="text-[10px] text-ink-mute">+{preview.columns.length - 8}</span>}
              </div>
              {!preview.mappingOk && <div className="mt-2 flex items-center gap-1.5 text-xs text-warn"><AlertCircle size={13} /> Aucune colonne clé (uuid / p-code) détectée — le rapprochement pourrait échouer.</div>}
              {canEdit && <Button className="mt-3" icon={Inbox} onClick={deposit}>Déposer (mettre en attente)</Button>}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Conséquence</SectionTitle>
          <p className="text-sm text-ink-soft">Le tableau de bord ne voit <b>que</b> de la donnée réelle validée, jamais un dépôt en attente. L’idempotence et l’historique reposent sur la clé <span className="rounded bg-inset px-1 font-mono text-xs text-brand-d">@_uuid / instanceID</span>.</p>
          <div className="mt-3 space-y-2">
            {['apercu', 'en_attente', 'valide', 'rejete'].map((k) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <StatusBadge map={IMPORT_STATUS} value={k} />
                <span className="text-ink-mute">{{ apercu: 'contrôlé, non déposé', en_attente: 'déposé, en attente de validation', valide: 'ingéré dans le système', rejete: 'écarté sans effet' }[k]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SectionTitle className="mt-6">Registre des dépôts</SectionTitle>
      <DataTable
        empty="Aucun dépôt"
        rows={[...imports].sort((a, b) => (a.date < b.date ? 1 : -1))}
        columns={[
          { key: 'filename', label: 'Fichier', render: (r) => <span className="font-semibold text-ink">{r.filename}</span> },
          { key: 'source', label: 'Source', render: (r) => <Badge tone="ink">{r.source}</Badge> },
          { key: 'project', label: 'Projet', render: (r) => byId(projects, r.projectId)?.code || '—' },
          { key: 'rows', label: 'Lignes', align: 'right', render: (r) => <span className="tabnum">{num(r.rowsNew)} <span className="text-ink-mute">nouv.</span></span> },
          { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
          { key: 'uploader', label: 'Déposé par', render: (r) => byId(useStore.getState().users, r.uploaderId)?.name?.split(' ')[0] || '—' },
          { key: 'status', label: 'Statut', render: (r) => <StatusBadge map={IMPORT_STATUS} value={r.status} /> },
          {
            key: 'act', label: '', width: 170, render: (r) => (r.status === 'en_attente' && canValidate) ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant="soft" icon={CheckCircle2} onClick={() => validate(r)}>Valider</Button>
                <Button size="sm" variant="outline" icon={XCircle} onClick={() => reject(r)}>Rejeter</Button>
              </div>
            ) : null,
          },
        ]}
      />
    </div>
  )
}

function StepCard({ n, icon: Icon, title, api, desc }) {
  return (
    <Card className="relative">
      <span className="absolute right-4 top-3 font-display text-3xl font-extrabold text-brand-tint">{n}</span>
      <div className="flex items-center gap-2 text-brand-d"><Icon size={18} /><span className="font-bold text-ink">{title}</span></div>
      <div className="mt-0.5 font-mono text-[11px] text-brand">{api}</div>
      <p className="mt-2 text-xs text-ink-soft">{desc}</p>
    </Card>
  )
}
function PreviewStat({ label, value, tone }) {
  return <div className="rounded-lg bg-surface py-1.5"><div className={`text-base font-extrabold tabnum ${tone}`}>{value}</div><div className="text-[10px] text-ink-mute">{label}</div></div>
}
