import { useEffect, useState, useCallback } from 'react'
import { Plus, Landmark, CircleDollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge, debtStatusColor } from '../../components/ui/Badge'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { formatDate } from '../../lib/format'

export default function Debts() {
  const { profile, family, role } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [debts, setDebts] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [paying, setPaying] = useState(null)
  const canManage = !isFamily || role === 'owner' || role === 'admin'

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase.from('debts').select('*').eq('scope', mode).order('created_at', { ascending: false })
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    const { data } = await query
    setDebts(data ?? [])
    if (data?.length) {
      const { data: bals } = await supabase.from('debt_balances').select('*').in('debt_id', data.map((d) => d.id))
      setBalances(Object.fromEntries((bals ?? []).map((b) => [b.debt_id, Number(b.remaining_amount)])))
    }
    setLoading(false)
  }, [profile, family, mode, isFamily])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Debts & Loans' : 'My Debts & Loans'}
        subtitle="Money borrowed or lent, with automatic balance tracking"
        action={canManage && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Add Debt</Button>}
      />

      {loading ? (
        <LoadingState />
      ) : debts.length === 0 ? (
        <EmptyState icon={Landmark} title="No debts recorded" message="Track money borrowed or lent, with payments and remaining balances." action={canManage && <Button onClick={() => setFormOpen(true)}>Add Debt</Button>} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3">Counterparty</th>
                  <th className="py-2 pr-3">Direction</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3 text-right">Original</th>
                  <th className="py-2 pr-3 text-right">Remaining</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {debts.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{d.counterparty_name}</td>
                    <td className="py-2.5 pr-3 capitalize text-gray-500">{d.direction}</td>
                    <td className="py-2.5 pr-3 text-gray-500">{d.due_date ? formatDate(d.due_date) : '—'}</td>
                    <td className="py-2.5 pr-3 text-right"><CurrencyDisplay amount={d.original_amount} /></td>
                    <td className="py-2.5 pr-3 text-right font-semibold"><CurrencyDisplay amount={balances[d.id] ?? d.original_amount} /></td>
                    <td className="py-2.5 pr-3"><StatusBadge status={d.status} map={debtStatusColor} /></td>
                    <td className="py-2.5 pl-3 text-right">
                      {d.status !== 'paid' && d.status !== 'cancelled' && (
                        <button onClick={() => setPaying(d)} className="rounded p-1.5 text-sage-600 hover:bg-sage-50 dark:hover:bg-sage-800">
                          <CircleDollarSign className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DebtForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      <PaymentModal debt={paying} remaining={paying ? balances[paying.id] ?? paying.original_amount : 0} onClose={() => setPaying(null)} onSaved={load} />
    </div>
  )
}

function DebtForm({ open, onClose, onSaved }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [form, setForm] = useState({ direction: 'borrowed', counterparty_name: '', original_amount: '', due_date: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ direction: 'borrowed', counterparty_name: '', original_amount: '', due_date: '', notes: '' })
      setError('')
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.counterparty_name.trim() || !form.original_amount || Number(form.original_amount) <= 0) {
      setError('Counterparty and a positive amount are required.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('debts').insert({
      scope: mode,
      family_id: isFamily ? family.id : null,
      owner_profile_id: isFamily ? null : profile.id,
      direction: form.direction,
      counterparty_name: form.counterparty_name.trim(),
      original_amount: Number(form.original_amount),
      due_date: form.due_date || null,
      notes: form.notes || null,
      created_by: profile.id,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Debt / Loan" size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Direction" required>
          <Select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
            <option value="borrowed">I borrowed money</option>
            <option value="lent">I lent money</option>
          </Select>
        </Field>
        <Field label={form.direction === 'borrowed' ? 'Lender' : 'Borrower'} required>
          <Input value={form.counterparty_name} onChange={(e) => setForm((f) => ({ ...f, counterparty_name: e.target.value }))} autoFocus />
        </Field>
        <Field label="Amount (₱)" required>
          <Input type="number" min="0.01" step="0.01" value={form.original_amount} onChange={(e) => setForm((f) => ({ ...f, original_amount: e.target.value }))} />
        </Field>
        <Field label="Due Date">
          <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}

function PaymentModal({ debt, remaining, onClose, onSaved }) {
  const { profile } = useAuth()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAmount('')
    setError('')
  }, [debt])

  if (!debt) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid payment amount.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('debt_payments').insert({
      debt_id: debt.id,
      amount: Number(amount),
      date: new Date().toISOString().slice(0, 10),
      created_by: profile.id,
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={!!debt} onClose={onClose} title={`Record Payment — ${debt.counterparty_name}`} size="sm">
      <form onSubmit={handleSubmit}>
        <p className="mb-3 text-sm text-gray-500">
          Remaining balance: <CurrencyDisplay amount={remaining} className="font-semibold" />
        </p>
        <Field label="Payment Amount (₱)" required>
          <Input type="number" min="0.01" step="0.01" max={remaining} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Record Payment</Button>
        </div>
      </form>
    </Modal>
  )
}
