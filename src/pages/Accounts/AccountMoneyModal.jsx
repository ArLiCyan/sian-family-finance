import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { Field, Input, Textarea } from '../../components/ui/FormField'

// Cash in (adds to the account) or cash out (deducts from it). Each one is
// recorded as a transaction on the account, so it shows up in the account's
// history, in Transactions, and in every balance automatically.
export default function AccountMoneyModal({ open, onClose, account, balance, mode, onSaved }) {
  const { profile } = useAuth()
  const isIn = mode === 'in'
  const today = () => new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ amount: '', date: today(), description: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ amount: '', date: today(), description: '', notes: '' })
      setError('')
    }
  }, [open, mode])

  if (!account) return null
  const amount = Number(form.amount) || 0
  const newBalance = balance + (isIn ? amount : -amount)

  async function handleSubmit(e) {
    e.preventDefault()
    if (amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('transactions').insert({
      scope: account.scope,
      family_id: account.scope === 'family' ? account.family_id : null,
      owner_profile_id: account.scope === 'private' ? account.owner_profile_id : null,
      type: isIn ? 'deposit' : 'withdrawal',
      amount,
      date: form.date,
      account_id: account.id,
      description: form.description.trim() || (isIn ? 'Cash in' : 'Cash out'),
      notes: form.notes.trim() || null,
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
    <Modal open={open} onClose={onClose} title={`${isIn ? 'Cash In' : 'Cash Out'} — ${account.name}`} size="sm">
      <form onSubmit={handleSubmit}>
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {isIn ? 'Money coming into this account.' : 'Money taken out of this account.'} Current balance:{' '}
          <CurrencyDisplay amount={balance} className="font-semibold text-gray-900 dark:text-gray-100" />
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)" required>
            <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} autoFocus />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
        </div>
        <Field label={isIn ? 'Where did it come from?' : 'What was it for?'} hint="Optional — shown in the account history.">
          <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder={isIn ? 'e.g. Rent income, Allowance' : 'e.g. Groceries, Cash handed to Mom'} />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>

        {amount > 0 && (
          <div className="mb-4 rounded-lg bg-sage-50 p-3 text-sm dark:bg-sage-800/50">
            <div className="flex justify-between text-gray-500">
              <span>Balance after</span>
              <CurrencyDisplay amount={newBalance} className={newBalance < 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'font-semibold text-gray-900 dark:text-gray-100'} />
            </div>
            {newBalance < 0 && <p className="mt-1 text-xs text-red-600 dark:text-red-400">This takes the account below zero.</p>}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={isIn ? 'primary' : 'danger'} loading={saving}>
            {isIn ? 'Add Money' : 'Take Money Out'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
