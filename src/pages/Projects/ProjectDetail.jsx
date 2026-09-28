import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import LoadingState from '../../components/ui/LoadingState'
import Card from '../../components/ui/Card'
import Tabs from '../../components/ui/Tabs'
import { StatusBadge, projectStatusColor } from '../../components/ui/Badge'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { Select } from '../../components/ui/FormField'
import { PROJECT_TYPES } from './ProjectForm'

import ProjectOverviewTab from './tabs/ProjectOverviewTab'
import ProjectContributionsTab from './tabs/ProjectContributionsTab'
import ProjectExpensesTab from './tabs/ProjectExpensesTab'
import ProjectMembersTab from './tabs/ProjectMembersTab'
import ProjectActivityTab from './tabs/ProjectActivityTab'
import ProjectDocumentsTab from './tabs/ProjectDocumentsTab'

const STATUS_OPTIONS = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

export default function ProjectDetail() {
  const { id } = useParams()
  const { profile, role } = useAuth()
  const { showToast } = useToast()
  const [project, setProject] = useState(null)
  const [summary, setSummary] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')

  const canManage = members.some((m) => m.profile_id === profile?.id && (m.role === 'owner' || m.can_approve_contributions || m.can_manage_expenses)) || role === 'owner' || role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    const { data: p } = await supabase.from('projects').select('*').eq('id', id).single()
    setProject(p)
    const { data: s } = await supabase.from('project_financial_summary').select('*').eq('project_id', id).single()
    setSummary(s)
    const { data: m } = await supabase.from('project_members').select('*, profiles(display_name, profile_photo_url)').eq('project_id', id)
    setMembers(m ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function updateStatus(status) {
    const { error } = await supabase.from('projects').update({ status }).eq('id', id)
    if (error) {
      showToast(`Couldn't update project status: ${error.message}`)
      return
    }
    load()
  }

  if (loading || !project) return <LoadingState label="Loading project…" />

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'contributions', label: 'Contributions' },
    { value: 'expenses', label: 'Expenses' },
    { value: 'members', label: 'Members' },
    { value: 'documents', label: 'Documents' },
    { value: 'activity', label: 'Activity' },
  ]

  return (
    <div>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <ChevronLeft className="h-4 w-4" /> All Projects
      </Link>

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{project.name}</h1>
              <StatusBadge status={project.status} map={projectStatusColor} />
            </div>
            <p className="text-sm text-gray-500">{PROJECT_TYPES[project.project_type]}</p>
            {project.description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-xl">{project.description}</p>}
          </div>
          {canManage && (
            <Select value={project.status} onChange={(e) => updateStatus(e.target.value)} className="w-40">
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs uppercase text-gray-400">Budget</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100"><CurrencyDisplay amount={project.budget} /></p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Spent</p>
            <p className="font-semibold text-red-600 dark:text-red-400"><CurrencyDisplay amount={summary?.expense_total ?? 0} /></p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Remaining Budget</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100"><CurrencyDisplay amount={summary?.remaining_budget ?? 0} /></p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Unfunded</p>
            <p className="font-semibold text-amber-600 dark:text-amber-400"><CurrencyDisplay amount={summary?.unfunded_amount ?? 0} /></p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Funding progress</span>
              <span>{(summary?.funding_percentage ?? 0).toFixed(1)}%</span>
            </div>
            <ProgressBar percent={summary?.funding_percentage ?? 0} tone="green" />
          </div>
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Budget spent</span>
              <span>{(summary?.spending_percentage ?? 0).toFixed(1)}%</span>
            </div>
            <ProgressBar percent={summary?.spending_percentage ?? 0} tone={summary?.spending_percentage > 90 ? 'red' : 'navy'} />
          </div>
        </div>
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <ProjectOverviewTab project={project} summary={summary} members={members} />}
      {tab === 'contributions' && <ProjectContributionsTab project={project} members={members} canManage={canManage} onChange={load} />}
      {tab === 'expenses' && <ProjectExpensesTab project={project} canManage={canManage} onChange={load} />}
      {tab === 'members' && <ProjectMembersTab project={project} members={members} canManage={canManage} onChange={load} />}
      {tab === 'documents' && <ProjectDocumentsTab project={project} />}
      {tab === 'activity' && <ProjectActivityTab project={project} />}
    </div>
  )
}
