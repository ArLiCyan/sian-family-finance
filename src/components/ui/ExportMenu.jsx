import { useEffect, useRef, useState } from 'react'
import { Download, FileText, FileSpreadsheet, FileType } from 'lucide-react'
import Button from './Button'

// A small "Export" dropdown offering CSV / Excel / PDF, sharing one trigger
// button so pages don't need three separate buttons side by side.
export default function ExportMenu({ onCsv, onXls, onPdf, disabled, label = 'Export' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function pick(fn) {
    setOpen(false)
    fn?.()
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <Button variant="outline" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <Download className="h-4 w-4" /> {label}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-sage-700 dark:bg-sage-900">
          <button
            onClick={() => pick(onCsv)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-sage-800"
          >
            <FileText className="h-4 w-4 text-gray-400" /> CSV
          </button>
          <button
            onClick={() => pick(onXls)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-sage-800"
          >
            <FileSpreadsheet className="h-4 w-4 text-gray-400" /> Excel (.xls)
          </button>
          <button
            onClick={() => pick(onPdf)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-sage-800"
          >
            <FileType className="h-4 w-4 text-gray-400" /> PDF
          </button>
        </div>
      )}
    </div>
  )
}
