import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Modal from '../../../components/ui/Modal'
import Button from '../../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../../components/ui/FormField'
import LoadingState from '../../../components/ui/LoadingState'
import { formatDate } from '../../../lib/format'

// A simplified, one-question-per-product list instead of a spreadsheet-style
// grid — most products aren't restocked most weeks, so only "how many do you
// have right now" is shown by default; "Restocked this week" is a collapsed
// toggle most people never need to open. See CreateReportModal.grid-backup.jsx
// for the original table version if this doesn't work out.
//
// Pass `existingReport` to edit an already-saved report instead of creating a
// new one — upserts on submit instead of inserting.
export default function CreateReportModal({ open, onClose, system, existingReport, onSaved }) {
  const { profile } = useAuth()
  const isEdit = !!existingReport
  const [products, setProducts] = useState([])
  const [fields, setFields] = useState([])
  const [lastValues, setLastValues] = useState({}) // product_id -> previous report's values
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [values, setValues] = useState({})
  const [expanded, setExpanded] = useState({}) // product_id -> true when "Restocked" is open
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const endingField = fields.find((f) => f.field_role === 'ending_inventory')
  const purchasedField = fields.find((f) => f.field_role === 'quantity_purchased')
  const otherFields = fields.filter((f) => f !== endingField && f !== purchasedField)

  useEffect(() => {
    if (!open) return
    setReportDate(existingReport?.report_date ?? new Date().toISOString().slice(0, 10))
    setNotes(existingReport?.notes ?? '')
    setValues({})
    setExpanded({})
    setError('')
    setLoading(true)

    Promise.all([
      supabase.from('inventory_products').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_fields').select('*').eq('inventory_system_id', system.id).is('archived_at', null).order('sort_order'),
      isEdit
        ? supabase.from('inventory_report_items').select('*').eq('report_id', existingReport.id)
        : Promise.resolve({ data: [] }),
      // The most recent earlier report, to show "last time: X" next to each
      // product — purely informational, never pre-filled as if already answered.
      supabase
        .from('inventory_reports')
        .select('id')
        .eq('inventory_system_id', system.id)
        .lt('report_date', existingReport?.report_date ?? new Date().toISOString().slice(0, 10))
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(async ([{ data: p }, { data: f }, { data: items }, { data: prevReport }]) => {
      setProducts(p ?? [])
      setFields(f ?? [])

      if (items?.length) {
        const prefill = {}
        for (const item of items) prefill[item.product_id] = { ...item.values }
        setValues(prefill)

        const purchasedKey = (f ?? []).find((fl) => fl.field_role === 'quantity_purchased')?.field_key
        if (purchasedKey) {
          const toExpand = {}
          for (const item of items) {
            const v = item.values?.[purchasedKey]
            if (v !== undefined && v !== null && v !== '') toExpand[item.product_id] = true
          }
          setExpanded(toExpand)
        }
      }

      if (prevReport) {
        const { data: prevItems } = await supabase.from('inventory_report_items').select('product_id, values').eq('report_id', prevReport.id)
        setLastValues(Object.fromEntries((prevItems ?? []).map((i) => [i.product_id, i.values])))
      } else {
        setLastValues({})
      }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, system.id, existingReport?.id])

  function setCell(productId, fieldKey, value) {
    setValues((v) => ({ ...v, [productId]: { ...v[productId], [fieldKey]: value } }))
  }

  function toggleExpanded(productId) {
    setExpanded((e) => ({ ...e, [productId]: !e[productId] }))
  }

  function renderInput(product, field, big) {
    const value = values[product.id]?.[field.field_key] ?? ''
    const bigStyle = big ? { width: 90, height: 48, fontSize: 20, textAlign: 'center' } : { width: '100%' }
    if (field.field_type === 'yes_no') {
      return (
        <Select value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      )
    }
    if (field.field_type === 'dropdown' && Array.isArray(field.dropdown_options)) {
      return (
        <Select value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)}>
          <option value="">—</option>
          {field.dropdown_options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      )
    }
    if (field.field_type === 'date') {
      return <Input type="date" value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} style={bigStyle} />
    }
    if (field.field_type === 'quantity' || field.field_type === 'money') {
      return <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} style={bigStyle} />
    }
    return <Input value={value} onChange={(e) => setCell(product.id, field.field_key, e.target.value)} style={bigStyle} />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    let report = existingReport
    if (!isEdit) {
      const { data, error: reportErr } = await supabase
        .from('inventory_reports')
        .insert({ inventory_system_id: system.id, report_date: reportDate, notes: notes || null, created_by: profile.id })
        .select()
        .single()
      if (reportErr) {
        setSaving(false)
        setError(reportErr.message.includes('duplicate') ? 'A report for this date already exists for this system — open it from the list to edit it instead.' : reportErr.message)
        return
      }
      report = data
    } else if (notes !== (existingReport.notes ?? '')) {
      await supabase.from('inventory_reports').update({ notes: notes || null }).eq('id', existingReport.id)
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
      const { error: itemsErr } = await supabase.from('inventory_report_items').upsert(itemRows, { onConflict: 'report_id,product_id' })
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
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Report — ${formatDate(existingReport.report_date)}` : 'Create Inventory Report'} size="lg">
      {loading ? (
        <LoadingState />
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Field label="Report Date" required hint={isEdit ? "Can't be changed once created." : undefined}>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} disabled={isEdit} />
            </Field>
            <Field label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </Field>
          </div>

          {endingField && (
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Just answer "{endingField.display_label}" for each item. Only open "Restocked" if new stock came in.
            </p>
          )}

          <div className="max-h-[55vh] overflow-y-auto space-y-2.5 pr-1">
            {products.map((p) => (
              <div key={p.id} className="rounded-lg bg-gray-50 dark:bg-sage-950 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                    {endingField && (
                      <p className="text-xs text-gray-400">
                        {lastValues[p.id]?.[endingField.field_key] != null
                          ? `Last time: ${lastValues[p.id][endingField.field_key]}`
                          : 'No previous count yet'}
                      </p>
                    )}
                  </div>
                  {endingField && renderInput(p, endingField, true)}
                </div>

                {purchasedField && (
                  <>
                    {!expanded[p.id] ? (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(p.id)}
                        className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:border-sage-700 dark:text-gray-300 dark:hover:bg-sage-800"
                      >
                        <Plus className="h-3.5 w-3.5" /> Restocked this week
                      </button>
                    ) : (
                      <div className="mt-2.5">
                        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{purchasedField.display_label} — how many came in?</label>
                        {renderInput(p, purchasedField, false)}
                      </div>
                    )}
                  </>
                )}

                {otherFields.map((f) => (
                  <div key={f.id} className="mt-2.5">
                    <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{f.display_label}</label>
                    {renderInput(p, f, false)}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>{isEdit ? 'Save Changes' : 'Save Report'}</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
