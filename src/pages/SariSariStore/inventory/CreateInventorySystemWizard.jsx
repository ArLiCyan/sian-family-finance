import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/FormField'
import FieldBuilder, { blankFieldRow } from './FieldBuilder'
import { slugifyFieldKey } from './fieldTypes'

const STEPS = ['System Name', 'Fields', 'Calculations', 'Dashboard']

export default function CreateInventorySystemWizard({ open, onClose, family, onCreated }) {
  const { profile } = useAuth()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fields, setFields] = useState([blankFieldRow()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setStep(0)
      setName('')
      setDescription('')
      setFields([blankFieldRow()])
      setError('')
    }
  }, [open])

  const hasQuantityPurchased = fields.some((f) => f.field_role === 'quantity_purchased')
  const hasEndingInventory = fields.some((f) => f.field_role === 'ending_inventory')

  function next() {
    if (step === 0 && !name.trim()) {
      setError('Give the inventory system a name.')
      return
    }
    if (step === 1) {
      const cleaned = fields.filter((f) => f.field_name.trim())
      if (cleaned.length === 0) {
        setError('Add at least one field.')
        return
      }
    }
    setError('')
    setStep((s) => s + 1)
  }

  async function handleCreate() {
    setSaving(true)
    setError('')

    const { data: system, error: sysErr } = await supabase
      .from('inventory_systems')
      .insert({ family_id: family.id, name: name.trim(), description: description || null, created_by: profile.id })
      .select()
      .single()

    if (sysErr) {
      setSaving(false)
      setError(sysErr.message)
      return
    }

    const usedKeys = new Set()
    const fieldRows = fields
      .filter((f) => f.field_name.trim())
      .map((f, i) => {
        let key = slugifyFieldKey(f.field_name)
        while (usedKeys.has(key)) key = `${key}_${i}`
        usedKeys.add(key)
        return {
          inventory_system_id: system.id,
          field_key: key,
          field_name: f.field_name.trim(),
          display_label: f.display_label.trim() || f.field_name.trim(),
          field_type: f.field_type,
          field_role: f.field_role || null,
          is_required: f.is_required,
          unit: f.unit || null,
          dropdown_options: f.field_type === 'dropdown' && f.dropdown_options
            ? f.dropdown_options.split(',').map((o) => o.trim()).filter(Boolean)
            : null,
          default_value: f.default_value || null,
          sort_order: i,
        }
      })

    const { error: fieldsErr } = await supabase.from('inventory_fields').insert(fieldRows)
    setSaving(false)
    if (fieldsErr) {
      setError(fieldsErr.message)
      return
    }
    onCreated?.(system)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Inventory System" size="lg">
      <div className="mb-4 flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex-1 rounded-full px-2 py-1 text-center ${i === step ? 'bg-sage-700 text-white' : 'bg-gray-100 text-gray-500 dark:bg-sage-800 dark:text-gray-400'}`}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <Field label="System Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sari-Sari Store Inventory" autoFocus />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div>
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Add the fields you want to track for each product every time you create a report — e.g. how much stock was
            added, and how much is left at the end.
          </p>
          <FieldBuilder fields={fields} onChange={setFields} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            These calculations happen automatically based on the field roles you set — nothing to configure here.
          </p>
          <div className={`rounded-lg border p-3 text-sm ${hasEndingInventory ? 'border-sage-300 bg-sage-50 dark:border-sage-700 dark:bg-sage-900/40' : 'border-gray-200 dark:border-sage-800'}`}>
            <p className="font-medium text-gray-900 dark:text-gray-100">Previous Value & Low Stock Detection</p>
            <p className="text-gray-500 dark:text-gray-400">
              {hasEndingInventory
                ? 'Enabled — each report will automatically show the previous ending inventory, and flag products at or below their low-stock threshold.'
                : 'Mark a field with the "Ending Inventory" role to enable this.'}
            </p>
          </div>
          <div className={`rounded-lg border p-3 text-sm ${hasQuantityPurchased && hasEndingInventory ? 'border-sage-300 bg-sage-50 dark:border-sage-700 dark:bg-sage-900/40' : 'border-gray-200 dark:border-sage-800'}`}>
            <p className="font-medium text-gray-900 dark:text-gray-100">Estimated Units Sold</p>
            <p className="text-gray-500 dark:text-gray-400">
              {hasQuantityPurchased && hasEndingInventory
                ? 'Enabled — Previous Ending + Quantity Purchased − Current Ending, computed automatically for each report.'
                : 'Mark one field "Quantity Purchased" and another "Ending Inventory" to enable this.'}
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Low-stock alerts for this system will automatically appear on your InvenTrack Dashboard once you set a
            low-stock threshold on individual products (in the Products tab, after creating this system).
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-between">
        <Button variant="outline" type="button" onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>Next</Button>
        ) : (
          <Button type="button" onClick={handleCreate} loading={saving}>Create System</Button>
        )}
      </div>
    </Modal>
  )
}
