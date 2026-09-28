import { useEffect, useState, useCallback } from 'react'
import { RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useToast } from '../../contexts/ToastContext'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { formatDateShort } from '../../lib/format'

const RETENTION_DAYS = 30

export default function DebtTrashModal({ open, onClose, onRestored }) {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const { showToast } = useToast()
  const [debts, setDebts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase.from('debts').select('*').eq('scope', mode).not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    const { data } = await query
    setDebts(data ?? [])
    setLoading(false)
  }, [profile, family, mode, isFamily])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function restore(debt) {
    const { error } = await supabase.from('debts').update({ deleted_at: null, deleted_by: null }).eq('id', debt.id)
    if (error) {
      showToast(`Couldn't restore: ${error.message}`)
      return
    }
    load()
    onRestored?.()
  }

  function daysLeft(deletedAt) {
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed))
  }

  return (
    <Modal open={open} onClose={onClose} title="Trash" size="md">
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Deleted loans stay here for {RETENTION_DAYS} days before being permanently removed, in case you deleted the wrong one.
      </p>
      {loading ? (
        <LoadingState />
      ) : debts.length === 0 ? (
        <EmptyState title="Trash is empty" message="Deleted loans will show up here for 30 days before being permanently removed." />
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
          {debts.map((d) => (
            <div key={d.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{d.counterparty_name}</p>
                <p className="text-xs text-gray-400">
                  <CurrencyDisplay amount={d.original_amount} /> · Deleted {formatDateShort(d.deleted_at)} · {daysLeft(d.deleted_at)} day
                  {daysLeft(d.deleted_at) === 1 ? '' : 's'} left before permanent deletion
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => restore(d)}>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
