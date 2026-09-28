import { useEffect, useState, useCallback } from 'react'
import { Plus, Landmark, CircleDollarSign, Eye, Trash2, Archive } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useToast } from '../../contexts/ToastContext'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { StatusBadge, debtStatusColor } from '../../components/ui/Badge'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { formatDate } from '../../lib/format'
import DebtForm from './DebtForm'
import DebtPaymentModal from './DebtPaymentModal'
import DebtDetailModal from './DebtDetailModal'
import DebtTrashModal from './DebtTrashModal'

export default function Debts() {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const { showToast } = useToast()
  const [debts, setDebts] = useState([])
  const [projections, setProjections] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase.from('debts').select('*').eq('scope', mode).is('deleted_at', null).order('created_at', { ascending: false })
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    const { data } = await query
    setDebts(data ?? [])
    if (data?.length) {
      const { data: projs } = await supabase.from('debt_payoff_projection').select('*').in('debt_id', data.map((d) => d.id))
      setProjections(Object.fromEntries((projs ?? []).map((p) => [p.debt_id, p])))
    }
    setLoading(false)
  }, [profile, family, mode, isFamily])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete() {
    const { error } = await supabase.from('debts').update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq('id', deleting.id)
    setDeleting(null)
    if (error) {
      showToast(`Couldn't delete: ${error.message}`)
      return
    }
    load()
  }

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Loans and Credit Card' : 'My Debts & Loans'}
        subtitle="Money borrowed or lent, with automatic balance and payoff tracking"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setTrashOpen(true)}>
              <Archive className="h-4 w-4" /> Trash
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        }
      />

      {loading ? (
        <LoadingState />
      ) : debts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No debts recorded"
          message="Track money borrowed or lent, with payments, remaining balance, and months left to pay."
          action={<Button onClick={() => setFormOpen(true)}>Add</Button>}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3">Counterparty</th>
                  <th className="py-2 pr-3">Direction</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3 text-right">Remaining</th>
                  <th className="py-2 pr-3">Months Left</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {debts.map((d) => {
                  const proj = projections[d.id]
                  const remaining = proj?.remaining_amount ?? d.original_amount
                  return (
                    <tr key={d.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-sage-800/30" onClick={() => setViewing(d)}>
                      <td className="py-2.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{d.counterparty_name}</td>
                      <td className="py-2.5 pr-3 capitalize text-gray-500">{d.direction}</td>
                      <td className="py-2.5 pr-3 text-gray-500">{d.due_date ? formatDate(d.due_date) : '—'}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold"><CurrencyDisplay amount={remaining} /></td>
                      <td className="py-2.5 pr-3 text-gray-500">
                        {d.status === 'paid' ? '—' : proj?.months_remaining != null ? `${proj.months_remaining} mo` : 'Unknown'}
                      </td>
                      <td className="py-2.5 pr-3"><StatusBadge status={d.status} map={debtStatusColor} /></td>
                      <td className="py-2.5 pl-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setViewing(d)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                          <Eye className="h-4 w-4" />
                        </button>
                        {d.status !== 'paid' && d.status !== 'cancelled' && (
                          <button onClick={() => setPaying(d)} className="rounded p-1.5 text-sage-600 hover:bg-sage-50 dark:hover:bg-sage-800">
                            <CircleDollarSign className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => setDeleting(d)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DebtForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} initial={editing} />
      <DebtPaymentModal
        debt={paying}
        remaining={paying ? projections[paying.id]?.remaining_amount ?? paying.original_amount : 0}
        onClose={() => setPaying(null)}
        onSaved={load}
      />
      <DebtDetailModal
        debt={viewing}
        onClose={() => setViewing(null)}
        onEdit={(d) => { setViewing(null); setEditing(d); setFormOpen(true) }}
        onPay={(d) => { setViewing(null); setPaying(d) }}
        onDelete={(d) => { setViewing(null); setDeleting(d) }}
      />
      <DebtTrashModal open={trashOpen} onClose={() => setTrashOpen(false)} onRestored={load} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Move to Trash?"
        message="This loan moves to Trash and can be restored within 30 days. After that it's permanently deleted, along with its payment history."
        confirmLabel="Move to Trash"
      />
    </div>
  )
}
