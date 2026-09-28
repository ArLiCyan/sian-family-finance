import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { getCategories, getAccountsWithBalances } from '../../../lib/api'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { Field, Input, Select, Textarea } from '../../../components/ui/FormField'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingState from '../../../components/ui/LoadingState'
import { formatDateShort } from '../../../lib/format'

export default function ProjectExpensesTab({ project, canManage, onChange }) {
  const { profile } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), vendor: '', description: '', category_id: '', account_id: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('project_expenses')
      .select('*, categories(name)')
      .eq('project_id', project.id)
      .is('deleted_at', null)
      .order('date', { ascending: false })
    setExpenses(data ?? [])
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    load()
    getCategories('expense').then(setCategories)
    getAccountsWithBalances({ scope: 'family', familyId: project.family_id }).then(({ accounts: a }) => setAccounts(a))
  }, [load, project.family_id])

  useRealtimeRefresh(`project-expenses-${project.id}`, [{ table: 'project_expenses', filter: `project_id=eq.${project.id}` }], load)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0 || !form.description.trim()) {
      setError('Amount and description are required.')
      return
    }
    setSaving(true)
    setError('')

    const description = form.description.trim()
    const { data: expense, error: err } = await supabase
      .from('project_expenses')
      .insert({
        project_id: project.id,
        amount: Number(form.amount),
        date: form.date,
        vendor: form.vendor || null,
        description,
        category_id: form.category_id || null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    // Mirror the expense into the family transactions ledger so it counts
    // toward the Dashboard's Expenses total, chart, and Recent Transactions —
    // project expenses previously never touched that ledger at all.
    const { data: txn } = await supabase
      .from('transactions')
      .insert({
        scope: 'family',
        family_id: project.family_id,
        type: 'expense',
        amount: Number(form.amount),
        date: form.date,
        account_id: form.account_id || null,
        category_id: form.category_id || null,
        project_id: project.id,
        description: `${description} — ${project.name}`,
        merchant: form.vendor || null,
        created_by: profile.id,
      })
      .select()
      .single()
    if (txn) {
      await supabase.from('project_expenses').update({ transaction_id: txn.id }).eq('id', expense.id)
    }

    setSaving(false)
    setForm({ amount: '', date: new Date().toISOString().slice(0, 10), vendor: '', description: '', category_id: '', account_id: '' })
    setOpen(false)
    load()
    onChange?.()
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Total spent: <CurrencyDisplay amount={total} className="font-semibold text-gray-900 dark:text-gray-100" />
        </p>
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Expense
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title="Project Expenses" />
        {loading ? (
          <LoadingState />
        ) : expenses.length === 0 ? (
          <EmptyState title="No expenses recorded" message="Expenses like materials and labor will appear here." />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.description}</p>
                  <p className="text-xs text-gray-400">
                    {formatDateShort(e.date)} {e.vendor && `· ${e.vendor}`} {e.categories && `· ${e.categories.name}`}
                  </p>
                </div>
                <CurrencyDisplay amount={e.amount} className="font-semibold text-red-600 dark:text-red-400" />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Project Expense">
        <form onSubmit={handleSubmit}>
          <Field label="Description" required>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Cement, Labor" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" required>
              <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </Field>
          </div>
          <Field label="Vendor">
            <Input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} />
          </Field>
          <Field label="Category">
            <Select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Paid From Account (optional)" hint="If set, this amount will be deducted from that family account's balance.">
            <Select value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}>
              <option value="">Don't track source account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Expense</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
