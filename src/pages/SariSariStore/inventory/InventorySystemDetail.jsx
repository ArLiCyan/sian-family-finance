import { useState } from 'react'
import Tabs from '../../../components/ui/Tabs'
import ProductsPanel from './ProductsPanel'
import ReportsPanel from './ReportsPanel'
import SettingsPanel from './SettingsPanel'

const TABS = [
  { value: 'products', label: 'Products' },
  { value: 'reports', label: 'Reports' },
  { value: 'settings', label: 'Settings' },
]

export default function InventorySystemDetail({ system, canManage, onArchived }) {
  const [tab, setTab] = useState('products')

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100">{system.name}</h2>
      {system.description && <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{system.description}</p>}

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'products' && <ProductsPanel system={system} canManage={canManage} />}
      {tab === 'reports' && <ReportsPanel system={system} canManage={canManage} />}
      {tab === 'settings' && <SettingsPanel system={system} canManage={canManage} onArchived={onArchived} />}
    </div>
  )
}
