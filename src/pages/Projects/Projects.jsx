import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderKanban, Archive, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh'
import { exportToCsv, exportToXls, exportToPdf } from '../../lib/exportUtils'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ExportMenu from '../../components/ui/ExportMenu'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge, projectStatusColor } from '../../components/ui/Badge'
import ProgressBar from '../../components/financial/ProgressBar'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import ProjectForm from './ProjectForm'
import ProjectShelfModal, { PROJECT_TRASH_DAYS } from './ProjectShelfModal'
import { PROJECT_TYPES } from './ProjectForm'

export default function Projects() {
  const { family, profile, role } = useAuth()
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [summaries, setSummaries] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [myManaged, setMyManaged] = useState(new Set())
  const [archiving, setArchiving] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [shelf, setShelf] = useState(null) // 'archived' | 'trash' | null

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('family_id', family.id)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    setProjects(data ?? [])

    if (profile) {
      const { data: mine } = await supabase.from('project_members').select('project_id, role, can_approve_contributions, can_manage_expenses').eq('profile_id', profile.id)
      setMyManaged(new Set((mine ?? []).filter((m) => m.role === 'owner' || m.can_approve_contributions || m.can_manage_expenses).map((m) => m.project_id)))
    }

    if (data?.length) {
      const { data: sums } = await supabase.from('project_financial_summary').select('*').in('project_id', data.map((p) => p.id))
      setSummaries(Object.fromEntries((sums ?? []).map((s) => [s.project_id, s])))
    }
    setLoading(false)
  }, [family, profile])

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

  const exportHeaders = ['Project', 'Type', 'Status', 'Proposed Budget', 'Total Contributions', 'Total Spent', 'Funding %', 'Spent %']
  function exportRows() {
    return projects.map((p) => {
      const s = summaries[p.id]
      return [
        p.name,
        PROJECT_TYPES[p.project_type],
        p.status,
        Number(p.budget).toFixed(2),
        Number(s?.confirmed_total ?? 0).toFixed(2),
        Number(s?.expense_total ?? 0).toFixed(2),
        (s?.funding_percentage ?? 0).toFixed(1),
        (s?.spending_percentage ?? 0).toFixed(1),
      ]
    })
  }
  function exportCsv() {
    exportToCsv('sian-family-projects.csv', exportHeaders, exportRows())
  }
  function exportXls() {
    exportToXls('sian-family-projects.xls', exportHeaders, exportRows(), 'Projects')
  }
  async function exportPdf() {
    try {
      await exportToPdf('sian-family-projects.pdf', {
        title: 'SIAN Family Finance — Projects',
        headers: exportHeaders,
        rows: exportRows(),
      })
    } catch (err) {
      showToast(`Couldn't create the PDF: ${err.message}`)
    }
  }

  // Matches the database rule (can_manage_project): a project owner/manager or a family admin.
  const canManage = (p) => role === 'owner' || role === 'admin' || myManaged.has(p.id)

  async function handleArchive() {
    const project = archiving
    setArchiving(null)
    const { error } = await supabase.from('projects').update({ archived_at: new Date().toISOString(), archived_by: profile.id }).eq('id', project.id)
    if (error) {
      showToast(`Couldn't archive: ${error.message}`)
      return
    }
    load()
  }

  async function handleDelete() {
    const project = deleting
    setDeleting(null)
    const { error } = await supabase.from('projects').update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq('id', project.id)
    if (error) {
      showToast(`Couldn't delete: ${error.message}`)
      return
    }
    load()
  }

  return (
    <div>
      <PageHeader
        title="Family Projects"
        subtitle="Shared savings goals like construction, vehicles, and events"
        action={
          <div className="flex items-center gap-2">
            <ExportMenu onCsv={exportCsv} onXls={exportXls} onPdf={exportPdf} disabled={projects.length === 0} />
            <Button variant="outline" onClick={() => setShelf('archived')}>
              <Archive className="h-4 w-4" /> Archived
            </Button>
            <Button variant="outline" onClick={() => setShelf('trash')}>
              <Trash2 className="h-4 w-4" /> Trash
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          </div>
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
              <div key={p.id} className="relative">
              <Link to={`/projects/${p.id}`}>
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
              {canManage(p) && (
                <div className="absolute bottom-3 right-3 flex gap-1">
                  <button
                    title="Archive"
                    onClick={() => setArchiving(p)}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-sage-800 dark:hover:text-gray-200"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => setDeleting(p)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
              </div>
            )
          })}
        </div>
      )}

      <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} />
      <ProjectShelfModal open={!!shelf} mode={shelf ?? 'archived'} onClose={() => setShelf(null)} canManage={canManage} onRestored={load} />
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={handleArchive}
        title="Archive this project?"
        message={`"${archiving?.name}" will be hidden from this list but keeps all its contributions, expenses and history. You can unarchive it any time from the Archived button.`}
        confirmLabel="Archive"
        variant="primary"
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Move to Trash?"
        message={`"${deleting?.name}" moves to Trash and can be restored within ${PROJECT_TRASH_DAYS} days. After that it's permanently deleted, along with its contributions, expenses and activity. Money already recorded in Transactions is kept.`}
        confirmLabel="Move to Trash"
      />
    </div>
  )
}
