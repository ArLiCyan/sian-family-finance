import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Store } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../../components/layout/PageHeader'
import Tabs from '../../components/ui/Tabs'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'

import StoreDashboardTab from './tabs/StoreDashboardTab'
import InventoryStudioTab from './tabs/InventoryStudioTab'
import BusinessCapitalTab from './tabs/BusinessCapitalTab'
import RepaymentsTab from './tabs/RepaymentsTab'
import StoreReportsTab from './tabs/StoreReportsTab'

const TABS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'inventory', label: 'Inventory Studio' },
  { value: 'capital', label: 'Business Capital' },
  { value: 'repayments', label: 'Repayments' },
  { value: 'reports', label: 'Reports' },
]

// Access here is purely a UI convenience (a friendly "not authorized" message
// and hiding manage buttons). The real boundary is the database RLS on every
// store_* / inventory_* / business_funding / funding_repayments table, which
// enforces the exact same rule independently of what this page renders.
export default function SariSariStore() {
  const [searchParams] = useSearchParams()
  const { profile, family, role } = useAuth()
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(searchParams.get('tab') || 'dashboard')

  const load = useCallback(async () => {
    if (!family || !profile) return
    setLoading(true)
    const { data } = await supabase
      .from('store_members')
      .select('*')
      .eq('family_id', family.id)
      .eq('profile_id', profile.id)
      .maybeSingle()
    setMembership(data ?? null)
    setLoading(false)
  }, [family, profile])

  useEffect(() => {
    load()
  }, [load])

  const isFamilyAdmin = role === 'owner' || role === 'admin'
  const canManageInventory = isFamilyAdmin || membership?.role === 'owner' || !!membership?.can_manage_inventory
  const canManageCapital = isFamilyAdmin || membership?.role === 'owner' || !!membership?.can_manage_capital
  const hasAccess = isFamilyAdmin || !!membership

  if (loading) return <LoadingState label="Loading InvenTrack…" />

  if (!hasAccess) {
    return (
      <div>
        <PageHeader title="InvenTrack" subtitle="Inventory and business capital tracking" />
        <EmptyState
          icon={Store}
          title="Not authorized"
          message="You don't have access to InvenTrack yet. Ask a family admin to grant you access."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="InvenTrack" subtitle="Inventory and business capital tracking" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'dashboard' && (
        <StoreDashboardTab family={family} isFamilyAdmin={isFamilyAdmin} onAccessChanged={load} />
      )}
      {tab === 'inventory' && <InventoryStudioTab family={family} canManage={canManageInventory} />}
      {tab === 'capital' && <BusinessCapitalTab family={family} canManage={canManageCapital} />}
      {tab === 'repayments' && <RepaymentsTab family={family} canManage={canManageCapital} />}
      {tab === 'reports' && <StoreReportsTab family={family} />}
    </div>
  )
}
