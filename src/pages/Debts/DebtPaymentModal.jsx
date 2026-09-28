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
  const [locked, setLocked] = useState(false)

  // A debt with a fixed Expected Monthly Payment behaves like a Shopee-style
  // installment: default to that amount and lock the field, so it's not
  // accidentally under-paid. The last payment can be smaller than the fixed
  // amount if it would exceed what's left, and the lock can still be lifted
  // for a genuine partial/extra payment.
  const fixedAmount = debt?.installment_amount ? Math.min(Number(debt.installment_amount), Number(remaining)) : null

  useEffect(() => {
    if (fixedAmount != null) {
      setAmount(fixedAmount.toFixed(2))
      setLocked(true)
    } else {
      setAmount('')
      setLocked(false)
    }
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <Field
          label={
            <span className="flex items-center justify-between">
              Payment Amount (₱)
              {fixedAmount != null && (
                <button
                  type="button"
                  onClick={() => {
                    if (locked) {
                      setLocked(false)
                    } else {
                      setAmount(fixedAmount.toFixed(2))
                      setLocked(true)
                    }
                  }}
                  className="text-[11px] font-normal text-sage-600 hover:underline dark:text-sage-400"
                >
                  {locked ? 'Pay a different amount' : 'Use fixed monthly payment'}
                </button>
              )}
            </span>
          }
          required
          hint={locked ? `Fixed at your Expected Monthly Payment of ₱${fixedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}.` : undefined}
        >
          <Input
            type="number"
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={locked}
            autoFocus={!locked}
            className={locked ? 'cursor-not-allowed bg-gray-100 text-gray-500 dark:bg-sage-900 dark:text-gray-400' : ''}
          />
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
