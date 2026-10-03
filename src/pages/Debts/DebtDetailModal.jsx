import { useEffect, useState, useCallback, useMemo } from 'react'
import { Pencil, CircleDollarSign, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Badge from '../../components/ui/Badge'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge, debtStatusColor } from '../../components/ui/Badge'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { formatDate, formatDateShort } from '../../lib/format'
import { computeInstallmentSchedule } from '../../lib/loanSchedule'

const INSTALLMENT_STATUS_COLOR = { paid: 'green', partial: 'blue', overdue: 'red', upcoming: 'gray' }
const INSTALLMENT_STATUS_LABEL = { paid: 'Paid', partial: 'Partial', overdue: 'Overdue', upcoming: 'Upcoming' }

export default function DebtDetailModal({ debt, onClose, onEdit, onPay, onDelete }) {
  const [projection, setProjection] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('schedule')

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
    setTab('schedule')
  }, [load])

  const schedule = useMemo(() => (debt ? computeInstallmentSchedule(debt, payments) : null), [debt, payments])

  if (!debt) return null

  const hasBreakdown = debt.principal_amount != null || debt.interest_amount != null || debt.fees_amount != null

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
              {hasBreakdown && (
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {[
                    debt.principal_amount != null && `₱${Number(debt.principal_amount).toLocaleString()} principal`,
                    debt.interest_amount != null && `₱${Number(debt.interest_amount).toLocaleString()} interest`,
                    debt.fees_amount != null && `₱${Number(debt.fees_amount).toLocaleString()} fees`,
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </p>
              )}
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

          {debt.notes?.trim() && (
            <div className="mb-5 rounded-lg border border-sage-200 dark:border-sage-800 bg-sage-50 dark:bg-sage-900/40 p-3">
              <p className="mb-1 text-xs font-medium uppercase text-sage-700 dark:text-sage-300">Notes</p>
              <p className="whitespace-pre-line text-sm text-sage-900 dark:text-sage-100">{debt.notes}</p>
            </div>
          )}

          <div className="mb-1 flex justify-between items-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Payments</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(debt)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              {canSettle && (
                <Button size="sm" onClick={() => onPay(debt)}>
                  <CircleDollarSign className="h-3.5 w-3.5" /> Record Payment
                </Button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(debt)}
                  title="Move to Trash"
                  className="rounded-lg border border-gray-300 dark:border-sage-700 p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {schedule?.installments && (
            <Tabs
              tabs={[
                { value: 'schedule', label: 'Installment Schedule' },
                { value: 'history', label: 'Payment History' },
              ]}
              active={tab}
              onChange={setTab}
            />
          )}

          {schedule?.tooMany && (
            <p className="mb-3 text-xs text-amber-600">
              That monthly amount would take {schedule.numInstallments} installments to pay off — too many to list
              individually. Showing payment history instead.
            </p>
          )}

          {schedule?.installments && tab === 'schedule' ? (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                    <th className="py-1.5 pr-2">#</th>
                    <th className="py-1.5 pr-2">Due Date</th>
                    <th className="py-1.5 pr-2 text-right">Expected</th>
                    <th className="py-1.5 pr-2">Status</th>
                    <th className="py-1.5 pl-2">Paid Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                  {schedule.installments.map((inst) => (
                    <tr key={inst.number}>
                      <td className="py-1.5 pr-2 text-gray-400">{inst.number}</td>
                      <td className="py-1.5 pr-2 text-gray-700 dark:text-gray-300">{formatDateShort(inst.dueDate)}</td>
                      <td className="py-1.5 pr-2 text-right font-medium text-gray-900 dark:text-gray-100">
                        <CurrencyDisplay amount={inst.expected} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Badge color={INSTALLMENT_STATUS_COLOR[inst.status]}>{INSTALLMENT_STATUS_LABEL[inst.status]}</Badge>
                      </td>
                      <td className="py-1.5 pl-2 text-gray-500">{inst.paidDate ? formatDateShort(inst.paidDate) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" message="Payments you record will show up here." />
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
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
          {!schedule?.installments && !schedule?.tooMany && (
            <p className="mt-2 text-xs text-gray-400">
              Set an expected monthly payment (Edit) to see an itemized due-date schedule instead of just a payment list.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
