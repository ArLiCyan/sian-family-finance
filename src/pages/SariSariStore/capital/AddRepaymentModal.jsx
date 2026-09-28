import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/FormField'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'

// Repayments are always explicit — never derived from sales, inventory, or
// profit. This modal is the only way a funding's remaining balance changes.
export default function AddRepaymentModal({ funding, onClose, onSaved }) {
  const { profile } = useAuth()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError('')
  }, [funding])

  if (!funding) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('funding_repayments').insert({
      funding_id: funding.funding_id,
      amount: Number(amount),
      repayment_date: date,
      notes: notes || null,
      created_by: profile.id,
    })
    setSaving(false)
    if (err) {
      setError(err.message.includes('exceed') ? err.message : `Couldn't record repayment: ${err.message}`)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={!!funding} onClose={onClose} title="Add Repayment" size="sm">
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
        Remaining balance: <CurrencyDisplay amount={funding.remaining_amount} className="font-semibold" />
      </p>
      <form onSubmit={handleSubmit}>
        <Field label="Amount Repaid (₱)" required>
          <Input type="number" min="0.01" step="0.01" max={funding.remaining_amount} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Record Repayment</Button>
        </div>
      </form>
    </Modal>
  )
}
