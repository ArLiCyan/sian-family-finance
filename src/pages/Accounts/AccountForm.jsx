import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { ACCOUNT_TYPE_LABELS } from '../../lib/api'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/FormField'

export default function AccountForm({ open, onClose, onSaved, initial }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [form, setForm] = useState({ name: '', account_type: 'cash', starting_balance: '0', description: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initial ? { name: initial.name, account_type: initial.account_type, starting_balance: initial.starting_balance, description: initial.description ?? '' } : { name: '', account_type: 'cash', starting_balance: '0', description: '' })
      setError('')
    }
  }, [open, initial])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Account name is required.')
      return
    }
    setSaving(true)
    setError('')

    const payload = {
      scope: mode,
      family_id: isFamily ? family.id : null,
      owner_profile_id: isFamily ? null : profile.id,
      name: form.name.trim(),
      account_type: form.account_type,
      starting_balance: Number(form.starting_balance) || 0,
      description: form.description || null,
      created_by: profile.id,
    }

    const { error: err } = initial?.id
      ? await supabase.from('financial_accounts').update({ name: payload.name, account_type: payload.account_type, description: payload.description }).eq('id', initial.id)
      : await supabase.from('financial_accounts').insert(payload)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={initial?.id ? 'Edit Account' : 'Add Account'} size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Account Name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. GCash" autoFocus />
        </Field>
        <Field label="Account Type" required>
          <Select value={form.account_type} onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        {!initial?.id && (
          <Field label="Starting Balance (₱)" required hint="Balances after this are calculated automatically from transactions.">
            <Input type="number" step="0.01" value={form.starting_balance} onChange={(e) => setForm((f) => ({ ...f, starting_balance: e.target.value }))} />
          </Field>
        )}
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
