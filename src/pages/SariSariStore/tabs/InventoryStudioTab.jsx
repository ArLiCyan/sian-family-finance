import { useEffect, useState, useCallback } from 'react'
import { Plus, Package, ChevronLeft } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import LoadingState from '../../../components/ui/LoadingState'
import EmptyState from '../../../components/ui/EmptyState'
import CreateInventorySystemWizard from '../inventory/CreateInventorySystemWizard'
import InventoryWorkbookView from '../inventory/InventoryWorkbookView'

export default function InventoryStudioTab({ family, canManage }) {
  const [systems, setSystems] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('inventory_systems')
      .select('*')
      .eq('family_id', family.id)
      .is('archived_at', null)
      .order('created_at', { ascending: true })
    setSystems(data ?? [])
    if (data?.length) {
      const { data: products } = await supabase.from('inventory_products').select('inventory_system_id').in('inventory_system_id', data.map((s) => s.id)).is('archived_at', null)
      const c = {}
      for (const p of products ?? []) c[p.inventory_system_id] = (c[p.inventory_system_id] ?? 0) + 1
      setCounts(c)
    }
    setLoading(false)
  }, [family.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`inventory-systems-${family.id}`, [{ table: 'inventory_systems', filter: `family_id=eq.${family.id}` }], load)

  // With exactly one inventory system — the normal case — skip the picker
  // entirely and go straight to it, so "Inventory" opens directly into the
  // report workbook rather than an extra selection screen.
  useEffect(() => {
    if (!loading && systems.length === 1 && selectedId === null) {
      setSelectedId(systems[0].id)
    }
  }, [loading, systems, selectedId])

  if (selectedId) {
    const system = systems.find((s) => s.id === selectedId)
    return (
      <div>
        {systems.length > 1 && (
          <button
            onClick={() => setSelectedId(null)}
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ChevronLeft className="h-4 w-4" /> My Inventory Systems
          </button>
        )}
        {system && <InventoryWorkbookView system={system} canManage={canManage} onArchived={() => { setSelectedId(null); load() }} />}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">My Inventory Systems</p>
        {canManage && (
          <Button onClick={() => setWizardOpen(true)}>
            <Plus className="h-4 w-4" /> Create Inventory System
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : systems.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No inventory systems yet"
          message="Create one to start tracking stock — like a sari-sari store, household supplies, or home improvement materials."
          action={canManage && <Button onClick={() => setWizardOpen(true)}>Create Inventory System</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {systems.map((s) => (
            <Card key={s.id} className="cursor-pointer hover:border-sage-300 dark:hover:border-sage-600 transition-colors" onClick={() => setSelectedId(s.id)}>
              <div className="flex items-start justify-between mb-2">
                <p className="font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
                <Package className="h-4 w-4 text-gray-400" />
              </div>
              {s.description && <p className="text-xs text-gray-500 mb-2">{s.description}</p>}
              <p className="text-xs text-gray-400">{counts[s.id] ?? 0} products</p>
            </Card>
          ))}
        </div>
      )}

      <CreateInventorySystemWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        family={family}
        onCreated={(sys) => { load(); setSelectedId(sys.id) }}
      />
    </div>
  )
}
