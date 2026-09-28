import { useEffect, useState, useCallback } from 'react'
import { Archive, Plus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { Field, Input } from '../../../components/ui/FormField'
import LoadingState from '../../../components/ui/LoadingState'
import FieldBuilder from './FieldBuilder'
import { slugifyFieldKey } from './fieldTypes'

export default function SettingsPanel({ system, canManage, onArchived }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [fields, setFields] = useState([])
  const [originalIds, setOriginalIds] = useState([])
  const [categories, setCategories] = useState([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: f }, { data: c }] = await Promise.all([
      supabase.from('inventory_fields').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_categories').select('*').eq('inventory_system_id', system.id).order('sort_order'),
    ])
    const rows = (f ?? []).map((row) => ({
      id: row.id,
      field_key: row.field_key,
      field_name: row.field_name,
      display_label: row.display_label,
      field_type: row.field_type,
      field_role: row.field_role || '',
      is_required: row.is_required,
      unit: row.unit || '',
      dropdown_options: Array.isArray(row.dropdown_options) ? row.dropdown_options.join(', ') : '',
      default_value: row.default_value || '',
    }))
    setFields(rows)
    setOriginalIds(rows.map((r) => r.id))
    setCategories(c ?? [])
    setLoading(false)
  }, [system.id])

  useEffect(() => {
    load()
  }, [load])

  async function handleSaveFields() {
    setSaving(true)
    setError('')

    const currentIds = fields.filter((f) => f.id).map((f) => f.id)
    const removedIds = originalIds.filter((id) => !currentIds.includes(id))

    if (removedIds.length) {
      const { error: archErr } = await supabase.from('inventory_fields').update({ archived_at: new Date().toISOString() }).in('id', removedIds)
      if (archErr) {
        setSaving(false)
        setError(archErr.message)
        return
      }
    }

    const usedKeys = new Set(fields.filter((f) => f.id).map((f) => f.field_key))
    for (const [i, f] of fields.entries()) {
      if (!f.field_name.trim()) continue
      const dropdownOptions = f.field_type === 'dropdown' && f.dropdown_options
        ? f.dropdown_options.split(',').map((o) => o.trim()).filter(Boolean)
        : null

      if (f.id) {
        const { error: updErr } = await supabase
          .from('inventory_fields')
          .update({
            field_name: f.field_name.trim(),
            display_label: f.display_label.trim() || f.field_name.trim(),
            field_type: f.field_type,
            field_role: f.field_role || null,
            is_required: f.is_required,
            unit: f.unit || null,
            dropdown_options: dropdownOptions,
            sort_order: i,
          })
          .eq('id', f.id)
        if (updErr) {
          setSaving(false)
          setError(updErr.message)
          return
        }
      } else {
        let key = slugifyFieldKey(f.field_name)
        while (usedKeys.has(key)) key = `${key}_${i}`
        usedKeys.add(key)
        const { error: insErr } = await supabase.from('inventory_fields').insert({
          inventory_system_id: system.id,
          field_key: key,
          field_name: f.field_name.trim(),
          display_label: f.display_label.trim() || f.field_name.trim(),
          field_type: f.field_type,
          field_role: f.field_role || null,
          is_required: f.is_required,
          unit: f.unit || null,
          dropdown_options: dropdownOptions,
          sort_order: i,
        })
        if (insErr) {
          setSaving(false)
          setError(insErr.message)
          return
        }
      }
    }

    setSaving(false)
    load()
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return
    const { error: err } = await supabase.from('inventory_categories').insert({ inventory_system_id: system.id, name: newCategoryName.trim(), sort_order: categories.length })
    if (err) {
      showToast(`Couldn't add category: ${err.message}`)
      return
    }
    setNewCategoryName('')
    load()
  }

  async function handleArchiveSystem() {
    setArchiving(true)
    const { error: err } = await supabase.from('inventory_systems').update({ archived_at: new Date().toISOString(), archived_by: profile.id }).eq('id', system.id)
    setArchiving(false)
    setConfirmArchiveOpen(false)
    if (err) {
      showToast(`Couldn't archive system: ${err.message}`)
      return
    }
    onArchived?.()
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Fields" subtitle="Add, remove, or reorder the fields tracked in every report for this system." />
        <FieldBuilder fields={fields} onChange={setFields} />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {canManage && (
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveFields} loading={saving}>Save Fields</Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Categories" subtitle="Group products for easier filtering." />
        <div className="mb-3 flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-400">No categories yet.</p>
          ) : (
            categories.map((c) => (
              <span key={c.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-sage-800 dark:text-gray-200">{c.name}</span>
            ))
          )}
        </div>
        {canManage && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="New Category">
                <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="e.g. Beverages" />
              </Field>
            </div>
            <Button variant="outline" onClick={addCategory}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        )}
      </Card>

      {canManage && (
        <Card>
          <CardHeader title="Archive System" subtitle="Hides this system from the Studio. Historical reports are kept." />
          <Button variant="danger" onClick={() => setConfirmArchiveOpen(true)}>
            <Archive className="h-4 w-4" /> Archive This System
          </Button>
        </Card>
      )}

      <ConfirmDialog
        open={confirmArchiveOpen}
        onClose={() => setConfirmArchiveOpen(false)}
        onConfirm={handleArchiveSystem}
        title="Archive Inventory System?"
        message={`"${system.name}" will be hidden from the Studio, but all of its historical reports stay intact and can still be exported.`}
        confirmLabel="Archive"
        loading={archiving}
      />
    </div>
  )
}
