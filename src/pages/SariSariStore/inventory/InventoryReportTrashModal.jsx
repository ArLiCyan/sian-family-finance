import { useEffect, useState, useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../contexts/ToastContext'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDate, formatDateShort } from '../../../lib/format'

const RETENTION_DAYS = 30

export default function InventoryReportTrashModal({ open, onClose, system, onRestored }) {
  const { showToast } = useToast()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_reports')
      .select('*')
      .eq('inventory_system_id', system.id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    setReports(data ?? [])
    setLoading(false)
  }, [system.id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function restore(report) {
    const { error } = await supabase.from('inventory_reports').update({ deleted_at: null, deleted_by: null }).eq('id', report.id)
    if (error) {
      showToast(`Couldn't restore: ${error.message}`)
      return
    }
    load()
    onRestored?.()
  }

  function daysLeft(deletedAt) {
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed))
  }

  return (
    <Modal open={open} onClose={onClose} title="Trash" size="md">
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Deleted reports stay here for {RETENTION_DAYS} days before being permanently removed, in case you deleted the wrong one.
      </p>
      {loading ? (
        <LoadingState />
      ) : reports.length === 0 ? (
        <EmptyState title="Trash is empty" message="Deleted reports will show up here for 30 days before being permanently removed." />
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
          {reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(r.report_date)}</p>
                <p className="text-xs text-gray-400">
                  Deleted {formatDateShort(r.deleted_at)} · {daysLeft(r.deleted_at)} day{daysLeft(r.deleted_at) === 1 ? '' : 's'} left before permanent deletion
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => restore(r)}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
