import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import Badge from '../../../components/ui/Badge'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import { formatDate, formatDateShort } from '../../../lib/format'
import AddRepaymentModal from './AddRepaymentModal'

export default function FundingDetailModal({ funding, onClose, canManage, onChanged }) {
  const [repayments, setRepayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingRepayment, setAddingRepayment] = useState(false)

  const load = useCallback(async () => {
    if (!funding) return
    setLoading(true)
    const { data } = await supabase
      .from('funding_repayments')
      .select('*')
      .eq('funding_id', funding.funding_id)
      .order('repayment_date', { ascending: false })
    setRepayments(data ?? [])
    setLoading(false)
  }, [funding])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`funding-detail-${funding?.funding_id}`, funding ? [{ table: 'funding_repayments', filter: `funding_id=eq.${funding.funding_id}` }] : [], load)

  if (!funding) return null

  function afterRepayment() {
    load()
    onChanged?.()
  }

  return (
    <>
      <Modal open={!!funding} onClose={onClose} title={`Funding #${String(funding.displayNumber).padStart(3, '0')}`} size="md">
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase text-gray-400">Original Amount</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100"><CurrencyDisplay amount={funding.amount} /></p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Date</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">{formatDate(funding.funding_date)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Purpose</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">{funding.purpose || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Provided By</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">{funding.provided_by_name || '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Interest</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">{Number(funding.interest_rate)}%</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Status</p>
            <Badge color={funding.computed_status === 'fully_repaid' ? 'green' : 'amber'}>
              {funding.computed_status === 'fully_repaid' ? 'Fully Repaid' : 'Active'}
            </Badge>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Total Repaid</p>
            <p className="font-semibold text-green-600 dark:text-green-400"><CurrencyDisplay amount={funding.total_repaid} /></p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Remaining</p>
            <p className="font-semibold text-red-600 dark:text-red-400"><CurrencyDisplay amount={funding.remaining_amount} /></p>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Repayment History</p>
          {canManage && funding.remaining_amount > 0 && (
            <Button size="sm" onClick={() => setAddingRepayment(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Repayment
            </Button>
          )}
        </div>

        {loading ? (
          <LoadingState />
        ) : repayments.length === 0 ? (
          <EmptyState title="No repayments yet" message="Repayments you record will show up here." />
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
            {repayments.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{formatDateShort(r.repayment_date)}</p>
                  {r.notes && <p className="text-xs text-gray-400">{r.notes}</p>}
                </div>
                <CurrencyDisplay amount={r.amount} className="font-medium text-green-600 dark:text-green-400" />
              </div>
            ))}
          </div>
        )}
      </Modal>

      <AddRepaymentModal
        funding={addingRepayment ? funding : null}
        onClose={() => setAddingRepayment(false)}
        onSaved={afterRepayment}
      />
    </>
  )
}
