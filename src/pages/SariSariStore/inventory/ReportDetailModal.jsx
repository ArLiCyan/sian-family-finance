import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Modal from '../../../components/ui/Modal'
import Badge from '../../../components/ui/Badge'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import { formatDate } from '../../../lib/format'

export default function ReportDetailModal({ reportId, onClose }) {
  const [report, setReport] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!reportId) return
    setLoading(true)
    Promise.all([
      supabase.from('inventory_reports').select('*').eq('id', reportId).single(),
      // inventory_report_calculations is a view (built from joins), so it has
      // no foreign key PostgREST can auto-embed through — same limitation
      // hit earlier with project_member_contribution_status. Fetch product
      // names separately and merge client-side instead.
      supabase.from('inventory_report_calculations').select('*').eq('report_id', reportId),
    ]).then(async ([{ data: r }, { data: items }]) => {
      const productIds = [...new Set((items ?? []).map((i) => i.product_id))]
      let names = {}
      if (productIds.length) {
        const { data: prods } = await supabase.from('inventory_products').select('id, name').in('id', productIds)
        names = Object.fromEntries((prods ?? []).map((p) => [p.id, p.name]))
      }
      const merged = (items ?? [])
        .map((i) => ({ ...i, product_name: names[i.product_id] }))
        .sort((a, b) => (a.product_name ?? '').localeCompare(b.product_name ?? ''))
      setReport(r)
      setRows(merged)
      setLoading(false)
    })
  }, [reportId])

  return (
    <Modal open={!!reportId} onClose={onClose} title={report ? formatDate(report.report_date) : 'Report'} size="xl">
      {loading ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState title="No entries" message="This report has no recorded values." />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-sage-900">
              <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 text-right">Purchased</th>
                <th className="py-2 pr-3 text-right">Ending</th>
                <th className="py-2 pr-3 text-right">Previous Ending</th>
                <th className="py-2 pr-3 text-right">Est. Sold</th>
                <th className="py-2 pl-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
              {rows.map((r) => (
                <tr key={r.report_item_id}>
                  <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{r.product_name}</td>
                  <td className="py-1.5 pr-3 text-right">{r.quantity_purchased ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right">{r.ending_inventory ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-500">{r.previous_ending_inventory ?? '—'}</td>
                  <td className="py-1.5 pr-3 text-right text-gray-500">{r.estimated_units_sold ?? '—'}</td>
                  <td className="py-1.5 pl-3">
                    {r.is_low_stock && <Badge color="amber">Low Stock</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {report?.notes && <p className="mt-3 text-xs text-gray-400">Notes: {report.notes}</p>}
    </Modal>
  )
}
