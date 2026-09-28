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
// Recording stock more than once on the same day is expected (a second
// delivery, correcting a count) — so this never treats "already has a report
// today" as a dead end. If one already exists, it's loaded as the baseline:
// Ending Inventory is pre-filled for correction (a fresh absolute count
// always replaces the old one), while Purchases only ever ADDS what you type
// on top of what's already logged, so nothing from an earlier entry today is
// silently lost or overwritten.
export default function CreateReportModal({ open, onClose, system, existingReport, onSaved }) {
  const { profile } = useAuth()
  const [activeReport, setActiveReport] = useState(existingReport ?? null)
  const isEdit = !!activeReport
  const [products, setProducts] = useState([])
  const [fields, setFields] = useState([])
  const [lastValues, setLastValues] = useState({}) // product_id -> previous report's values (for the "last time" hint)
  const [savedValues, setSavedValues] = useState({}) // product_id -> baseline values already persisted for activeReport
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [values, setValues] = useState({}) // product_id -> what's being typed right now (Ending = replace, Purchased = amount to add)
  const [expanded, setExpanded] = useState({}) // product_id -> true when "Restocked" is open
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const endingField = fields.find((f) => f.field_role === 'ending_inventory')
  const purchasedField = fields.find((f) => f.field_role === 'quantity_purchased')
  const otherFields = fields.filter((f) => f !== endingField && f !== purchasedField)

  async function loadForReport(report, systemId, dateForLastValues) {
    const [{ data: p }, { data: f }, { data: items }, { data: prevReport }] = await Promise.all([
      supabase.from('inventory_products').select('*').eq('inventory_system_id', systemId).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_fields').select('*').eq('inventory_system_id', systemId).is('archived_at', null).order('sort_order'),
      report ? supabase.from('inventory_report_items').select('*').eq('report_id', report.id) : Promise.resolve({ data: [] }),
      supabase
        .from('inventory_reports')
        .select('id')
        .eq('inventory_system_id', systemId)
        .lt('report_date', dateForLastValues)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setProducts(p ?? [])
    setFields(f ?? [])

    const baseline = {}
    for (const item of items ?? []) baseline[item.product_id] = { ...item.values }
    setSavedValues(baseline)

    // Pre-fill Ending Inventory only (a correction), never Purchases (always
    // starts blank — it represents a new addition on top of the baseline).
    const endingKey = (f ?? []).find((fl) => fl.field_role === 'ending_inventory')?.field_key
    if (endingKey) {
      const prefill = {}
      for (const [productId, v] of Object.entries(baseline)) {
        if (v?.[endingKey] != null) prefill[productId] = { [endingKey]: v[endingKey] }
      }
      setValues(prefill)
    } else {
      setValues({})
    }

    if (prevReport) {
      const { data: prevItems } = await supabase.from('inventory_report_items').select('product_id, values').eq('report_id', prevReport.id)
      setLastValues(Object.fromEntries((prevItems ?? []).map((i) => [i.product_id, i.values])))
    } else {
      setLastValues({})
    }
  }

  useEffect(() => {
    if (!open) return
    const initialReport = existingReport ?? null
    setActiveReport(initialReport)
    setReportDate(initialReport?.report_date ?? new Date().toISOString().slice(0, 10))
    setNotes(initialReport?.notes ?? '')
    setExpanded({})
    setError('')
    setNotice('')
    setLoading(true)
    loadForReport(initialReport, system.id, initialReport?.report_date ?? new Date().toISOString().slice(0, 10)).then(() => setLoading(false))
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

  function buildItemRows(reportId) {
    return products
      .map((p) => {
        const base = savedValues[p.id] ?? {}
        const merged = { ...base }

        if (endingField) {
          const v = values[p.id]?.[endingField.field_key]
          if (v !== undefined && v !== '') merged[endingField.field_key] = v
        }
        if (purchasedField) {
          const addAmount = Number(values[p.id]?.[purchasedField.field_key] || 0)
          if (addAmount > 0) {
            const existing = Number(base[purchasedField.field_key] || 0)
            merged[purchasedField.field_key] = existing + addAmount
          }
        }
        for (const f of otherFields) {
          const v = values[p.id]?.[f.field_key]
          if (v !== undefined && v !== '') merged[f.field_key] = v
        }

        if (Object.keys(merged).length === 0) return null
        return { report_id: reportId, product_id: p.id, values: merged }
      })
      .filter(Boolean)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    let report = activeReport
    if (!report) {
      const { data, error: reportErr } = await supabase
        .from('inventory_reports')
        .insert({ inventory_system_id: system.id, report_date: reportDate, notes: notes || null, created_by: profile.id })
        .select()
        .single()

      if (reportErr) {
        if (reportErr.message.includes('duplicate')) {
          // A report for this date already exists — merge into it instead of
          // blocking. Whatever the user already typed here takes priority
          // over the loaded baseline; nothing entered earlier today is lost.
          const { data: existing } = await supabase
            .from('inventory_reports')
            .select('*')
            .eq('inventory_system_id', system.id)
            .eq('report_date', reportDate)
            .is('deleted_at', null)
            .maybeSingle()
          if (existing) {
            await loadForReport(existing, system.id, reportDate)
            setActiveReport(existing)
            setSaving(false)
            setNotice('A report for this date already existed, so this was merged into it. Review below, then save again.')
            return
          }
        }
        setSaving(false)
        setError(reportErr.message)
        return
      }
      report = data
    } else if (notes !== (activeReport.notes ?? '')) {
      await supabase.from('inventory_reports').update({ notes: notes || null }).eq('id', activeReport.id)
    }

    const itemRows = buildItemRows(report.id)
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
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit Report — ${formatDate(activeReport.report_date)}` : 'Create Inventory Report'} size="lg">
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
          {notice && <p className="mb-3 text-sm text-sage-700 dark:text-sage-400">{notice}</p>}

          <div className="max-h-[55vh] overflow-y-auto space-y-2.5 pr-1">
            {products.map((p) => {
              const alreadyLogged = purchasedField ? Number(savedValues[p.id]?.[purchasedField.field_key] || 0) : 0
              return (
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
                          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                            {purchasedField.display_label}
                            {alreadyLogged > 0 ? ` — already logged today: ${alreadyLogged}. Add another delivery:` : ' — how many came in?'}
                          </label>
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
              )
            })}
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
