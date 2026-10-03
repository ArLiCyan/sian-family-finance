import { useEffect, useState, useCallback } from 'react'
import { RotateCcw, ArchiveRestore } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { formatDateShort } from '../../lib/format'
import { PROJECT_TYPES } from './ProjectForm'

export const PROJECT_TRASH_DAYS = 15

// Lists projects that are archived or in the trash, with a button to bring each
// one back. mode: 'archived' | 'trash'
export default function ProjectShelfModal({ open, onClose, mode, canManage, onRestored }) {
  const { family } = useAuth()
  const { showToast } = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const isTrash = mode === 'trash'

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    let query = supabase.from('projects').select('*').eq('family_id', family.id)
    query = isTrash
      ? query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      : query.is('deleted_at', null).not('archived_at', 'is', null).order('archived_at', { ascending: false })
    const { data } = await query
    setProjects(data ?? [])
    setLoading(false)
  }, [family, isTrash])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function restore(project) {
    const patch = isTrash ? { deleted_at: null, deleted_by: null } : { archived_at: null, archived_by: null }
    const { error } = await supabase.from('projects').update(patch).eq('id', project.id)
    if (error) {
      showToast(`Couldn't restore: ${error.message}`)
      return
    }
    load()
    onRestored?.()
  }

  function daysLeft(deletedAt) {
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.ceil(PROJECT_TRASH_DAYS - elapsed))
  }

  return (
    <Modal open={open} onClose={onClose} title={isTrash ? 'Trash' : 'Archived Projects'} size="md">
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {isTrash
          ? `Deleted projects stay here for ${PROJECT_TRASH_DAYS} days before being permanently removed, in case you deleted the wrong one.`
          : 'Archived projects are hidden from the main list but keep all their contributions, expenses and history. Unarchive one any time.'}
      </p>
      {loading ? (
        <LoadingState />
      ) : projects.length === 0 ? (
        <EmptyState
          title={isTrash ? 'Trash is empty' : 'Nothing archived'}
          message={isTrash ? `Deleted projects will show up here for ${PROJECT_TRASH_DAYS} days.` : 'Archived projects will show up here.'}
        />
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
          {projects.map((p) => {
            const left = isTrash ? daysLeft(p.deleted_at) : 0
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {PROJECT_TYPES[p.project_type]} · <CurrencyDisplay amount={p.budget} />
                    {isTrash
                      ? ` · Deleted ${formatDateShort(p.deleted_at)} · ${left} day${left === 1 ? '' : 's'} left before permanent deletion`
                      : ` · Archived ${formatDateShort(p.archived_at)}`}
                  </p>
                </div>
                {canManage(p) && (
                  <Button size="sm" variant="outline" onClick={() => restore(p)}>
                    {isTrash ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                    {isTrash ? 'Restore' : 'Unarchive'}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
