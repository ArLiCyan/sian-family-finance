import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/FormField'

const PROJECT_TYPES = {
  home_improvement: 'Home Improvement',
  construction: 'Construction',
  vehicle: 'Vehicle',
  education: 'Education',
  family_event: 'Family Event',
  travel: 'Travel',
  emergency: 'Emergency',
  purchase: 'Purchase',
  other: 'Other',
}

export default function ProjectForm({ open, onClose, onSaved }) {
  const { profile, family } = useAuth()
  const [form, setForm] = useState({ name: '', description: '', project_type: 'other', budget: '', start_date: '', target_completion_date: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Project name is required.')
      return
    }
    setSaving(true)
    setError('')

    const { data: project, error: err } = await supabase
      .from('projects')
      .insert({
        family_id: family.id,
        name: form.name.trim(),
        description: form.description || null,
        project_type: form.project_type,
        budget: Number(form.budget) || 0,
        start_date: form.start_date || null,
        target_completion_date: form.target_completion_date || null,
        owner_profile_id: profile.id,
        created_by: profile.id,
        status: 'planning',
      })
      .select()
      .single()

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    await supabase.from('project_members').insert({ project_id: project.id, profile_id: profile.id, role: 'owner', can_approve_contributions: true, can_manage_expenses: true })

    setSaving(false)
    setForm({ name: '', description: '', project_type: 'other', budget: '', start_date: '', target_completion_date: '' })
    onSaved?.(project)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Family Project">
      <form onSubmit={handleSubmit}>
        <Field label="Project Name" required>
          <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. Garage Construction" autoFocus />
        </Field>
        <Field label="Description">
          <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project Type">
            <Select value={form.project_type} onChange={(e) => update('project_type', e.target.value)}>
              {Object.entries(PROJECT_TYPES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Total Budget (₱)" required>
            <Input type="number" min="0" step="0.01" value={form.budget} onChange={(e) => update('budget', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date">
            <Input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
          </Field>
          <Field label="Target Completion">
            <Input type="date" value={form.target_completion_date} onChange={(e) => update('target_completion_date', e.target.value)} />
          </Field>
        </div>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create Project
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export { PROJECT_TYPES }
