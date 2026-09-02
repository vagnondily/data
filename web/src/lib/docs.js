// ============================================================================
// Documents versionnés (registre) — Plan de suivi & PDD
// Configuration des colonnes par type + export/import Excel (SheetJS, à la demande)
// ============================================================================
import { uid } from './id.js'

export const DOC_STATUS = {
  brouillon: { label: 'Brouillon', tone: 'ink' },
  valide: { label: 'Validé', tone: 'ok' },
}

export const RISK_LEVELS = {
  'Élevé': { tone: 'bad', freq: 'Mensuel' },
  'Moyen': { tone: 'warn', freq: 'Trimestriel' },
  'Faible': { tone: 'ok', freq: 'Semestriel' },
}
export function freqForRisk(risque) { return RISK_LEVELS[risque]?.freq || '' }

export const DOC_KINDS = {
  suivi: {
    label: 'Plan de suivi', singular: 'plan de suivi', prefix: 'Plan de suivi',
    route: '/plan-suivi', icon: 'CalendarCheck', riskBased: true,
    subtitle: 'Suivi fondé sur le risque — la fréquence découle du niveau de risque',
    columns: [
      { key: 'site', label: 'Site', type: 'text' },
      { key: 'bureau', label: 'Bureau', type: 'text' },
      { key: 'activite', label: 'Activité', type: 'text' },
      { key: 'risque', label: 'Niveau de risque', type: 'select', options: ['Élevé', 'Moyen', 'Faible'] },
      { key: 'frequence', label: 'Fréquence de suivi', type: 'select', options: ['Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel'] },
      { key: 'responsable', label: 'Responsable', type: 'text' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['À faire', 'Planifié', 'Réalisé'] },
    ],
  },
  pdd: {
    label: 'Plan de distribution (PDD)', singular: 'PDD', prefix: 'PDD',
    route: '/pdd', icon: 'Boxes', riskBased: false,
    subtitle: 'Plan de distribution des denrées / transferts par période',
    columns: [
      { key: 'site', label: 'Site', type: 'text' },
      { key: 'bureau', label: 'Bureau', type: 'text' },
      { key: 'activite', label: 'Activité', type: 'text' },
      { key: 'modalite', label: 'Modalité', type: 'select', options: ['Vivres', 'Cash', 'Bon'] },
      { key: 'beneficiaires', label: 'Bénéficiaires', type: 'number' },
      { key: 'ration', label: 'Ration / montant', type: 'text' },
      { key: 'valeur', label: 'Valeur (USD)', type: 'number' },
      { key: 'statut', label: 'Statut', type: 'select', options: ['Prévu', 'En cours', 'Distribué'] },
    ],
  },
}

export function nextVersion(docs, kind) {
  const n = docs.filter((d) => d.kind === kind).length + 1
  return { version: `${n}.0`, ref: `${DOC_KINDS[kind].prefix} ${n}.0` }
}

function sanitize(s = '') { return String(s).replace(/[^\w.\- ]+/g, '_').trim() || 'document' }

// ---- Export .xlsx générique (jeux de données) ------------------------------
export async function exportRowsXlsx(filename, rows, columns) {
  const XLSX = await import('xlsx')
  const header = columns.map((c) => c.label)
  const data = rows.map((r) => columns.map((c) => {
    const v = c.get ? c.get(r) : r[c.key]
    return v == null ? '' : v
  }))
  const ws = XLSX.utils.aoa_to_sheet([header, ...data])
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, String(c.label).length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Données')
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

// ---- Export .xlsx (SheetJS chargé dynamiquement) ---------------------------
export async function exportDocXlsx(doc, columns) {
  const XLSX = await import('xlsx')
  const header = columns.map((c) => c.label)
  const data = (doc.rows || []).map((r) => columns.map((c) => (r[c.key] ?? '')))
  const ws = XLSX.utils.aoa_to_sheet([header, ...data])
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(14, c.label.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tableau')
  XLSX.writeFile(wb, `${sanitize(doc.ref)}.xlsx`)
}

// ---- Import .xlsx / .csv → lignes (mappées par en-tête) ---------------------
export async function importDocRows(file, columns) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (!aoa.length) return []
  const header = aoa[0].map((h) => String(h).trim().toLowerCase())
  const labelToCol = {}
  columns.forEach((c) => { labelToCol[c.label.trim().toLowerCase()] = c })
  return aoa.slice(1)
    .filter((r) => r.some((x) => String(x).trim() !== ''))
    .map((r) => {
      const obj = { id: uid('row') }
      header.forEach((h, i) => {
        const col = labelToCol[h]
        if (!col) return
        let v = r[i]
        if (col.type === 'number') v = Number(String(v).replace(/\s/g, '').replace(',', '.')) || 0
        else v = String(v ?? '').trim()
        obj[col.key] = v
      })
      return obj
    })
}
