import { useEffect, useState, useCallback } from 'react'
import { Plus, Archive, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Field, Input, Select } from '../../components/ui/FormField'
import Badge from '../../components/ui/Badge'
import LoadingState from '../../components/ui/LoadingState'

export default function CategoriesAdmin() {
  const { profile, family } = useAuth()
  const { showToast } = useToast()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'expense', scope: 'both' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    const { data } = await supabase.from('categories').select('*').eq('family_id', family.id).order('type').order('name')
    setCategories(data ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(cat) {
    const { error } = await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    if (error) {
      showToast(`Couldn't update category: ${error.message}`)
      return
    }
    load()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('categories').insert({ family_id: family.id, name: form.name.trim(), type: form.type, scope: form.scope, created_by: profile.id })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setForm({ name: '', type: 'expense', scope: 'both' })
    setOpen(false)
    load()
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Category</Button>
      </div>
      <Card padded={false}>
        <div className="divide-y divide-gray-100 dark:divide-sage-800">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                <Badge color={c.type === 'income' ? 'green' : 'gray'}>{c.type}</Badge>
                <Badge color="blue" className="capitalize">{c.scope}</Badge>
                {!c.is_active && <Badge color="red">Archived</Badge>}
              </div>
              <button onClick={() => toggleActive(c)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                {c.is_active ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Category" size="sm">
        <form onSubmit={handleSubmit}>
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </Field>
          <Field label="Type" required>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>
          <Field label="Availability" required>
            <Select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
              <option value="both">Family &amp; Private</option>
              <option value="family">Family Only</option>
              <option value="private">Private Only</option>
            </Select>
          </Field>
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
