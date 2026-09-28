import { useEffect, useState, useCallback } from 'react'
import { HandCoins } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import { formatDateShort } from '../../../lib/format'

// A flat, chronological log of every repayment across every funding record —
// a quick "who paid what when" view, distinct from a single funding's own
// repayment history shown on its detail modal.
export default function RepaymentsTab({ family }) {
  const [repayments, setRepayments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: fundingRows } = await supabase.from('business_funding').select('id, purpose, funding_date').eq('family_id', family.id)
    const fundingIds = (fundingRows ?? []).map((f) => f.id)
    const fundingMap = Object.fromEntries((fundingRows ?? []).map((f, i) => [f.id, { ...f, displayNumber: i + 1 }]))
    if (!fundingIds.length) {
      setRepayments([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('funding_repayments')
      .select('*')
      .in('funding_id', fundingIds)
      .order('repayment_date', { ascending: false })
    setRepayments((data ?? []).map((r) => ({ ...r, funding: fundingMap[r.funding_id] })))
    setLoading(false)
  }, [family.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`store-repayments-${family.id}`, [{ table: 'funding_repayments' }], load)

  return (
    <Card>
      <CardHeader title="Repayment Log" subtitle="Every repayment across all funding records, most recent first" />
      {loading ? (
        <LoadingState />
      ) : repayments.length === 0 ? (
        <EmptyState icon={HandCoins} title="No repayments yet" message="Repayments recorded against any funding will show up here." />
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-sage-800">
          {repayments.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Funding #{String(r.funding?.displayNumber ?? 0).padStart(3, '0')} {r.funding?.purpose ? `— ${r.funding.purpose}` : ''}
                </p>
                <p className="text-xs text-gray-400">{formatDateShort(r.repayment_date)}{r.notes ? ` · ${r.notes}` : ''}</p>
              </div>
              <CurrencyDisplay amount={r.amount} className="font-semibold text-green-600 dark:text-green-400" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
