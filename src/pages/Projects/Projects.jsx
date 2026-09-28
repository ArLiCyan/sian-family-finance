import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderKanban } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge, projectStatusColor } from '../../components/ui/Badge'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import ProjectForm from './ProjectForm'
import { PROJECT_TYPES } from './ProjectForm'

export default function Projects() {
  const { family } = useAuth()
  const [projects, setProjects] = useState([])
  const [summaries, setSummaries] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('family_id', family.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    setProjects(data ?? [])

    if (data?.length) {
      const { data: sums } = await supabase.from('project_financial_summary').select('*').in('project_id', data.map((p) => p.id))
      setSummaries(Object.fromEntries((sums ?? []).map((s) => [s.project_id, s])))
    }
    setLoading(false)
  }, [family])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(
    `projects-list-${family?.id}`,
    family ? [
      { table: 'projects', filter: `family_id=eq.${family.id}` },
      { table: 'project_contributions' },
      { table: 'project_expenses' },
    ] : [],
    load
  )

  return (
    <div>
      <PageHeader
        title="Family Projects"
        subtitle="Shared savings goals like construction, vehicles, and events"
        action={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No active family projects"
          message="Create a project when the family is planning a shared expense, like a home renovation or vacation."
          action={<Button onClick={() => setFormOpen(true)}>Create Project</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const s = summaries[p.id]
            return (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="h-full hover:border-sage-300 dark:hover:border-sage-600 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                    <StatusBadge status={p.status} map={projectStatusColor} />
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{PROJECT_TYPES[p.project_type]}</p>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Budget</span>
                    <CurrencyDisplay amount={p.budget} className="font-medium" />
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Spent</span>
                    <CurrencyDisplay amount={s?.expense_total ?? 0} className="font-medium" />
                  </div>
                  <ProgressBar percent={s?.spending_percentage ?? 0} tone={s?.spending_percentage > 90 ? 'red' : 'navy'} />
                  <p className="mt-1 text-xs text-gray-400">{(s?.spending_percentage ?? 0).toFixed(1)}% spent · {(s?.funding_percentage ?? 0).toFixed(1)}% funded</p>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
    </div>
  )
}
