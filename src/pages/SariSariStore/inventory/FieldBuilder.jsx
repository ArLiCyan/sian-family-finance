import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import Button from '../../../components/ui/Button'
import { Field, Input, Select } from '../../../components/ui/FormField'
import { FIELD_TYPES, UNIT_OPTIONS } from './fieldTypes'

export function blankFieldRow() {
  return {
    field_name: '',
    display_label: '',
    field_type: 'quantity',
    field_role: '',
    is_required: false,
    unit: '',
    dropdown_options: '',
    default_value: '',
  }
}

// Shared add/remove/reorder/configure UI for a system's fields — used by both
// the creation wizard and the Settings panel's field editor. Dynamic-array
// pattern matches DebtForm.jsx's historical-payments rows.
export default function FieldBuilder({ fields, onChange }) {
  function update(i, patch) {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }
  function remove(i) {
    onChange(fields.filter((_, idx) => idx !== i))
  }
  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= fields.length) return
    const next = [...fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function add() {
    onChange([...fields, blankFieldRow()])
  }

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={i} className="rounded-lg border border-gray-200 dark:border-sage-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-gray-400">Field {i + 1}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-sage-800">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === fields.length - 1} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-sage-800">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Field Name">
              <Input value={f.field_name} onChange={(e) => update(i, { field_name: e.target.value })} placeholder="e.g. Added Stock" />
            </Field>
            <Field label="Display Label">
              <Input value={f.display_label} onChange={(e) => update(i, { display_label: e.target.value })} placeholder="e.g. Purchases / Dugang na Stock" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Field Type">
              <Select value={f.field_type} onChange={(e) => update(i, { field_type: e.target.value, field_role: '' })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Required?">
              <Select value={f.is_required ? 'yes' : 'no'} onChange={(e) => update(i, { is_required: e.target.value === 'yes' })}>
                <option value="no">Optional</option>
                <option value="yes">Required</option>
              </Select>
            </Field>
          </div>

          {f.field_type === 'quantity' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Unit">
                <Select value={f.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                  <option value="">No unit</option>
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Role in calculations" hint="Enables automatic Previous Value / Estimated Units Sold.">
                <Select value={f.field_role} onChange={(e) => update(i, { field_role: e.target.value })}>
                  <option value="">None</option>
                  <option value="quantity_purchased">Quantity Purchased</option>
                  <option value="ending_inventory">Ending Inventory</option>
                </Select>
              </Field>
            </div>
          )}

          {f.field_type === 'dropdown' && (
            <Field label="Options" hint="Comma-separated, e.g. Small, Medium, Large">
              <Input value={f.dropdown_options} onChange={(e) => update(i, { dropdown_options: e.target.value })} />
            </Field>
          )}
        </div>
      ))}

      <Button type="button" variant="outline" onClick={add} className="w-full">
        <Plus className="h-4 w-4" /> Add a Field
      </Button>
    </div>
  )
}
