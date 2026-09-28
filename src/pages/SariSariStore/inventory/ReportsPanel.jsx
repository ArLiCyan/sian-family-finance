import { useEffect, useState, useCallback } from 'react'
import { Plus, FileBarChart, Archive, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDate } from '../../../lib/format'
import CreateReportModal from './CreateReportModal'
import ReportDetailModal from './ReportDetailModal'
import InventoryReportTrashModal from './InventoryReportTrashModal'

export default function ReportsPanel({ system, canManage }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [viewingId, setViewingId] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_reports')
      .select('*')
      .eq('inventory_system_id', system.id)
      .is('deleted_at', null)
      .order('report_date', { ascending: false })
    setReports(data ?? [])
    setLoading(false)
  }, [system.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`inventory-reports-${system.id}`, [{ table: 'inventory_reports', filter: `inventory_system_id=eq.${system.id}` }], load)

  async function handleDelete() {
    const { error } = await supabase.from('inventory_reports').update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq('id', deleting.id)
    setDeleting(null)
    if (error) {
      showToast(`Couldn't delete: ${error.message}`)
      return
    }
    load()
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setTrashOpen(true)}>
          <Archive className="h-4 w-4" /> Trash
        </Button>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create Report
          </Button>
        )}
      </div>

      <Card padded={false}>
        {loading ? (
          <LoadingState />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="No reports yet"
            message="Create a report to record stock counts for a date."
            action={canManage && <Button onClick={() => setCreateOpen(true)}>Create Report</Button>}
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-sage-800/40">
                <button onClick={() => setViewingId(r.id)} className="flex-1 text-left">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(r.report_date)}</span>
                  {r.notes && <span className="ml-2 text-xs text-gray-400">{r.notes}</span>}
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

      <CreateReportModal open={createOpen} onClose={() => setCreateOpen(false)} system={system} onSaved={load} />
      <ReportDetailModal reportId={viewingId} system={system} canManage={canManage} onClose={() => setViewingId(null)} onChanged={load} />
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
