import { useEffect, useState, useCallback } from 'react'
import { Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { getCategories, TRANSACTION_TYPE_LABELS } from '../../lib/api'
import { getPresetRange, rangePresets } from '../../lib/dateRanges'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Select, Input } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import FinancialCard from '../../components/financial/FinancialCard'
import { formatDateShort } from '../../lib/format'
import { TrendingUp, TrendingDown, Scale } from 'lucide-react'

export default function Reports() {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [preset, setPreset] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  const range = preset === 'custom' && customStart && customEnd ? { start: customStart, end: customEnd } : getPresetRange(preset)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, categories(name), profiles!transactions_created_by_fkey(display_name)')
      .eq('scope', mode)
      .is('deleted_at', null)
      .gte('date', range.start)
      .lte('date', range.end)
      .order('date', { ascending: false })
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    if (typeFilter) query = query.eq('type', typeFilter)
    if (categoryFilter) query = query.eq('category_id', categoryFilter)
    const { data } = await query
    setRows(data ?? [])
    setCategories(await getCategories())
    setLoading(false)
  }, [profile, family, mode, isFamily, range.start, range.end, typeFilter, categoryFilter])

  useEffect(() => {
    load()
  }, [load])

  const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
  const expenses = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)

  function exportCsv() {
    const header = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Recorded By']
    const lines = rows.map((r) => [
      r.date,
      TRANSACTION_TYPE_LABELS[r.type],
      r.categories?.name ?? '',
      (r.description ?? '').replace(/,/g, ';'),
      r.amount,
      r.profiles?.display_name ?? '',
    ])
    const csv = [header, ...lines].map((line) => line.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sian-finance-report-${range.start}-to-${range.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Reports' : 'My Reports'}
        subtitle="Filter and export your financial records"
        action={<Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}><Download className="h-4 w-4" /> Export CSV</Button>}
      />

      <Card className="mb-5 flex flex-wrap gap-3" padded>
        <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-40">
          {rangePresets.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
          <option value="custom">Custom Range</option>
        </Select>
        {preset === 'custom' && (
          <>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" />
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" />
          </>
        )}
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-44">
          <option value="">All Types</option>
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-44">
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Card>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <FinancialCard label="Income" amount={income} icon={TrendingUp} tone="positive" />
        <FinancialCard label="Expenses" amount={expenses} icon={TrendingDown} tone="negative" />
        <FinancialCard label="Net" amount={income - expenses} icon={Scale} />
      </div>

      <Card>
        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState title="No records for this filter" message="Adjust the date range or filters above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-gray-500">{formatDateShort(r.date)}</td>
                    <td className="py-2 pr-3">{TRANSACTION_TYPE_LABELS[r.type]}</td>
                    <td className="py-2 pr-3 text-gray-500">{r.categories?.name ?? '—'}</td>
                    <td className="py-2 pr-3">{r.description ?? '—'}</td>
                    <td className="py-2 pr-3 text-right font-medium"><CurrencyDisplay amount={r.amount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
