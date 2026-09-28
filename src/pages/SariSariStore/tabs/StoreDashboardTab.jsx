import { useEffect, useState, useCallback } from 'react'
import { Wallet, HandCoins, CircleCheck, TrendingDown, Users, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import FinancialCard from '../../../components/financial/FinancialCard'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import StoreMembersModal from '../StoreMembersModal'

export default function StoreDashboardTab({ family, isFamilyAdmin, onAccessChanged }) {
  const [capital, setCapital] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [membersOpen, setMembersOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: dash }, { data: systems }] = await Promise.all([
      supabase.from('business_funding_dashboard').select('*').eq('family_id', family.id).maybeSingle(),
      supabase.from('inventory_systems').select('id, name').eq('family_id', family.id),
    ])
    setCapital(dash)

    const systemIds = (systems ?? []).map((s) => s.id)
    const systemNames = Object.fromEntries((systems ?? []).map((s) => [s.id, s.name]))
    if (!systemIds.length) {
      setLowStock([])
      setLoading(false)
      return
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

    const productIds = [...new Set((low ?? []).map((r) => r.product_id))]
    let productNames = {}
    if (productIds.length) {
      const { data: prods } = await supabase.from('inventory_products').select('id, name').in('id', productIds)
      productNames = Object.fromEntries((prods ?? []).map((p) => [p.id, p.name]))
    }

    // Keep only each product's most recent report row (the view has one row per report).
    const seen = new Set()
    const latestLow = []
    for (const row of low ?? []) {
      if (seen.has(row.product_id)) continue
      seen.add(row.product_id)
      latestLow.push({ ...row, product_name: productNames[row.product_id], system_name: systemNames[row.inventory_system_id] })
    }
    setLowStock(latestLow)
    setLoading(false)
  }, [family.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`store-dashboard-${family.id}`, [{ table: 'funding_repayments' }, { table: 'inventory_report_items' }], load)

  if (loading) return <LoadingState />

  return (
    <div>
      {isFamilyAdmin && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" onClick={() => setMembersOpen(true)}>
            <Users className="h-4 w-4" /> Store Access
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-6">
        <FinancialCard label="Total Capital Provided" amount={capital?.total_capital_provided ?? 0} icon={Wallet} />
        <FinancialCard label="Total Repaid" amount={capital?.total_repaid ?? 0} icon={HandCoins} tone="positive" />
        <FinancialCard label="Still to Repay" amount={capital?.total_remaining ?? 0} icon={TrendingDown} tone="negative" />
        <FinancialCard label="Active Funding" amount={capital?.active_funding_count ?? 0} icon={AlertTriangle} isCurrency={false} />
        <FinancialCard label="Fully Repaid Funding" amount={capital?.fully_repaid_count ?? 0} icon={CircleCheck} isCurrency={false} />
      </div>

      <Card>
        <CardHeader title="Low Stock Alerts" subtitle="Products at or below their low-stock threshold, from the most recent report" />
        {lowStock.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Nothing running low" message="Products will show up here once a report puts them at or below their threshold." />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {lowStock.map((row) => (
              <div key={row.report_item_id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.product_name}</p>
                  <p className="text-xs text-gray-400">{row.system_name}</p>
                </div>
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {row.ending_inventory} left (threshold {row.low_stock_threshold})
                </p>
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
