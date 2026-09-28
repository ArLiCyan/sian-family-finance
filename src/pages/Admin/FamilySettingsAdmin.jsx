import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Card, { CardHeader } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/FormField'

export default function FamilySettingsAdmin() {
  const { family, role, refreshProfile } = useAuth()
  const [form, setForm] = useState({ name: '', currency: 'PHP', timezone: 'Asia/Manila' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const readOnly = role !== 'owner'

  useEffect(() => {
    if (family) setForm({ name: family.name, currency: family.currency, timezone: family.timezone })
  }, [family])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    await supabase.from('families').update({ name: form.name, currency: form.currency, timezone: form.timezone }).eq('id', family.id)
    setSaving(false)
    setSaved(true)
    refreshProfile()
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader title="Family Settings" subtitle="Applies to the whole SIAN Family" />
      <form onSubmit={handleSave} className="max-w-md">
        <Field label="Family Name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={readOnly} />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} disabled={readOnly}>
            <option value="PHP">PHP — Philippine Peso</option>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} disabled={readOnly}>
            <option value="Asia/Manila">Asia/Manila</option>
          </Select>
        </Field>
        {!readOnly && (
          <Button type="submit" loading={saving}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        )}
        {readOnly && <p className="text-xs text-gray-400">Only the Family Owner can change these settings.</p>}
      </form>
    </Card>
  )
}
