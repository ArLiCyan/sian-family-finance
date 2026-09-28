import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/FormField'

export default function AddFundingModal({ open, onClose, family, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({ amount: '', funding_date: new Date().toISOString().slice(0, 10), purpose: '', provided_by_name: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ amount: '', funding_date: new Date().toISOString().slice(0, 10), purpose: '', provided_by_name: '', notes: '' })
      setError('')
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('business_funding').insert({
      family_id: family.id,
      amount: Number(form.amount),
      funding_date: form.funding_date,
      purpose: form.purpose || null,
      provided_by_name: form.provided_by_name || null,
      interest_rate: 0,
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
    <Modal open={open} onClose={onClose} title="Add Funding" size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Amount Provided (₱)" required>
          <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} autoFocus />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={form.funding_date} onChange={(e) => setForm((f) => ({ ...f, funding_date: e.target.value }))} />
        </Field>
        <Field label="Purpose">
          <Input value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Inventory Capital" />
        </Field>
        <Field label="Provided By" hint="Who gave the money — e.g. Tita.">
          <Input value={form.provided_by_name} onChange={(e) => setForm((f) => ({ ...f, provided_by_name: e.target.value }))} />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
        </Field>
        <p className="mb-3 text-xs text-gray-400">This funding is interest-free, matching the family's arrangement.</p>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Funding</Button>
        </div>
      </form>
    </Modal>
  )
}
