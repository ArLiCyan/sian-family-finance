import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { exportToCsv, exportToXls, exportToPdf } from '../../../lib/exportUtils'
import Card, { CardHeader } from '../../../components/ui/Card'
import ExportMenu from '../../../components/ui/ExportMenu'

// A cross-cutting export page — distinct from the Inventory Studio's own
// per-system report history. Reuses the same export tooling as the site-wide
// Reports and Projects pages.
export default function StoreReportsTab({ family }) {
  const [loading, setLoading] = useState(false)

  async function fetchInventoryRows() {
    // inventory_report_calculations is a view (built from joins), so it has
    // no foreign key PostgREST can auto-embed through. Resolve systems/
    // products separately and merge client-side, same as ReportDetailModal.
    const { data: systems } = await supabase.from('inventory_systems').select('id, name').eq('family_id', family.id)
    const systemIds = (systems ?? []).map((s) => s.id)
    const systemNames = Object.fromEntries((systems ?? []).map((s) => [s.id, s.name]))
    if (!systemIds.length) return []

    const { data } = await supabase
      .from('inventory_report_calculations')
      .select('*')
      .in('inventory_system_id', systemIds)
      .order('report_date', { ascending: false })

    const productIds = [...new Set((data ?? []).map((r) => r.product_id))]
    let productNames = {}
    if (productIds.length) {
      const { data: prods } = await supabase.from('inventory_products').select('id, name').in('id', productIds)
      productNames = Object.fromEntries((prods ?? []).map((p) => [p.id, p.name]))
    }

    return (data ?? [])
      .map((r) => [
        systemNames[r.inventory_system_id] ?? '',
        productNames[r.product_id] ?? '',
        r.report_date,
        r.quantity_purchased ?? '',
        r.ending_inventory ?? '',
        r.previous_ending_inventory ?? '',
        r.estimated_units_sold ?? '',
        r.is_low_stock ? 'Yes' : 'No',
      ])
  }

  async function fetchCapitalRows() {
    const { data: fundingRows } = await supabase.from('business_funding').select('id, purpose, funding_date').eq('family_id', family.id)
    const fundingMap = Object.fromEntries((fundingRows ?? []).map((f, i) => [f.id, { ...f, displayNumber: i + 1 }]))
    const fundingIds = (fundingRows ?? []).map((f) => f.id)
    if (!fundingIds.length) return []
    const { data } = await supabase.from('funding_repayments').select('*').in('funding_id', fundingIds).order('repayment_date', { ascending: false })
    return (data ?? []).map((r) => [
      `Funding #${String(fundingMap[r.funding_id]?.displayNumber ?? 0).padStart(3, '0')}`,
      fundingMap[r.funding_id]?.purpose ?? '',
      r.repayment_date,
      Number(r.amount).toFixed(2),
      r.notes ?? '',
    ])
  }

  const inventoryHeaders = ['System', 'Product', 'Report Date', 'Purchased', 'Ending Inventory', 'Previous Ending', 'Estimated Sold', 'Low Stock']
  const capitalHeaders = ['Funding', 'Purpose', 'Repayment Date', 'Amount', 'Notes']

  async function withLoading(fn) {
    setLoading(true)
    try {
      await fn()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Inventory History Export" subtitle="Every report line, across every inventory system" />
        <ExportMenu
          disabled={loading}
          onCsv={() => withLoading(async () => exportToCsv('sari-sari-inventory-history.csv', inventoryHeaders, await fetchInventoryRows()))}
          onXls={() => withLoading(async () => exportToXls('sari-sari-inventory-history.xls', inventoryHeaders, await fetchInventoryRows(), 'Inventory History'))}
          onPdf={() => withLoading(async () => exportToPdf('sari-sari-inventory-history.pdf', { title: 'Sari-Sari Store — Inventory History', headers: inventoryHeaders, rows: await fetchInventoryRows() }))}
        />
      </Card>
      <Card>
        <CardHeader title="Capital & Repayments Export" subtitle="Every repayment across every funding record" />
        <ExportMenu
          disabled={loading}
          onCsv={() => withLoading(async () => exportToCsv('sari-sari-capital-repayments.csv', capitalHeaders, await fetchCapitalRows()))}
          onXls={() => withLoading(async () => exportToXls('sari-sari-capital-repayments.xls', capitalHeaders, await fetchCapitalRows(), 'Repayments'))}
          onPdf={() => withLoading(async () => exportToPdf('sari-sari-capital-repayments.pdf', { title: 'Sari-Sari Store — Capital & Repayments', headers: capitalHeaders, rows: await fetchCapitalRows() }))}
        />
      </Card>
    </div>
  )
}
