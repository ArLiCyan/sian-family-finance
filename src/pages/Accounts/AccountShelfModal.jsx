import { useEffect, useState, useCallback } from 'react'
import { RotateCcw, ArchiveRestore } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useToast } from '../../contexts/ToastContext'
import { ACCOUNT_TYPE_LABELS } from '../../lib/api'
import { formatDateShort } from '../../lib/format'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'

export const ACCOUNT_TRASH_DAYS = 15

// Archived or deleted accounts, with a button to bring each one back.
// mode: 'archived' | 'trash'
export default function AccountShelfModal({ open, onClose, mode, onRestored }) {
  const { profile, family } = useAuth()
  const { mode: scope, isFamily } = useFinanceMode()
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const isTrash = mode === 'trash'

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase.from('financial_accounts').select('*').eq('scope', scope)
    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    query = isTrash
      ? query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false })
      : query.is('deleted_at', null).eq('status', 'archived').order('updated_at', { ascending: false })
    const { data } = await query
    setAccounts(data ?? [])
    if (data?.length) {
      const { data: bals } = await supabase.from('account_balances').select('*').in('account_id', data.map((a) => a.id))
      setBalances(Object.fromEntries((bals ?? []).map((b) => [b.account_id, Number(b.current_balance)])))
    }
    setLoading(false)
  }, [profile, family, scope, isFamily, isTrash])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function restore(account) {
    const patch = isTrash ? { deleted_at: null, deleted_by: null } : { status: 'active' }
    const { error } = await supabase.from('financial_accounts').update(patch).eq('id', account.id)
    if (error) {
      showToast(`Couldn't restore: ${error.message}`)
      return
    }
    load()
    onRestored?.()
  }

  function daysLeft(deletedAt) {
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.ceil(ACCOUNT_TRASH_DAYS - elapsed))
  }

  return (
    <Modal open={open} onClose={onClose} title={isTrash ? 'Trash' : 'Archived Accounts'} size="md">
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {isTrash
          ? `Deleted accounts stay here for ${ACCOUNT_TRASH_DAYS} days before being permanently removed, in case you deleted the wrong one.`
          : 'Archived accounts are hidden from the list but keep their full history. Unarchive one any time.'}
      </p>
      {loading ? (
        <LoadingState />
      ) : accounts.length === 0 ? (
        <EmptyState
          title={isTrash ? 'Trash is empty' : 'Nothing archived'}
          message={isTrash ? `Deleted accounts will show up here for ${ACCOUNT_TRASH_DAYS} days.` : 'Archived accounts will show up here.'}
        />
      ) : (
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
          {accounts.map((a) => {
            const left = isTrash ? daysLeft(a.deleted_at) : 0
            return (
              <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</p>
                  <p className="text-xs text-gray-400">
                    {ACCOUNT_TYPE_LABELS[a.account_type]} · <CurrencyDisplay amount={balances[a.id] ?? a.starting_balance} />
                    {isTrash && ` · Deleted ${formatDateShort(a.deleted_at)} · ${left} day${left === 1 ? '' : 's'} left before permanent deletion`}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => restore(a)}>
                  {isTrash ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                  {isTrash ? 'Restore' : 'Unarchive'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
