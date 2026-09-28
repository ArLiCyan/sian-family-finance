import { useEffect, useState, useCallback } from 'react'
import { Plus, Landmark } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import Badge from '../../../components/ui/Badge'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import { formatDateShort } from '../../../lib/format'
import AddFundingModal from '../capital/AddFundingModal'
import FundingDetailModal from '../capital/FundingDetailModal'

export default function BusinessCapitalTab({ family, canManage }) {
  const [fundings, setFundings] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [viewing, setViewing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rows }, { data: summaries }] = await Promise.all([
      supabase.from('business_funding').select('*').eq('family_id', family.id).order('funding_date', { ascending: true }),
      supabase.from('business_funding_summary').select('*').eq('family_id', family.id),
    ])
    const summaryMap = Object.fromEntries((summaries ?? []).map((s) => [s.funding_id, s]))
    const merged = (rows ?? []).map((f, i) => ({ ...f, ...summaryMap[f.id], funding_id: f.id, displayNumber: i + 1 }))
    setFundings(merged.reverse())
    setLoading(false)
  }, [family.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`business-funding-${family.id}`, [{ table: 'business_funding', filter: `family_id=eq.${family.id}` }, { table: 'funding_repayments' }], load)

  function afterChange() {
    load()
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {canManage && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add Funding
          </Button>
        )}
      </div>

      <Card>
        {loading ? (
          <LoadingState />
        ) : fundings.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No funding recorded yet"
            message="Record money provided to the store as business capital here."
            action={canManage && <Button onClick={() => setAddOpen(true)}>Add Funding</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3">Funding</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Purpose</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Repaid</th>
                  <th className="py-2 pr-3 text-right">Remaining</th>
                  <th className="py-2 pl-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {fundings.map((f) => (
                  <tr key={f.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-sage-800/30" onClick={() => setViewing(f)}>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 dark:text-gray-100">
                      Funding #{String(f.displayNumber).padStart(3, '0')}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500">{formatDateShort(f.funding_date)}</td>
                    <td className="py-2.5 pr-3 text-gray-500">{f.purpose || '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold"><CurrencyDisplay amount={f.amount} /></td>
                    <td className="py-2.5 pr-3 text-right text-green-600 dark:text-green-400"><CurrencyDisplay amount={f.total_repaid ?? 0} /></td>
                    <td className="py-2.5 pr-3 text-right text-red-600 dark:text-red-400"><CurrencyDisplay amount={f.remaining_amount ?? f.amount} /></td>
                    <td className="py-2.5 pl-3">
                      <Badge color={f.computed_status === 'fully_repaid' ? 'green' : 'amber'}>
                        {f.computed_status === 'fully_repaid' ? 'Fully Repaid' : 'Active'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddFundingModal open={addOpen} onClose={() => setAddOpen(false)} family={family} onSaved={afterChange} />
      <FundingDetailModal funding={viewing} onClose={() => setViewing(null)} canManage={canManage} onChanged={afterChange} />
    </div>
  )
}
