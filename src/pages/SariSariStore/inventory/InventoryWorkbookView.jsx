import { useEffect, useState, useCallback } from 'react'
import { Plus, FileBarChart, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDate } from '../../../lib/format'
import InventoryWorksheet from './InventoryWorksheet'
import ReportDetailModal from './ReportDetailModal'
import InventoryReportTrashModal from './InventoryReportTrashModal'
import ProductsPanel from './ProductsPanel'
import SettingsPanel from './SettingsPanel'

// The default, primary view for an inventory system — recording a report is
// front and center; Products and Settings are administrative and tucked
// behind plain-text links rather than sitting as co-equal tabs, per the
// request to make reporting the main workflow, not product/field setup.
export default function InventoryWorkbookView({ system, canManage, onArchived }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [reports, setReports] = useState([])
  const [productCount, setProductCount] = useState(0)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [worksheetOpen, setWorksheetOpen] = useState(false)
  const [editingReport, setEditingReport] = useState(null)
  const [viewingId, setViewingId] = useState(null)
  const [productsOpen, setProductsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: reportRows }, { count }] = await Promise.all([
      supabase.from('inventory_reports').select('*').eq('inventory_system_id', system.id).is('deleted_at', null).order('report_date', { ascending: false }),
      supabase.from('inventory_products').select('id', { count: 'exact', head: true }).eq('inventory_system_id', system.id).is('archived_at', null),
    ])
    setReports(reportRows ?? [])
    setProductCount(count ?? 0)

    if (reportRows?.length) {
      const { count: lowCount } = await supabase
        .from('inventory_report_calculations')
        .select('report_item_id', { count: 'exact', head: true })
        .eq('report_id', reportRows[0].id)
        .eq('is_low_stock', true)
      setLowStockCount(lowCount ?? 0)
    } else {
      setLowStockCount(0)
    }
    setLoading(false)
  }, [system.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`inventory-workbook-${system.id}`, [
    { table: 'inventory_reports', filter: `inventory_system_id=eq.${system.id}` },
    { table: 'inventory_products', filter: `inventory_system_id=eq.${system.id}` },
  ], load)

  async function handleDelete() {
    const { error } = await supabase.from('inventory_reports').update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq('id', deleting.id)
    setDeleting(null)
    if (error) {
      showToast(`Couldn't delete: ${error.message}`)
      return
    }
    load()
  }

  const latest = reports[0]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{system.name}</h2>
          {system.description && <p className="text-sm text-gray-500 dark:text-gray-400">{system.description}</p>}
        </div>
        {canManage && (
          <Button onClick={() => { setEditingReport(null); setWorksheetOpen(true) }} size="lg">
            <Plus className="h-5 w-5" /> New Inventory Report
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <button onClick={() => setProductsOpen(true)} className="text-sage-600 hover:underline dark:text-sage-400">Manage Products</button>
        <button onClick={() => setSettingsOpen(true)} className="text-sage-600 hover:underline dark:text-sage-400">Settings</button>
        <button onClick={() => setTrashOpen(true)} className="text-sage-600 hover:underline dark:text-sage-400">Trash</button>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {latest && (
            <Card className="mb-5">
              <CardHeader
                title="Latest Inventory Report"
                subtitle={formatDate(latest.report_date)}
                action={<Button variant="outline" onClick={() => setViewingId(latest.id)}>View</Button>}
              />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {productCount} product{productCount === 1 ? '' : 's'} tracked
                {lowStockCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {lowStockCount} low stock</span>}
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Inventory History" />
            {reports.length === 0 ? (
              <EmptyState
                icon={FileBarChart}
                title="No reports yet"
                message="Create your first inventory report to start tracking stock."
                action={canManage && <Button onClick={() => { setEditingReport(null); setWorksheetOpen(true) }}>New Inventory Report</Button>}
              />
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-sage-800">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-3">
                    <button onClick={() => setViewingId(r.id)} className="flex-1 text-left">
                      <span className="text-base font-medium text-gray-900 dark:text-gray-100">{formatDate(r.report_date)}</span>
                      {r.notes && <span className="ml-2 text-sm text-gray-400">{r.notes}</span>}
                    </button>
                    {canManage && (
                      <button
                        onClick={() => setDeleting(r)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <InventoryWorksheet
        open={worksheetOpen}
        onClose={() => setWorksheetOpen(false)}
        system={system}
        existingReport={editingReport}
        onSaved={() => { setWorksheetOpen(false); load() }}
      />
      <ReportDetailModal
        reportId={viewingId}
        system={system}
        canManage={canManage}
        onClose={() => setViewingId(null)}
        onChanged={load}
      />
      {productsOpen && (
        <Modal open onClose={() => setProductsOpen(false)} title="Manage Products" size="xl">
          <ProductsPanel system={system} canManage={canManage} />
        </Modal>
      )}
      {settingsOpen && (
        <Modal open onClose={() => setSettingsOpen(false)} title="Inventory Settings" size="lg">
          <SettingsPanel system={system} canManage={canManage} onArchived={() => { setSettingsOpen(false); onArchived?.() }} />
        </Modal>
      )}
      <InventoryReportTrashModal open={trashOpen} onClose={() => setTrashOpen(false)} system={system} onRestored={load} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Move to Trash?"
        message="This report moves to Trash and can be restored within 30 days. After that it's permanently deleted."
        confirmLabel="Move to Trash"
      />
    </div>
  )
}
