import { useEffect, useState, useCallback } from 'react'
import { Plus, Target, PiggyBank } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import PageHeader from '../../components/layout/PageHeader'
import Card, { CardHeader } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Field, Input, Textarea } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { StatusBadge, goalStatusColor } from '../../components/ui/Badge'
import { formatDate } from '../../lib/format'

export default function Goals() {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [goals, setGoals] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [depositFor, setDepositFor] = useState(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase.from('goals').select('*').eq('scope', mode).order('created_at', { ascending: false })
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    const { data } = await query
    setGoals(data ?? [])
    if (data?.length) {
      const { data: prog } = await supabase.from('goal_progress').select('*').in('goal_id', data.map((g) => g.id))
      setProgress(Object.fromEntries((prog ?? []).map((p) => [p.goal_id, p])))
    }
    setLoading(false)
  }, [profile, family, mode, isFamily])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Goals' : 'My Goals'}
        subtitle="Track progress toward savings and purchase goals"
        action={<Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> New Goal</Button>}
      />

      {loading ? (
        <LoadingState />
      ) : goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" message="Create a goal like an emergency fund, new appliance, or vacation." action={<Button onClick={() => setFormOpen(true)}>Create Goal</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const p = progress[g.id]
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between mb-2">
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{g.name}</p>
                  <StatusBadge status={g.status} map={goalStatusColor} />
                </div>
                {g.description && <p className="text-xs text-gray-500 mb-3">{g.description}</p>}
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">
                    <CurrencyDisplay amount={p?.current_amount ?? 0} /> of <CurrencyDisplay amount={g.target_amount} />
                  </span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">{(p?.percentage_complete ?? 0).toFixed(0)}%</span>
                </div>
                <ProgressBar percent={p?.percentage_complete ?? 0} tone={p?.percentage_complete >= 100 ? 'green' : 'navy'} />
                {g.target_date && <p className="mt-2 text-xs text-gray-400">Target: {formatDate(g.target_date)}</p>}
                {g.status === 'active' && (
                  <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setDepositFor(g)}>
                    <PiggyBank className="h-3.5 w-3.5" /> Add Deposit
                  </Button>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <GoalForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      <DepositModal goal={depositFor} onClose={() => setDepositFor(null)} onSaved={load} />
    </div>
  )
}

function GoalForm({ open, onClose, onSaved }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [form, setForm] = useState({ name: '', description: '', target_amount: '', target_date: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ name: '', description: '', target_amount: '', target_date: '' })
      setError('')
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.target_amount || Number(form.target_amount) <= 0) {
      setError('Name and a positive target amount are required.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('goals').insert({
      scope: mode,
      family_id: isFamily ? family.id : null,
      owner_profile_id: isFamily ? null : profile.id,
      name: form.name.trim(),
      description: form.description || null,
      target_amount: Number(form.target_amount),
      target_date: form.target_date || null,
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
    <Modal open={open} onClose={onClose} title="New Goal" size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Goal Name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Emergency Fund" autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <Field label="Target Amount (₱)" required>
          <Input type="number" min="0.01" step="0.01" value={form.target_amount} onChange={(e) => setForm((f) => ({ ...f, target_amount: e.target.value }))} />
        </Field>
        <Field label="Target Date">
          <Input type="date" value={form.target_date} onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))} />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create Goal</Button>
        </div>
      </form>
    </Modal>
  )
}

function DepositModal({ goal, onClose, onSaved }) {
  const { profile } = useAuth()
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setAmount('')
    setError('')
  }, [goal])

  if (!goal) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('goal_contributions').insert({
      goal_id: goal.id,
      profile_id: profile.id,
      amount: Number(amount),
      date: new Date().toISOString().slice(0, 10),
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
    <Modal open={!!goal} onClose={onClose} title={`Add Deposit — ${goal.name}`} size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Amount (₱)" required>
          <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Add Deposit</Button>
        </div>
      </form>
    </Modal>
  )
}
