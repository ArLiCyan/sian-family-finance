import { useState } from 'react'
import { FileSpreadsheet, Check, X as XIcon } from 'lucide-react'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'

// Accepts a .csv exported from Excel or Google Sheets — not the .xlsx binary
// format, which would need an extra parsing library (the common one, `xlsx`,
// has unpatched high-severity vulnerabilities, so it's deliberately not used
// here). Every spreadsheet tool exports CSV natively, so this covers the
// same real-world need without that risk.
//
// Shows a preview — matched vs. unmatched rows — before anything is applied,
// and applying only fills the worksheet grid; nothing is saved to the
// database until the user reviews it and clicks Save Report themselves.
export default function ImportCsvModal({ open, onClose, products, onApply }) {
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  function findColumn(headers, keywords) {
    return headers.findIndex((h) => keywords.some((k) => h.toLowerCase().includes(k)))
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean)
    if (lines.length < 2) throw new Error('The file needs a header row plus at least one item.')
    const headers = lines[0].split(',').map((h) => h.trim())
    const itemCol = findColumn(headers, ['item', 'product'])
    const addedCol = findColumn(headers, ['added', 'purchase', 'dugang'])
    const remainingCol = findColumn(headers, ['remaining', 'ending', 'bilin'])
    if (itemCol === -1) throw new Error('Could not find an "Item" or "Product" column.')

    const productByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]))

    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim())
      const name = cells[itemCol] ?? ''
      const product = productByName.get(name.toLowerCase())
      return {
        name,
        productId: product?.id ?? null,
        addedStock: addedCol !== -1 ? cells[addedCol] : '',
        remainingStock: remainingCol !== -1 ? cells[remainingCol] : '',
      }
    })
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        setRows(parseCsv(evt.target.result))
      } catch (err) {
        setError(err.message)
        setRows(null)
      }
    }
    reader.readAsText(file)
  }

  function handleApply() {
    const matched = (rows ?? [])
      .filter((r) => r.productId && (r.addedStock !== '' || r.remainingStock !== ''))
      .map((r) => ({ productId: r.productId, addedStock: r.addedStock, remainingStock: r.remainingStock }))
    onApply(matched)
    reset()
  }

  function reset() {
    setRows(null)
    setFileName('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  const matchedCount = rows?.filter((r) => r.productId).length ?? 0
  const unmatchedCount = (rows?.length ?? 0) - matchedCount

  return (
    <Modal open={open} onClose={handleClose} title="Import from Excel" size="lg">
      {!rows ? (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Save your Excel or Google Sheets file as a .csv first (File → Save As / Download → .csv), with columns for
            Item, Added Stock, and Remaining Stock.
          </p>
          <label
            htmlFor="csv-file-input"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-sage-700 p-8 hover:bg-gray-50 dark:hover:bg-sage-800"
          >
            <FileSpreadsheet className="h-8 w-8 text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-400">Choose a .csv file</span>
            <input id="csv-file-input" type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </label>
          {fileName && <p className="mt-2 text-xs text-gray-400">{fileName}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            {matchedCount} item{matchedCount === 1 ? '' : 's'} matched your product list
            {unmatchedCount > 0 ? `, ${unmatchedCount} not recognized (skipped)` : ''}. Nothing is saved yet — review
            below, then Apply to fill the worksheet, and Save Report when you're ready.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-sage-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-sage-950">
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pl-3 pr-3"></th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3 text-right">Added Stock</th>
                  <th className="py-2 pr-3 text-right">Remaining Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {rows.map((r, i) => (
                  <tr key={i} className={!r.productId ? 'opacity-50' : ''}>
                    <td className="py-1.5 pl-3 pr-3">
                      {r.productId ? <Check className="h-4 w-4 text-green-600" /> : <XIcon className="h-4 w-4 text-red-400" />}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-800 dark:text-gray-200">{r.name}</td>
                    <td className="py-1.5 pr-3 text-right">{r.addedStock || '—'}</td>
                    <td className="py-1.5 pr-3 text-right">{r.remainingStock || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>Choose a Different File</Button>
            <Button onClick={handleApply} disabled={matchedCount === 0}>Apply to Worksheet</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
