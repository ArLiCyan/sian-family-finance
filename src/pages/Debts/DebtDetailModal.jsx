import { useEffect, useState, useCallback } from 'react'
import { Pencil, CircleDollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge, debtStatusColor } from '../../components/ui/Badge'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { formatDate, formatDateShort } from '../../lib/format'

export default function DebtDetailModal({ debt, onClose, onEdit, onPay }) {
  const [projection, setProjection] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!debt) return
    setLoading(true)
    const [{ data: proj }, { data: pays }] = await Promise.all([
      supabase.from('debt_payoff_projection').select('*').eq('debt_id', debt.id).single(),
      supabase.from('debt_payments').select('*').eq('debt_id', debt.id).order('date', { ascending: false }),
    ])
    setProjection(proj)
    setPayments(pays ?? [])
    setLoading(false)
  }, [debt])

  useEffect(() => {
    load()
  }, [load])

  if (!debt) return null

  const original = Number(debt.original_amount)
  const totalPaid = Number(projection?.total_paid ?? 0)
  const remaining = Number(projection?.remaining_amount ?? original)
  const percentPaid = original > 0 ? Math.min(100, (totalPaid / original) * 100) : 0
  const canSettle = debt.status !== 'paid' && debt.status !== 'cancelled'

  return (
    <Modal open={!!debt} onClose={onClose} title={debt.counterparty_name} size="md">
      {loading ? (
        <LoadingState />
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-400 capitalize">
                {debt.direction === 'borrowed' ? 'You borrowed from' : 'You lent to'} {debt.counterparty_name}
              </p>
              {debt.due_date && <p className="text-xs text-gray-400">Due {formatDate(debt.due_date)}</p>}
            </div>
            <StatusBadge status={debt.status} map={debtStatusColor} />
          </div>

          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-gray-50 dark:bg-sage-950 p-3">
              <p className="text-xs uppercase text-gray-400">Original</p>
              <p className="mt-1 font-semibold text-gray-900 dark:text-gray-100"><CurrencyDisplay amount={original} /></p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-sage-950 p-3">
              <p className="text-xs uppercase text-gray-400">Paid So Far</p>
              <p className="mt-1 font-semibold text-green-600 dark:text-green-400"><CurrencyDisplay amount={totalPaid} /></p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-sage-950 p-3">
              <p className="text-xs uppercase text-gray-400">Remaining</p>
              <p className="mt-1 font-semibold text-red-600 dark:text-red-400"><CurrencyDisplay amount={remaining} /></p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Progress</span>
              <span>{percentPaid.toFixed(0)}% paid</span>
            </div>
            <ProgressBar percent={percentPaid} tone={percentPaid >= 100 ? 'green' : 'navy'} />
          </div>

          {canSettle && (
            <div className="mb-5 rounded-lg border border-sage-200 dark:border-sage-800 bg-sage-50 dark:bg-sage-900/40 p-3">
              {projection?.months_remaining != null ? (
                <>
                  <p className="text-sm font-medium text-sage-900 dark:text-sage-100">
                    {projection.months_remaining === 0
                      ? "This is fully paid off with the last recorded payment."
                      : `${projection.months_remaining} more month${projection.months_remaining === 1 ? '' : 's'} to pay it off`}
                  </p>
                  {projection.projected_payoff_date && (
                    <p className="mt-0.5 text-xs text-sage-700 dark:text-sage-300">
                      Projected payoff: {formatDate(projection.projected_payoff_date)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    At <CurrencyDisplay amount={projection.effective_monthly_rate} />/month
                    {projection.is_estimated_rate ? ' (estimated from your payment history)' : ' (your set monthly payment)'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Not enough information yet to estimate months remaining. Set an expected monthly payment (Edit), or record at
                  least one payment so it can be estimated from your pace.
                </p>
              )}
            </div>
          )}

          <div className="mb-3 flex justify-between items-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payment History</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(debt)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              {canSettle && (
                <Button size="sm" onClick={() => onPay(debt)}>
                  <CircleDollarSign className="h-3.5 w-3.5" /> Record Payment
                </Button>
              )}
            </div>
          </div>

          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" message="Payments you record will show up here." />
          ) : (
            <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{formatDateShort(p.date)}</p>
                    {p.notes && <p className="text-xs text-gray-400">{p.notes}</p>}
                  </div>
                  <CurrencyDisplay amount={p.amount} className="font-medium text-green-600 dark:text-green-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
