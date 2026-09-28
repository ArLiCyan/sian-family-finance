import { useEffect, useState, useCallback } from 'react'
import { Plus, FileBarChart } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDate } from '../../../lib/format'
import CreateReportModal from './CreateReportModal'
import ReportDetailModal from './ReportDetailModal'

export default function ReportsPanel({ system, canManage }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [viewingId, setViewingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_reports')
      .select('*')
      .eq('inventory_system_id', system.id)
      .order('report_date', { ascending: false })
    setReports(data ?? [])
    setLoading(false)
  }, [system.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`inventory-reports-${system.id}`, [{ table: 'inventory_reports', filter: `inventory_system_id=eq.${system.id}` }], load)

  return (
    <div>
      <div className="mb-4 flex justify-end">
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
              <button
                key={r.id}
                onClick={() => setViewingId(r.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-sage-800/40"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(r.report_date)}</span>
                {r.notes && <span className="text-xs text-gray-400">{r.notes}</span>}
              </button>
            ))}
          </div>
        )}
      </Card>

      <CreateReportModal open={createOpen} onClose={() => setCreateOpen(false)} system={system} onSaved={load} />
      <ReportDetailModal reportId={viewingId} onClose={() => setViewingId(null)} />
    </div>
  )
}
