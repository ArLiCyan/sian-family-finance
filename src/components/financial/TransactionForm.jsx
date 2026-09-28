import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { getAccountsWithBalances, getCategories, TRANSACTION_TYPE_LABELS } from '../../lib/api'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/FormField'

const TYPE_OPTIONS = ['income', 'expense', 'transfer', 'withdrawal', 'deposit', 'refund', 'debt_payment', 'loan_received', 'loan_given', 'adjustment']

export default function TransactionForm({ open, onClose, onSaved, initial }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(emptyForm())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function emptyForm() {
    return {
      type: 'expense',
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      account_id: '',
      to_account_id: '',
      category_id: '',
      description: '',
      merchant: '',
      payment_method: '',
      notes: '',
    }
  }

  useEffect(() => {
    if (!open) return
    setForm(initial ? { ...emptyForm(), ...initial } : emptyForm())
    setError('')
    async function load() {
      const { accounts: accs } = await getAccountsWithBalances(
        isFamily ? { scope: 'family', familyId: family?.id } : { scope: 'private', profileId: profile?.id }
      )
      setAccounts(accs)
      setCategories(await getCategories())
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const categoryType = form.type === 'income' || form.type === 'deposit' || form.type === 'refund' || form.type === 'loan_received' ? 'income' : 'expense'
  const filteredCategories = categories.filter((c) => c.type === categoryType)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Enter a valid amount greater than zero.')
      return
    }
    if (!form.account_id) {
      setError('Select an account.')
      return
    }
    if (form.type === 'transfer' && (!form.to_account_id || form.to_account_id === form.account_id)) {
      setError('Select a different destination account for the transfer.')
      return
    }
    setSaving(true)

    const payload = {
      scope: mode,
      family_id: isFamily ? family.id : null,
      owner_profile_id: isFamily ? null : profile.id,
      type: form.type,
      amount: Number(form.amount),
      date: form.date,
      account_id: form.account_id,
      to_account_id: form.type === 'transfer' ? form.to_account_id : null,
      category_id: form.category_id || null,
      description: form.description || null,
      merchant: form.merchant || null,
      payment_method: form.payment_method || null,
      notes: form.notes || null,
      created_by: profile.id,
    }

    const { error: err } = initial?.id
      ? await supabase.from('transactions').update(payload).eq('id', initial.id)
      : await supabase.from('transactions').insert(payload)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit Transaction' : 'Add Transaction'}>
      <form onSubmit={handleSubmit}>
        <Field label="Type" required>
          <Select value={form.type} onChange={(e) => update('type', e.target.value)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TRANSACTION_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₱)" required>
            <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => update('amount', e.target.value)} autoFocus />
          </Field>
          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
          </Field>
        </div>

        <Field label={form.type === 'transfer' ? 'From Account' : 'Account'} required>
          <Select value={form.account_id} onChange={(e) => update('account_id', e.target.value)}>
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        {form.type === 'transfer' && (
          <Field label="To Account" required>
            <Select value={form.to_account_id} onChange={(e) => update('to_account_id', e.target.value)}>
              <option value="">Select destination account</option>
              {accounts
                .filter((a) => a.id !== form.account_id)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}

        {form.type !== 'transfer' && (
          <Field label="Category">
            <Select value={form.category_id} onChange={(e) => update('category_id', e.target.value)}>
              <option value="">Uncategorized</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Description">
          <Input value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="e.g. Weekly groceries" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Merchant / Vendor">
            <Input value={form.merchant} onChange={(e) => update('merchant', e.target.value)} />
          </Field>
          <Field label="Payment Method">
            <Input value={form.payment_method} onChange={(e) => update('payment_method', e.target.value)} placeholder="Cash, GCash…" />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </Field>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {initial?.id ? 'Save Changes' : 'Save Transaction'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
