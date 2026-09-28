import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../../components/layout/PageHeader'
import Tabs from '../../components/ui/Tabs'
import CategoriesAdmin from './CategoriesAdmin'
import AuditLogAdmin from './AuditLogAdmin'
import FamilySettingsAdmin from './FamilySettingsAdmin'

export default function Admin() {
  const { role } = useAuth()
  const [tab, setTab] = useState('categories')

  if (role !== 'owner' && role !== 'admin') return <Navigate to="/" replace />

  const tabs = [
    { value: 'categories', label: 'Categories' },
    { value: 'family', label: 'Family Settings' },
    { value: 'audit', label: 'Audit Log' },
  ]

  return (
    <div>
      <PageHeader title="Admin" subtitle="Manage categories, family settings, and view the audit trail" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'categories' && <CategoriesAdmin />}
      {tab === 'family' && <FamilySettingsAdmin />}
      {tab === 'audit' && <AuditLogAdmin />}
    </div>
  )
}
