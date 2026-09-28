import { useEffect, useState, useCallback } from 'react'
import { Plus, Search, Archive, Pencil } from 'lucide-react'
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
import { UNIT_OPTIONS } from './fieldTypes'

export default function ProductsPanel({ system, canManage }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('inventory_products').select('*, inventory_categories(name)').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_categories').select('*').eq('inventory_system_id', system.id).order('sort_order'),
    ])
    setProducts(prods ?? [])
    setCategories(cats ?? [])
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
                </div>
                {canManage && (
                  <button
                    onClick={() => { setEditing(p); setFormOpen(true) }}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
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
        initial={editing}
        onSaved={load}
      />
    </div>
  )
}

function ProductFormModal({ open, onClose, system, categories, initial, onSaved }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const isEdit = !!initial?.id
  const [form, setForm] = useState({ name: '', category_id: '', unit: '', low_stock_threshold: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? '',
        category_id: initial?.category_id ?? '',
        unit: initial?.unit ?? '',
        low_stock_threshold: initial?.low_stock_threshold ?? '',
      })
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
      low_stock_threshold: form.low_stock_threshold ? Number(form.low_stock_threshold) : null,
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
          <Input type="number" min="0" step="0.01" value={form.low_stock_threshold} onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))} />
        </Field>
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
