// Export : sauvegarde JSON + impression de rapport (les exports tabulaires sont
// en Excel .xlsx, voir lib/docs.js — exportRowsXlsx / exportDocXlsx).
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

export function exportJSON(filename, data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  downloadBlob(filename, new Blob([json], { type: 'application/json' }))
}

// Le rapport imprimable infographique est construit dans lib/report.js
// (buildReportDoc / printReportDoc).
