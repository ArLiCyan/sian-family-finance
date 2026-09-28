import { useEffect, useState, useCallback } from 'react'
import { Wallet, HandCoins, TrendingDown, Users, AlertTriangle, FileBarChart } from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import FinancialCard from '../../../components/financial/FinancialCard'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import { Select } from '../../../components/ui/FormField'
import { formatDate, formatDateShort } from '../../../lib/format'
import StoreMembersModal from '../StoreMembersModal'

export default function StoreDashboardTab({ family, isFamilyAdmin, onAccessChanged }) {
  const [capital, setCapital] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [latestReport, setLatestReport] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [membersOpen, setMembersOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: dash }, { data: systems }] = await Promise.all([
      supabase.from('business_funding_dashboard').select('*').eq('family_id', family.id).maybeSingle(),
      supabase.from('inventory_systems').select('id, name').eq('family_id', family.id).is('archived_at', null),
    ])
    setCapital(dash)

    const systemIds = (systems ?? []).map((s) => s.id)
    const systemNames = Object.fromEntries((systems ?? []).map((s) => [s.id, s.name]))
    if (!systemIds.length) {
      setLowStock([])
      setLatestReport(null)
      setProducts([])
      setLoading(false)
      return
    }

    const [{ data: allProducts }, { data: reports }] = await Promise.all([
      supabase.from('inventory_products').select('id, name, inventory_system_id').in('inventory_system_id', systemIds).is('archived_at', null).order('sort_order'),
      supabase.from('inventory_reports').select('id, report_date, inventory_system_id').in('inventory_system_id', systemIds).is('deleted_at', null).order('report_date', { ascending: false }).limit(1),
    ])
    setProducts(allProducts ?? [])

    if (reports?.length) {
      const latest = reports[0]
      const [{ count: productCount }, { count: lowCount }] = await Promise.all([
        supabase.from('inventory_products').select('id', { count: 'exact', head: true }).eq('inventory_system_id', latest.inventory_system_id).is('archived_at', null),
        supabase.from('inventory_report_calculations').select('report_item_id', { count: 'exact', head: true }).eq('report_id', latest.id).eq('is_low_stock', true),
      ])
      setLatestReport({ ...latest, systemName: systemNames[latest.inventory_system_id], productCount: productCount ?? 0, lowCount: lowCount ?? 0 })
    } else {
      setLatestReport(null)
    }

    // inventory_report_calculations is a view (built from joins), so it has
    // no foreign key PostgREST can auto-embed through. Fetch product names
    // separately and merge client-side, same as ReportDetailModal.
    const { data: low } = await supabase
      .from('inventory_report_calculations')
      .select('*')
      .eq('is_low_stock', true)
      .in('inventory_system_id', systemIds)
      .order('report_date', { ascending: false })
      .limit(50)

    const productNames = Object.fromEntries((allProducts ?? []).map((p) => [p.id, p.name]))

    // Keep only each product's most recent report row (the view has one row per report).
    const seen = new Set()
    const latestLow = []
    for (const row of low ?? []) {
      if (seen.has(row.product_id)) continue
      seen.add(row.product_id)
      latestLow.push({ ...row, product_name: productNames[row.product_id], system_name: systemNames[row.inventory_system_id] })
    }
    setLowStock(latestLow.slice(0, 5))
    setLoading(false)
  }, [family.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`store-dashboard-${family.id}`, [{ table: 'funding_repayments' }, { table: 'inventory_report_items' }], load)

  if (loading) return <LoadingState />

  const provided = Number(capital?.total_capital_provided ?? 0)
  const repaid = Number(capital?.total_repaid ?? 0)
  const remaining = Number(capital?.total_remaining ?? 0)
  const percentRepaid = provided > 0 ? Math.round((repaid / provided) * 100) : 0

  return (
    <div>
      {isFamilyAdmin && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setMembersOpen(true)}>
            <Users className="h-4 w-4" /> Store Access
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
        <FinancialCard label="Capital Provided" amount={provided} icon={Wallet} />
        <FinancialCard label="Total Repaid" amount={repaid} icon={HandCoins} tone="positive" />
        <FinancialCard label="Still to Repay" amount={remaining} icon={TrendingDown} tone="negative" />
        <FinancialCard
          label="Latest Inventory"
          amount={latestReport ? formatDateShort(latestReport.report_date) : 'No reports yet'}
          icon={FileBarChart}
          isCurrency={false}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-6">
        <RepaymentProgressCard provided={provided} repaid={repaid} remaining={remaining} percentRepaid={percentRepaid} />
        <InventoryActivityCard products={products} />
      </div>

      {latestReport && (
        <Card className="mb-6">
          <CardHeader title="Latest Inventory Report" subtitle={latestReport.systemName} />
          <p className="text-base text-gray-700 dark:text-gray-300">{formatDate(latestReport.report_date)}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {latestReport.productCount} product{latestReport.productCount === 1 ? '' : 's'}
            {latestReport.lowCount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {latestReport.lowCount} low stock</span>}
          </p>
        </Card>
      )}

      <Card>
        <CardHeader title="Low Stock" subtitle="Most recent report" />
        {lowStock.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Nothing running low" message="Items will show up here once a report puts them at or below their threshold." />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {lowStock.map((row) => (
              <div key={row.report_item_id} className="flex items-center justify-between py-2.5">
                <p className="text-base font-medium text-gray-900 dark:text-gray-100">{row.product_name}</p>
                <p className="text-base font-semibold text-amber-600 dark:text-amber-400">{row.ending_inventory} remaining</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <StoreMembersModal
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        family={family}
        onChanged={onAccessChanged}
      />
    </div>
  )
}

