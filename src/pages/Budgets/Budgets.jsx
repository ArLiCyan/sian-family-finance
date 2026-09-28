import { useEffect, useState, useCallback } from 'react'
import { Plus, PiggyBank, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { getCategories } from '../../lib/api'
import PageHeader from '../../components/layout/PageHeader'
import Card, { CardHeader } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Field, Input, Select } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { getPresetRange } from '../../lib/dateRanges'

export default function Budgets() {
  const { profile, family, role } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const canManage = !isFamily || role === 'owner' || role === 'admin'

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase.from('budgets').select('*, budget_categories(*, categories(name))').eq('scope', mode).order('created_at', { ascending: false })
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    const { data } = await query
    const range = getPresetRange('this_month')

    const withSpend = await Promise.all(
      (data ?? []).map(async (b) => {
        const catIds = b.budget_categories.map((bc) => bc.category_id)
        if (!catIds.length) return { ...b, spendByCategory: {} }
        let txnQuery = supabase.from('transactions').select('amount, category_id').eq('scope', mode).eq('type', 'expense').in('category_id', catIds).is('deleted_at', null).gte('date', b.start_date || range.start).lte('date', b.end_date || range.end)
        txnQuery = isFamily ? txnQuery.eq('family_id', family?.id) : txnQuery.eq('owner_profile_id', profile.id)
        const { data: txns } = await txnQuery
        const spendByCategory = {}
        for (const t of txns ?? []) {
          spendByCategory[t.category_id] = (spendByCategory[t.category_id] ?? 0) + Number(t.amount)
        }
        return { ...b, spendByCategory }
      })
    )
    setBudgets(withSpend)
    setLoading(false)
  }, [profile, family, mode, isFamily])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Budgets' : 'My Budgets'}
        subtitle="Set spending limits by category and track progress"
        action={canManage && <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Budget</Button>}
      />

      {loading ? (
        <LoadingState />
      ) : budgets.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No budgets yet" message="Create a budget like Food ₱15,000/month to track spending." action={canManage && <Button onClick={() => setFormOpen(true)}>Create Budget</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {budgets.map((b) => {
            const totalLimit = b.budget_categories.reduce((s, bc) => s + Number(bc.amount_limit), 0)
            const totalSpend = Object.values(b.spendByCategory).reduce((s, v) => s + v, 0)
            const pct = totalLimit > 0 ? (totalSpend / totalLimit) * 100 : 0
            return (
              <Card key={b.id}>
                <CardHeader title={b.name} subtitle={`${b.period} budget`} />
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500"><CurrencyDisplay amount={totalSpend} /> of <CurrencyDisplay amount={totalLimit} /></span>
                  <span className="font-medium">{pct.toFixed(0)}%</span>
                </div>
                <ProgressBar percent={pct} tone={pct >= (b.critical_threshold_pct ?? 90) ? 'red' : pct >= (b.warning_threshold_pct ?? 75) ? 'amber' : 'green'} />
                <div className="mt-3 space-y-2">
                  {b.budget_categories.map((bc) => {
                    const spend = b.spendByCategory[bc.category_id] ?? 0
                    const catPct = bc.amount_limit > 0 ? (spend / bc.amount_limit) * 100 : 0
                    return (
                      <div key={bc.id}>
                        <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                          <span>{bc.categories?.name}</span>
                          <span><CurrencyDisplay amount={spend} /> / <CurrencyDisplay amount={bc.amount_limit} /></span>
                        </div>
                        <ProgressBar percent={catPct} height="h-1.5" tone={catPct >= 90 ? 'red' : catPct >= 75 ? 'amber' : 'navy'} />
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <BudgetForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
    </div>
  )
}

function BudgetForm({ open, onClose, onSaved }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [name, setName] = useState('')
  const [period, setPeriod] = useState('monthly')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([{ category_id: '', amount_limit: '' }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setPeriod('monthly')
      setRows([{ category_id: '', amount_limit: '' }])
      setError('')
      getCategories('expense').then(setCategories)
    }
  }, [open])

  function updateRow(i, field, value) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validRows = rows.filter((r) => r.category_id && Number(r.amount_limit) > 0)
    if (!name.trim() || validRows.length === 0) {
      setError('Name and at least one category limit are required.')
      return
    }
    setSaving(true)
    const { data: budget, error: err } = await supabase
      .from('budgets')
      .insert({
        scope: mode,
        family_id: isFamily ? family.id : null,
        owner_profile_id: isFamily ? null : profile.id,
        name: name.trim(),
        period,
        created_by: profile.id,
      })
      .select()
      .single()

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    await supabase.from('budget_categories').insert(validRows.map((r) => ({ budget_id: budget.id, category_id: r.category_id, amount_limit: Number(r.amount_limit) })))

    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Budget">
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Budget Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Essentials" autoFocus />
          </Field>
          <Field label="Period">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </Field>
        </div>

        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Category Limits</p>
        {rows.map((row, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <Select value={row.category_id} onChange={(e) => updateRow(i, 'category_id', e.target.value)} className="flex-1">
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input type="number" min="0" step="0.01" placeholder="₱ limit" value={row.amount_limit} onChange={(e) => updateRow(i, 'amount_limit', e.target.value)} className="w-32" />
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} className="rounded p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => setRows((r) => [...r, { category_id: '', amount_limit: '' }])} className="mb-4 text-sm text-sage-600 hover:underline dark:text-sage-400">
          + Add another category
        </button>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create Budget</Button>
        </div>
      </form>
    </Modal>
  )
}
