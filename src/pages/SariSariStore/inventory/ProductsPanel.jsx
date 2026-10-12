import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Archive, Pencil, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { Field, Input, Select } from '../../../components/ui/FormField'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import { UNIT_OPTIONS } from './fieldTypes'

export default function ProductsPanel({ system, canManage }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: prods }, { data: cats }, { data: cols }] = await Promise.all([
      supabase.from('inventory_products').select('*, inventory_categories(name)').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_categories').select('*').eq('inventory_system_id', system.id).order('sort_order'),
      supabase.from('inventory_product_fields').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order').order('created_at'),
    ])
    setProducts(prods ?? [])
    setCategories(cats ?? [])
    setColumns(cols ?? [])
    setLoading(false)
  }, [system.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`inventory-products-${system.id}`, [{ table: 'inventory_products', filter: `inventory_system_id=eq.${system.id}` }], load)

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter && p.category_id !== categoryFilter) return false
    return true
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-8" />
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-44">
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        {canManage && (
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        )}
      </div>

      <Card padded={false}>
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState title="No products found" message="Add products to start tracking stock for this system." />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {filtered.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {p.inventory_categories?.name ?? 'Uncategorized'}{p.unit ? ` · ${p.unit}` : ''}
                    {p.low_stock_threshold != null ? ` · low stock below ${p.low_stock_threshold}` : ''}
                  </p>
                  {columns.some((c) => hasValue(p.custom_values?.[c.id])) && (
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500 dark:text-gray-400">
                      {columns.filter((c) => hasValue(p.custom_values?.[c.id])).map((c) => (
                        <span key={c.id}>
                          {c.name}: <span className="font-medium text-gray-700 dark:text-gray-300">{formatValue(c, p.custom_values[c.id])}</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {p.price != null && (
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      <CurrencyDisplay amount={p.price} /> <span className="text-xs font-normal text-gray-400">each</span>
                    </p>
                  )}
                  {canManage && (
                    <button
                      onClick={() => { setEditing(p); setFormOpen(true) }}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ProductFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        system={system}
        categories={categories}
        columns={columns}
        initial={editing}
        onSaved={load}
        onColumnsChanged={load}
      />
    </div>
  )
}

const COLUMN_TYPES = { text: 'Words (e.g. supplier name)', number: 'Number (e.g. pieces per case)', money: 'Price in pesos' }
const hasValue = (v) => v !== undefined && v !== null && v !== ''
function formatValue(column, value) {
  if (column.field_type === 'money') return `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return String(value)
}

const ADD_CUSTOM = '__new__'

// Extra details are per product: a product only shows the details you added to it.
// Pick one from the list, or choose the last option to create a brand-new column.
function ProductFormModal({ open, onClose, system, categories, columns, initial, onSaved, onColumnsChanged }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const isEdit = !!initial?.id
  const [form, setForm] = useState({ name: '', category_id: '', unit: '', low_stock_threshold: '', price: '' })
  const [custom, setCustom] = useState({})
  const [active, setActive] = useState([]) // ids of the extra details this product uses
  const [created, setCreated] = useState([]) // columns made from this window, before the list refreshes
  const [newColumn, setNewColumn] = useState(null) // { name, type } while the "new column" box is open
  const [creating, setCreating] = useState(false)

  const allColumns = [...columns, ...created.filter((c) => !columns.some((x) => x.id === c.id))]
  const activeColumns = active.map((id) => allColumns.find((c) => c.id === id)).filter(Boolean)
  const availableColumns = allColumns.filter((c) => !active.includes(c.id))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        category_id: initial?.category_id ?? '',
        unit: initial?.unit ?? '',
        low_stock_threshold: initial?.low_stock_threshold ?? '',
        price: initial?.price ?? '',
      })
      const existing = Object.entries(initial?.custom_values ?? {}).filter(([, v]) => v !== null && v !== '')
      setCustom(Object.fromEntries(existing.map(([k, v]) => [k, String(v)])))
      setActive(existing.map(([k]) => k))
      setCreated([])
      setNewColumn(null)
      setError('')
    }
  }, [open, initial])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Enter a product name.')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      unit: form.unit || null,
      low_stock_threshold: form.low_stock_threshold ? Math.round(Number(form.low_stock_threshold)) : null,
      price: form.price ? Number(form.price) : null,
      custom_values: (() => {
        const values = { ...(initial?.custom_values ?? {}) }
        for (const c of allColumns) {
          const raw = active.includes(c.id) ? (custom[c.id] ?? '').toString().trim() : ''
          if (raw === '') delete values[c.id]
          else values[c.id] = c.field_type === 'text' ? raw : Number(raw)
        }
        return values
      })(),
    }
    const { error: err } = isEdit
      ? await supabase.from('inventory_products').update(payload).eq('id', initial.id)
      : await supabase.from('inventory_products').insert({ ...payload, inventory_system_id: system.id, created_by: profile.id })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onClose()
  }

  function pickDetail(value) {
    if (value === ADD_CUSTOM) {
      setNewColumn({ name: '', type: 'money' })
    } else if (value) {
      setActive((a) => [...a, value])
    }
  }

  async function createColumn() {
    const name = newColumn?.name.trim()
    if (!name) {
      setError('Type a name for the new column.')
      return
    }
    setCreating(true)
    setError('')
    const { data, error: err } = await supabase
      .from('inventory_product_fields')
      .insert({ inventory_system_id: system.id, name, field_type: newColumn.type, sort_order: allColumns.length + 1, created_by: profile.id })
      .select()
      .single()
    setCreating(false)
    if (err) {
      setError(err.message.includes('duplicate') ? 'You already have a column with that name. Pick it from the list instead.' : err.message)
      return
    }
    setCreated((c) => [...c, data])
    setActive((a) => [...a, data.id])
    setNewColumn(null)
    onColumnsChanged?.()
  }

  async function handleArchive() {
    const { error: err } = await supabase.from('inventory_products').update({ archived_at: new Date().toISOString(), archived_by: profile.id }).eq('id', initial.id)
    if (err) {
      showToast(`Couldn't archive product: ${err.message}`)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Product' : 'Add Product'} size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Product Name" required>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
        </Field>
        <Field label="Category">
          <Select value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Unit">
          <Select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
            <option value="">No unit</option>
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Select>
        </Field>
        <Field label="Low Stock Threshold" hint="Get flagged on the Dashboard when ending inventory drops to or below this.">
          <Input type="number" min="0" step="1" inputMode="numeric" value={form.low_stock_threshold} onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))} />
        </Field>
        <Field label="Price per Piece (₱)" hint="Optional reference price — for display only, doesn't affect any calculation.">
          <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
        </Field>
        {activeColumns.map((c) => (
          <Field key={c.id} label={`${c.name}${c.field_type === 'money' ? ' (₱)' : ''}`}>
            <div className="flex items-center gap-2">
              <Input
                type={c.field_type === 'text' ? 'text' : 'number'}
                min={c.field_type === 'text' ? undefined : '0'}
                step={c.field_type === 'money' ? '0.01' : c.field_type === 'number' ? 'any' : undefined}
                value={custom[c.id] ?? ''}
                onChange={(e) => setCustom((v) => ({ ...v, [c.id]: e.target.value }))}
              />
              <button
                type="button"
                title="Remove this detail from the product"
                onClick={() => setActive((a) => a.filter((id) => id !== c.id))}
                className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </Field>
        ))}

        {newColumn ? (
          <div className="mb-4 rounded-lg border border-gray-200 p-3 dark:border-sage-800">
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">New column for this product</p>
            <Field label="Column name">
              <Input
                value={newColumn.name}
                onChange={(e) => setNewColumn((n) => ({ ...n, name: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createColumn()
                  }
                }}
                placeholder="e.g. Pieces per case"
                autoFocus
              />
            </Field>
            <Field label="What goes in it?">
              <Select value={newColumn.type} onChange={(e) => setNewColumn((n) => ({ ...n, type: e.target.value }))}>
                {Object.entries(COLUMN_TYPES).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setNewColumn(null)}>Cancel</Button>
              <Button type="button" onClick={createColumn} loading={creating}>Add Column</Button>
            </div>
          </div>
        ) : (
          <Field label="Extra details" hint="Only add what this product needs, like a price per case for softdrinks. Other products stay clean.">
            <Select value="" onChange={(e) => pickDetail(e.target.value)}>
              <option value="">Add a detail…</option>
              {availableColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value={ADD_CUSTOM}>＋ Add Custom Column…</option>
            </Select>
          </Field>
        )}
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-between gap-2">
          {isEdit ? (
            <button type="button" onClick={handleArchive} className="text-sm text-red-600 hover:underline inline-flex items-center gap-1">
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