const REPAY_COLORS = ['#3d5f92', '#e5e7eb']

function RepaymentProgressCard({ provided, repaid, remaining, percentRepaid }) {
  const data = provided > 0 ? [{ name: 'Repaid', value: repaid }, { name: 'Remaining', value: remaining }] : [{ name: 'No funding yet', value: 1 }]

  return (
    <Card>
      <CardHeader title="Capital Repayment Progress" subtitle="How much of the money provided has been returned" />
      {provided === 0 ? (
        <EmptyState title="No funding recorded yet" message="Add a funding record in Business Capital to see progress here." />
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" innerRadius={45} outerRadius={65} startAngle={90} endAngle={-270}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={REPAY_COLORS[i % REPAY_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{percentRepaid}%</span>
              <span className="text-xs text-gray-400">Repaid</span>
            </div>
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="text-gray-500 dark:text-gray-400">{percentRepaid}% repaid, {100 - percentRepaid}% remaining</p>
            <p className="text-gray-700 dark:text-gray-300">Provided: <CurrencyDisplay amount={provided} className="font-medium" /></p>
            <p className="text-gray-700 dark:text-gray-300">Repaid: <CurrencyDisplay amount={repaid} className="font-medium text-sage-600 dark:text-sage-400" /></p>
            <p className="text-gray-700 dark:text-gray-300">Still to repay: <CurrencyDisplay amount={remaining} className="font-medium text-red-600 dark:text-red-400" /></p>
          </div>
        </div>
      )}
    </Card>
  )
}

function InventoryActivityCard({ products }) {
  const [productId, setProductId] = useState('')
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productId) {
      setHistory([])
      return
    }
    setLoading(true)
    supabase
      .from('inventory_report_calculations')
      .select('*')
      .eq('product_id', productId)
      .order('report_date', { ascending: true })
      .then(({ data }) => {
        setHistory(
          (data ?? []).map((r) => ({
            date: formatDateShort(r.report_date),
            Added: Number(r.quantity_purchased) || 0,
            Remaining: Number(r.ending_inventory) || 0,
            'Est. Sold': r.estimated_units_sold != null ? Number(r.estimated_units_sold) : 0,
          }))
        )
        setLoading(false)
      })
  }, [productId])

  return (
    <Card>
      <CardHeader title="Inventory Activity" subtitle="Stock movement over time for one item" />
      <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="mb-3 w-full sm:w-64">
        <option value="">Choose an item…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
      {!productId ? (
        <EmptyState title="Pick an item" message="Choose an item above to see how its stock has changed over time." />
      ) : loading ? (
        <LoadingState />
      ) : history.length === 0 ? (
        <EmptyState title="No reports yet" message="This item hasn't appeared in any saved report yet." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={32} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Added" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Remaining" fill="#3d5f92" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Est. Sold" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
