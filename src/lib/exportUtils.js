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

// A one-record "printout": a title, a label/value details block, then any
// number of titled tables (e.g. a loan's schedule and payment history).
//   details:  [label, value][]
//   sections: { title, headers, rows }[]
// Callers should format money as plain text like "PHP 1,000.00" for the PDF —
// jsPDF's built-in fonts have no peso sign, so "₱" prints as a wrong glyph.
export async function exportDocumentToPdf(filename, { title, subtitle, details = [], sections = [] }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'portrait' })
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFontSize(16)
  doc.setTextColor(30)
  doc.text(title, 14, 16)
  let y = 22
  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(subtitle, 14, y)
    y += 4
  }

  if (details.length) {
    autoTable(doc, {
      startY: y + 2,
      body: details.map(([label, value]) => [label, String(value ?? '—')]),
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1.5, textColor: 30 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
    })
    y = doc.lastAutoTable.finalY
  }

  for (const section of sections) {
    if (y > pageHeight - 40) {
      doc.addPage()
      y = 16
    }
    doc.setFontSize(12)
    doc.setTextColor(30)
    doc.text(section.title, 14, y + 10)
    autoTable(doc, {
      startY: y + 13,
      head: [section.headers],
      body: section.rows.length ? section.rows : [[{ content: 'Nothing recorded yet', colSpan: section.headers.length, styles: { halign: 'center', textColor: 140 } }]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [61, 95, 146] },
    })
    y = doc.lastAutoTable.finalY
  }

  doc.save(filename)
}

// Same document shape as above, as a CSV: details, then each section as its own
// titled block separated by a blank line.
export function exportDocumentToCsv(filename, { title, subtitle, details = [], sections = [] }) {
  const escape = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const line = (cells) => cells.map(escape).join(',')
  const lines = [line([title])]
  if (subtitle) lines.push(line([subtitle]))
  if (details.length) {
    lines.push('')
    details.forEach(([l, v]) => lines.push(line([l, v ?? ''])))
  }
  sections.forEach((s) => {
    lines.push('', line([s.title]), line(s.headers))
    if (s.rows.length) s.rows.forEach((r) => lines.push(line(r)))
    else lines.push(line(['Nothing recorded yet']))
  })
  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), filename)
}

export function exportDocumentToXls(filename, { title, subtitle, details = [], sections = [] }) {
  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  const detailsHtml = details.length
    ? `<table>${details.map(([l, v]) => `<tr><td><b>${esc(l)}</b></td><td>${esc(v ?? '—')}</td></tr>`).join('')}</table>`
    : ''
  const sectionsHtml = sections
    .map(
      (s) => `<br/><h3>${esc(s.title)}</h3><table border="1">
        <tr>${s.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>
        ${s.rows.length ? s.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${s.headers.length}">Nothing recorded yet</td></tr>`}
      </table>`
    )
    .join('')
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
    <h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}${detailsHtml}${sectionsHtml}</body></html>`
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel' }), filename)
}
