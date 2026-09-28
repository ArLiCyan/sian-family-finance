import { useEffect, useState } from 'react'
import { Trash2, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/FormField'
import { loadDraft, saveDraft, clearDraft } from '../../lib/formDraft'

const today = () => new Date().toISOString().slice(0, 10)
const DRAFT_KEY = 'sian_debt_form_draft'
const blankForm = () => ({
  direction: 'borrowed',
  counterparty_name: '',
  original_amount: '',
  start_date: today(),
  due_date: '',
  installment_amount: '',
  due_day_of_month: '',
  principal_amount: '',
  interest_amount: '',
  fees_amount: '',
  notes: '',
})

export default function DebtForm({ open, onClose, onSaved, initial }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const isEdit = !!initial?.id
  const [form, setForm] = useState(blankForm)
  const [historicalPayments, setHistoricalPayments] = useState([])
  const [restoredDraft, setRestoredDraft] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    if (initial) {
      setForm({
        direction: initial.direction,
        counterparty_name: initial.counterparty_name,
        original_amount: initial.original_amount,
        start_date: initial.start_date ?? today(),
        due_date: initial.due_date ?? '',
        installment_amount: initial.installment_amount ?? '',
        due_day_of_month: initial.due_day_of_month ?? '',
        principal_amount: initial.principal_amount ?? '',
        interest_amount: initial.interest_amount ?? '',
        fees_amount: initial.fees_amount ?? '',
        notes: initial.notes ?? '',
      })
      setHistoricalPayments([])
      setRestoredDraft(false)
      setError('')
      return
    }

    // Creating new: recover an in-progress draft if the tab got reloaded
    // (e.g. the browser discarded a backgrounded tab) before it was saved.
    const draft = loadDraft(DRAFT_KEY)
    if (draft) {
      setForm(draft.form ?? blankForm())
      setHistoricalPayments(draft.historicalPayments ?? [])
      setRestoredDraft(true)
    } else {
      setForm(blankForm())
      setHistoricalPayments([])
      setRestoredDraft(false)
    }
    setError('')
  }, [open, initial])

  // Mirror every change to localStorage so a mid-typing reload never loses it.
  // Skip writing an all-empty form so a discard doesn't get immediately
  // re-saved as a "draft" that would just restore blank fields next time.
  useEffect(() => {
    if (!open || isEdit) return
    const isBlank = !form.counterparty_name && !form.original_amount && historicalPayments.length === 0
    if (isBlank) {
      clearDraft(DRAFT_KEY)
    } else {
      saveDraft(DRAFT_KEY, { form, historicalPayments })
    }
  }, [open, isEdit, form, historicalPayments])

  function discardDraft() {
    clearDraft(DRAFT_KEY)
    setForm(blankForm())
    setHistoricalPayments([])
    setRestoredDraft(false)
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function updatePayment(i, field, value) {
    setHistoricalPayments((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.counterparty_name.trim() || !form.original_amount || Number(form.original_amount) <= 0) {
      setError('Counterparty and a positive amount are required.')
      return
    }
    if (form.due_day_of_month && (Number(form.due_day_of_month) < 1 || Number(form.due_day_of_month) > 31)) {
      setError('Monthly due day must be between 1 and 31.')
      return
    }

    const validPayments = historicalPayments.filter((p) => p.date && Number(p.amount) > 0)
    const totalHistorical = validPayments.reduce((sum, p) => sum + Number(p.amount), 0)
    if (totalHistorical > Number(form.original_amount)) {
      setError("The payments you've already made add up to more than the loan amount — double-check the numbers.")
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      counterparty_name: form.counterparty_name.trim(),
      start_date: form.start_date || today(),
      due_date: form.due_date || null,
      installment_amount: form.installment_amount ? Number(form.installment_amount) : null,
      due_day_of_month: form.due_day_of_month ? Number(form.due_day_of_month) : null,
      principal_amount: form.principal_amount ? Number(form.principal_amount) : null,
      interest_amount: form.interest_amount ? Number(form.interest_amount) : null,
      fees_amount: form.fees_amount ? Number(form.fees_amount) : null,
      notes: form.notes || null,
    }

    if (isEdit) {
      const { error: err } = await supabase.from('debts').update(payload).eq('id', initial.id)
      setSaving(false)
      if (err) {
        setError(err.message)
        return
      }
      onSaved?.()
      onClose()
      return
    }

    const { data: debt, error: err } = await supabase
      .from('debts')
      .insert({
        ...payload,
        scope: mode,
        family_id: isFamily ? family.id : null,
        owner_profile_id: isFamily ? null : profile.id,
        direction: form.direction,
        original_amount: Number(form.original_amount),
        created_by: profile.id,
      })
      .select()
      .single()

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    if (validPayments.length > 0) {
      const { error: payErr } = await supabase.from('debt_payments').insert(
        validPayments.map((p) => ({
          debt_id: debt.id,
          amount: Number(p.amount),
          date: p.date,
          notes: 'Logged when adding this loan to the system',
          created_by: profile.id,
        }))
      )
      if (payErr) {
        setSaving(false)
        setError(`Loan was saved, but logging past payments failed: ${payErr.message}`)
        return
      }
    }

    setSaving(false)
    clearDraft(DRAFT_KEY)
    onSaved?.()
    onClose()
  }

  const breakdownSum = (Number(form.principal_amount) || 0) + (Number(form.interest_amount) || 0) + (Number(form.fees_amount) || 0)

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Debt / Loan' : 'Add Debt / Loan'} size="sm">
      <form onSubmit={handleSubmit}>
        {restoredDraft && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-sage-50 dark:bg-sage-900/40 px-3 py-2 text-xs text-sage-800 dark:text-sage-200">
            <span className="flex items-center gap-1.5">
              <RotateCcw className="h-3.5 w-3.5 shrink-0" /> Restored your unsaved draft from earlier.
            </span>
            <button type="button" onClick={discardDraft} className="font-medium underline shrink-0">
              Discard
            </button>
          </div>
        )}
        <Field label="Direction" required>
          <Select value={form.direction} onChange={(e) => update('direction', e.target.value)} disabled={isEdit}>
            <option value="borrowed">I borrowed money</option>
            <option value="lent">I lent money</option>
          </Select>
        </Field>
        <Field label={form.direction === 'borrowed' ? 'Lender' : 'Borrower'} required>
          <Input value={form.counterparty_name} onChange={(e) => update('counterparty_name', e.target.value)} autoFocus />
        </Field>
        <Field label="Total Loan Amount (₱)" required hint={isEdit ? 'The original amount cannot be changed once created.' : undefined}>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={form.original_amount}
            onChange={(e) => update('original_amount', e.target.value)}
            disabled={isEdit}
          />
        </Field>
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-sage-800 p-3">
          <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Loan breakdown (optional)</p>
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            For reference only — doesn't affect any calculation above, which always uses the Total Loan Amount.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Principal">
              <Input type="number" min="0" step="0.01" value={form.principal_amount} onChange={(e) => update('principal_amount', e.target.value)} />
            </Field>
            <Field label="Interest">
              <Input type="number" min="0" step="0.01" value={form.interest_amount} onChange={(e) => update('interest_amount', e.target.value)} />
            </Field>
            <Field label="Fees">
              <Input type="number" min="0" step="0.01" value={form.fees_amount} onChange={(e) => update('fees_amount', e.target.value)} />
            </Field>
          </div>
          {breakdownSum > 0 && (
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Adds up to <span className="font-medium text-gray-700 dark:text-gray-300">₱{breakdownSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </span>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => update('original_amount', breakdownSum.toFixed(2))}
                  className="font-medium text-sage-600 hover:underline dark:text-sage-400"
                >
                  Use as Total Loan Amount →
                </button>
              )}
            </div>
          )}
        </div>

        <Field label="Start Date" required hint="When the loan actually started — doesn't have to be today.">
          <Input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
        </Field>
        <Field label="Due Date">
          <Input type="date" value={form.due_date} onChange={(e) => update('due_date', e.target.value)} />
        </Field>
        <Field
          label="Expected Monthly Payment (₱)"
          hint="Optional. Set this to get an exact months-remaining countdown. If left blank, it's estimated from actual payment history instead."
        >
          <Input type="number" min="0.01" step="0.01" value={form.installment_amount} onChange={(e) => update('installment_amount', e.target.value)} />
        </Field>
        <Field
          label="Monthly Due Day"
          hint="Optional. E.g. 5 for 'every 5th of the month', like a Shopee or credit card bill. Leave blank to space installments a month apart from the start date instead."
        >
          <Input
            type="number"
            min="1"
            max="31"
            step="1"
            placeholder="e.g. 5"
            value={form.due_day_of_month}
            onChange={(e) => update('due_day_of_month', e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </Field>

        {!isEdit && (
          <div className="mb-4 rounded-lg border border-gray-200 dark:border-sage-800 p-3">
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Already made some payments?</p>
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              Migrating from a spreadsheet? Log what you've already paid so the balance and schedule start accurate from day one.
            </p>
            {historicalPayments.map((p, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Input type="date" value={p.date} onChange={(e) => updatePayment(i, 'date', e.target.value)} className="flex-1" />
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="₱ amount"
                  value={p.amount}
                  onChange={(e) => updatePayment(i, 'amount', e.target.value)}
                  className="w-32"
                />
                <button
                  type="button"
                  onClick={() => setHistoricalPayments((rows) => rows.filter((_, idx) => idx !== i))}
                  className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setHistoricalPayments((rows) => [...rows, { date: today(), amount: '' }])}
              className="text-sm text-sage-600 hover:underline dark:text-sage-400"
            >
              + Add a past payment
            </button>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save</Button>
        </div>
      </form>
    </Modal>
  )
}
