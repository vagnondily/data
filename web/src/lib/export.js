// Export CSV (compatible Excel FR : séparateur ';' + BOM UTF-8), JSON, impression
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function cell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCSV(rows, columns) {
  const head = columns.map((c) => cell(c.label)).join(';')
  const body = rows
    .map((r) => columns.map((c) => cell(c.get ? c.get(r) : r[c.key])).join(';'))
    .join('\n')
  return `﻿${head}\n${body}`
}

export function exportCSV(filename, rows, columns) {
  const csv = toCSV(rows, columns)
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
}

export function exportJSON(filename, data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  downloadBlob(filename, new Blob([json], { type: 'application/json' }))
}

// Ouvre une fenêtre imprimable (rapport HTML autonome, charte WFP)
export function printReport(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=900,height=1200')
  if (!w) { alert("Veuillez autoriser les fenêtres pop-up pour l'impression."); return }
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      *{box-sizing:border-box} body{font-family:"Open Sans",system-ui,Segoe UI,sans-serif;color:#0F2231;margin:0;padding:32px;background:#fff}
      h1{font-size:22px;color:#03293D;margin:0 0 4px} h2{font-size:15px;color:#085387;margin:24px 0 8px;border-bottom:2px solid #007DBC;padding-bottom:4px}
      .brandbar{height:6px;background:linear-gradient(90deg,#03293D,#007DBC);margin:-32px -32px 20px}
      .muted{color:#6F8798;font-size:12px}
      table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}
      th,td{border:1px solid #D6E2EC;padding:6px 9px;text-align:left} th{background:#EAF1F7;font-weight:700}
      .kpis{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
      .kpi{border:1px solid #D6E2EC;border-radius:8px;padding:10px 14px;min-width:130px}
      .kpi .v{font-size:20px;font-weight:800;color:#007DBC} .kpi .l{font-size:11px;color:#6F8798}
      @media print{.noprint{display:none}}
    </style></head><body>
    <div class="brandbar"></div>${bodyHtml}
    <p class="muted" style="margin-top:32px">Généré par MEMS — ${new Date().toLocaleString('fr-FR')}</p>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
    </body></html>`)
  w.document.close()
}
