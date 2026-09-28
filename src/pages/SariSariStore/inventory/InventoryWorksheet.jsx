import { useEffect, useMemo, useState } from 'react'
import { DataSheetGrid, intColumn, keyColumn } from 'react-datasheet-grid'
import 'react-datasheet-grid/dist/style.css'
import { Save, Upload, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { exportToXls } from '../../../lib/exportUtils'
import Button from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/FormField'
import LoadingState from '../../../components/ui/LoadingState'
import { formatDate } from '../../../lib/format'
import ImportCsvModal from './ImportCsvModal'

// A real spreadsheet grid (react-datasheet-grid: click to edit, Tab/Shift+Tab/
// Enter/arrow-key navigation, copy-paste including multi-cell paste, delete)
// instead of a custom-built spreadsheet engine — this is the family's
// familiar Excel sheet, just backed by the database. Only "Added Stock" and
// "Remaining Stock" are editable; everything else is calculated and locked.
//
// Recording the same date twice never dead-ends: if a report already exists
// for the chosen date, whatever you've already typed here takes priority and
// gets merged with the saved report instead of blocking you.
export default function InventoryWorksheet({ open, onClose, system, existingReport, onSaved }) {
  const { profile } = useAuth()
  const [activeReport, setActiveReport] = useState(existingReport ?? null)
  const isEdit = !!activeReport
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  async function loadWorksheet(report, dateForPrevious) {
    const [{ data: products }, { data: items }, { data: prevReport }] = await Promise.all([
      supabase.from('inventory_products').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      report ? supabase.from('inventory_report_items').select('*').eq('report_id', report.id) : Promise.resolve({ data: [] }),
      supabase
        .from('inventory_reports')
        .select('id')
        .eq('inventory_system_id', system.id)
        .lt('report_date', dateForPrevious)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const savedByProduct = Object.fromEntries((items ?? []).map((i) => [i.product_id, i.values]))

    let previousByProduct = {}
    if (prevReport) {
      const { data: prevItems } = await supabase.from('inventory_report_items').select('product_id, values').eq('report_id', prevReport.id)
      previousByProduct = Object.fromEntries((prevItems ?? []).map((i) => [i.product_id, i.values?.ending_inventory ?? null]))
    }

    setRows(
      (products ?? []).map((p) => ({
        productId: p.id,
        itemName: p.name,
        addedStock: savedByProduct[p.id]?.quantity_purchased ?? '',
        remainingStock: savedByProduct[p.id]?.ending_inventory ?? '',
        previousRemaining: previousByProduct[p.id] ?? null,
        lowStockThreshold: p.low_stock_threshold,
      }))
    )
  }

  useEffect(() => {
    if (!open) return
    const initial = existingReport ?? null
    setActiveReport(initial)
    setReportDate(initial?.report_date ?? new Date().toISOString().slice(0, 10))
    setNotes(initial?.notes ?? '')
    setError('')
    setNotice('')
    setLoading(true)
    loadWorksheet(initial, initial?.report_date ?? new Date().toISOString().slice(0, 10)).then(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, system.id, existingReport?.id])

  // Derive read-only columns (Previous Remaining stays fixed once loaded;
  // Estimated Sold and Status recompute live as Added/Remaining are typed).
  const gridRows = useMemo(
    () =>
      rows.map((r) => {
        const added = r.addedStock === '' || r.addedStock == null ? null : Number(r.addedStock)
        const remaining = r.remainingStock === '' || r.remainingStock == null ? null : Number(r.remainingStock)
        const prev = r.previousRemaining
        const estimatedSold = prev != null && added != null && remaining != null ? prev + added - remaining : null
        const isLow = remaining != null && r.lowStockThreshold != null && remaining <= r.lowStockThreshold
        return {
          ...r,
          estimatedSold,
          status: remaining == null ? '' : isLow ? 'Low' : 'OK',
        }
      }),
    [rows]
  )

  function handleGridChange(newValue) {
    setRows(
      newValue.map((r) => ({
        productId: r.productId,
        itemName: r.itemName,
        addedStock: r.addedStock,
        remainingStock: r.remainingStock,
        previousRemaining: r.previousRemaining,
        lowStockThreshold: r.lowStockThreshold,
      }))
    )
  }

  function applyImportedRows(imported) {
    // imported: array of { productId, addedStock, remainingStock } — merge
    // into the grid rather than replacing it, so nothing already typed here
    // is lost, and products not present in the file are left untouched.
    const byProduct = Object.fromEntries(imported.map((r) => [r.productId, r]))
    setRows((prev) =>
      prev.map((r) =>
        byProduct[r.productId]
          ? { ...r, addedStock: byProduct[r.productId].addedStock, remainingStock: byProduct[r.productId].remainingStock }
          : r
      )
    )
    setImportOpen(false)
  }

  function exportWorksheet() {
    const headers = ['Item', 'Added Stock', 'Remaining Stock', 'Previous Remaining', 'Estimated Sold', 'Status']
    const data = gridRows.map((r) => [r.itemName, r.addedStock ?? '', r.remainingStock ?? '', r.previousRemaining ?? '', r.estimatedSold ?? '', r.status])
    exportToXls(`${system.name}-${reportDate}.xls`, headers, data, 'Inventory')
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')
    setNotice('')

    let report = activeReport
    if (!report) {
      const { data, error: reportErr } = await supabase
        .from('inventory_reports')
        .insert({ inventory_system_id: system.id, report_date: reportDate, notes: notes || null, created_by: profile.id })
        .select()
        .single()

      if (reportErr) {
        if (reportErr.message.includes('duplicate')) {
          const { data: existing } = await supabase
            .from('inventory_reports')
            .select('*')
            .eq('inventory_system_id', system.id)
            .eq('report_date', reportDate)
            .is('deleted_at', null)
            .maybeSingle()
          if (existing) {
            const { data: existingItems } = await supabase.from('inventory_report_items').select('*').eq('report_id', existing.id)
            const baseline = Object.fromEntries((existingItems ?? []).map((i) => [i.product_id, i.values]))
            setRows((prev) =>
              prev.map((r) => ({
                ...r,
                addedStock: r.addedStock !== '' && r.addedStock != null ? r.addedStock : baseline[r.productId]?.quantity_purchased ?? '',
                remainingStock: r.remainingStock !== '' && r.remainingStock != null ? r.remainingStock : baseline[r.productId]?.ending_inventory ?? '',
              }))
            )
            setActiveReport(existing)
            setSaving(false)
            setNotice('A report for this date already existed — merged your entries into it. Review below, then save again.')
            return
          }
        }
        setSaving(false)
        setError(reportErr.message)
        return
      }
      report = data
    } else if (notes !== (activeReport.notes ?? '')) {
      await supabase.from('inventory_reports').update({ notes: notes || null }).eq('id', activeReport.id)
    }

    const itemRows = rows
      .map((r) => {
        const values = {}
        if (r.addedStock !== '' && r.addedStock != null) values.quantity_purchased = Number(r.addedStock)
        if (r.remainingStock !== '' && r.remainingStock != null) values.ending_inventory = Number(r.remainingStock)
        if (Object.keys(values).length === 0) return null
        return { report_id: report.id, product_id: r.productId, values }
      })
      .filter(Boolean)

    if (itemRows.length) {
      const { error: itemsErr } = await supabase.from('inventory_report_items').upsert(itemRows, { onConflict: 'report_id,product_id' })
      if (itemsErr) {
        setSaving(false)
        setError(itemsErr.message)
        return
      }
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  const columns = [
    {
      id: 'itemName',
      title: 'Item',
      disabled: true,
      basis: 220,
      grow: 2,
      component: ({ rowData }) => <div className="px-2 text-sm font-medium text-gray-900 truncate">{rowData.itemName}</div>,
      copyValue: ({ rowData }) => rowData.itemName,
    },
    { ...keyColumn('addedStock', intColumn), title: 'Added Stock', basis: 110 },
    { ...keyColumn('remainingStock', intColumn), title: 'Remaining Stock', basis: 130 },
    {
      id: 'previousRemaining',
      title: 'Previous Remaining',
      disabled: true,
      basis: 140,
      component: ({ rowData }) => <div className="px-2 text-sm text-gray-700">{rowData.previousRemaining ?? '—'}</div>,
      copyValue: ({ rowData }) => rowData.previousRemaining ?? '',
    },
    {
      id: 'estimatedSold',
      title: 'Estimated Sold',
      disabled: true,
      basis: 120,
      component: ({ rowData }) => <div className="px-2 text-sm text-gray-700">{rowData.estimatedSold ?? '—'}</div>,
      copyValue: ({ rowData }) => rowData.estimatedSold ?? '',
    },
    {
      id: 'status',
      title: 'Status',
      disabled: true,
      basis: 90,
      component: ({ rowData }) =>
        rowData.status === 'Low' ? (
          <div className="px-2 text-sm font-semibold text-amber-700">Low</div>
        ) : rowData.status === 'OK' ? (
          <div className="px-2 text-sm text-gray-600">OK</div>
        ) : (
          <div className="px-2 text-sm text-gray-400">—</div>
        ),
      copyValue: ({ rowData }) => rowData.status,
    },
  ]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-sage-950">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-sage-800 px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{system.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{isEdit ? `Editing report — ${formatDate(activeReport.report_date)}` : 'New Inventory Report'}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
          <X className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center"><LoadingState /></div>
      ) : (
        <>
          <div className="border-b border-gray-200 dark:border-sage-800 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Field label="Report Date" required hint={isEdit ? "Can't be changed once created." : undefined}>
                  <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} disabled={isEdit} />
                </Field>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Field label="Notes">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={1} />
                </Field>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                <Button variant="outline" type="button" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" /> Import Excel
                </Button>
                <Button variant="outline" type="button" onClick={exportWorksheet}>
                  Export Excel
                </Button>
                <Button type="button" onClick={handleSubmit} loading={saving}>
                  <Save className="h-4 w-4" /> Save Report
                </Button>
              </div>
            </div>
            {notice && <p className="text-sm text-sage-700 dark:text-sage-400">{notice}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
              Type into <strong>Added Stock</strong> and <strong>Remaining Stock</strong>. Everything else fills in automatically.
              Click a cell to edit, use Tab/Enter/arrow keys to move, and you can paste in a whole column at once.
            </p>
            <div
              className="min-w-[700px] rounded-lg border border-gray-300 dark:border-sage-700"
              style={{ '--dsg-header-text-color': '#374151', '--dsg-header-active-text-color': '#111827' }}
            >
              <DataSheetGrid
                value={gridRows}
                onChange={handleGridChange}
                columns={columns}
                rowKey="productId"
                lockRows
                addRowsComponent={false}
                height={Math.min(600, 40 + gridRows.length * 36)}
              />
            </div>
          </div>
        </>
      )}

      <ImportCsvModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        products={rows.map((r) => ({ id: r.productId, name: r.itemName }))}
        onApply={applyImportedRows}
      />
    </div>
  )
}
