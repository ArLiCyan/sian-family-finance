// Predefined field types the builder offers — never free-form/arbitrary.
export const FIELD_TYPES = [
  { value: 'product', label: 'Product / Item' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'money', label: 'Money' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'category', label: 'Category' },
  { value: 'unit', label: 'Unit' },
]

export const FIELD_TYPE_LABELS = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]))

export const UNIT_OPTIONS = ['pcs', 'bottle', 'pack', 'sachet', 'box', 'kg', 'liter', 'other']

export function slugifyFieldKey(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field'
}
