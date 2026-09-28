import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../../components/ui/FormField'
import LoadingState from '../../../components/ui/LoadingState'

export default function CreateReportModal({ open, onClose, system, onSaved }) {
  const { profile } = useAuth()
  const [products, setProducts] = useState([])
  const [fields, setFields] = useState([])
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setReportDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setValues({})
    setError('')
    setLoading(true)
    Promise.all([
      supabase.from('inventory_products').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_fields').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
    ]).then(([{ data: p }, { data: f }]) => {
      setProducts(p ?? [])
      setFields(f ?? [])
      setLoading(false)
    })
  }, [open, system.id])

  function setCell(productId, fieldKey, value) {
    setValues((v) => ({ ...v, [productId]: { ...v[productId], [fieldKey]: value } }))
  }

  function renderCellInput(product, field) {
    const value = values[product.id]?.[field.field_key] ?? ''
    if (field.field_type === 'yes_no') {
      return (
        <Select value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} className="w-24">
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      )
    }
    if (field.field_type === 'dropdown' && Array.isArray(field.dropdown_options)) {
      return (
        <Select value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} className="w-32">
          <option value="">—</option>
          {field.dropdown_options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      )
    }
    if (field.field_type === 'date') {
      return <Input type="date" value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} className="w-36" />
    }
    if (field.field_type === 'quantity' || field.field_type === 'money') {
      return <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} className="w-24" />
    }
    return <Input value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} className="w-32" />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data: report, error: reportErr } = await supabase
      .from('inventory_reports')
      .insert({ inventory_system_id: system.id, report_date: reportDate, notes: notes || null, created_by: profile.id })
      .select()
      .single()

    if (reportErr) {
      setSaving(false)
      setError(reportErr.message.includes('duplicate') ? 'A report for this date already exists for this system.' : reportErr.message)
      return
    }

    const itemRows = products
      .map((p) => {
        const rowValues = values[p.id] ?? {}
        const cleaned = Object.fromEntries(Object.entries(rowValues).filter(([, v]) => v !== '' && v != null))
        if (Object.keys(cleaned).length === 0) return null
        return { report_id: report.id, product_id: p.id, values: cleaned }
      })
      .filter(Boolean)

    if (itemRows.length) {
      const { error: itemsErr } = await supabase.from('inventory_report_items').insert(itemRows)
      if (itemsErr) {
        setSaving(false)
        setError(itemsErr.message)
        return
      }
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Inventory Report" size="xl">
      {loading ? (
        <LoadingState />
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Field label="Report Date" required>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
          </div>

          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Only products you enter a value for will be saved — leave the rest blank if unchanged.
          </p>

          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-sage-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-sage-950">
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pl-3 pr-3">Product</th>
                  {fields.map((f) => (
                    <th key={f.id} className="py-2 pr-3">{f.display_label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5 pl-3 pr-3 text-gray-800 dark:text-gray-200">{p.name}</td>
                    {fields.map((f) => (
                      <td key={f.id} className="py-1.5 pr-3">{renderCellInput(p, f)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>Save Report</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
