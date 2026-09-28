function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// headers: string[]; rows: (string|number)[][]
export function exportToCsv(filename, headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((line) => line.map(escape).join(',')).join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
}

// Generates a real .xls file (HTML table wrapped in the legacy Excel MIME
// type) instead of pulling in the "xlsx" npm package, which has unpatched
// high-severity prototype-pollution/ReDoS advisories. Excel, Google Sheets,
// and LibreOffice all open this format directly.
export function exportToXls(filename, headers, rows, sheetTitle = 'Sheet1') {
  const escapeHtml = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const headerRow = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`
  const bodyRows = rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
    <x:Name>${escapeHtml(sheetTitle)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
    </head><body><table>${headerRow}${bodyRows}</table></body></html>`
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), filename)
}

// headers: string[]; rows: (string|number)[][]
// jsPDF + autotable are loaded on demand (they pull in html2canvas and add
// ~180KB gzipped) so pages that never export to PDF don't pay for it upfront.
export async function exportToPdf(filename, { title, subtitle, headers, rows, summary }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: rows.length && headers.length > 5 ? 'landscape' : 'portrait' })
  doc.setFontSize(14)
  doc.text(title, 14, 16)
  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(subtitle, 14, 22)
  }
  let startY = subtitle ? 28 : 22
  if (summary?.length) {
    doc.setFontSize(10)
    doc.setTextColor(40)
    doc.text(summary.join('    ·    '), 14, startY)
    startY += 6
  }
  autoTable(doc, {
    startY,
    head: [headers],
    body: rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [61, 95, 146] },
  })
  doc.save(filename)
}
