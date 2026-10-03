import { useEffect, useRef, useState } from 'react'
import { Download, FileText, FileSpreadsheet, FileType } from 'lucide-react'
import Button from './Button'

// A small "Export" dropdown offering CSV / Excel / PDF, sharing one trigger
// button so pages don't need three separate buttons side by side. Pass only
// the handlers you want — formats without a handler are left out of the menu.
export default function ExportMenu({ onCsv, onXls, onPdf, disabled, label = 'Export', size = 'md' }) {
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

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-sage-800'

  return (
    <div className="relative inline-block" ref={ref}>
      <Button variant="outline" size={size} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <Download className="h-4 w-4" /> {label}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-sage-700 dark:bg-sage-900">
          {onCsv && (
            <button onClick={() => pick(onCsv)} className={itemClass}>
              <FileText className="h-4 w-4 text-gray-400" /> CSV
            </button>
          )}
          {onXls && (
            <button onClick={() => pick(onXls)} className={itemClass}>
              <FileSpreadsheet className="h-4 w-4 text-gray-400" /> Excel (.xls)
            </button>
          )}
          {onPdf && (
            <button onClick={() => pick(onPdf)} className={itemClass}>
              <FileType className="h-4 w-4 text-gray-400" /> PDF
            </button>
          )}
        </div>
      )}
    </div>
  )
}
