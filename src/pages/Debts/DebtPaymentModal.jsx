import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/FormField'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'

export default function DebtPaymentModal({ debt, remaining, onClose, onSaved }) {
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
      date,
      notes: notes || null,
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
        <Field label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
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
