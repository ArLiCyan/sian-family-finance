import { useEffect, useState, useCallback } from 'react'
import { Plus, Wallet, Archive, Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useToast } from '../../contexts/ToastContext'
import { getAccountsWithBalances, ACCOUNT_TYPE_LABELS } from '../../lib/api'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import AccountForm from './AccountForm'

export default function Accounts() {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const { showToast } = useToast()
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState({})
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [archiving, setArchiving] = useState(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    const { accounts: accs, balances: bals } = await getAccountsWithBalances(
      isFamily ? { scope: 'family', familyId: family?.id } : { scope: 'private', profileId: profile.id }
    )
    setAccounts(accs)
    setBalances(bals)
    setLoading(false)
  }, [profile, family, isFamily])

  useEffect(() => {
    load()
  }, [load])

  async function handleArchive() {
    const { error } = await supabase.from('financial_accounts').update({ status: 'archived' }).eq('id', archiving.id)
    setArchiving(null)
    if (error) {
      showToast(`Couldn't archive account: ${error.message}`)
      return
    }
    load()
  }

  const total = accounts.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0)

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Accounts' : 'My Accounts'}
        subtitle={<>Total balance: <CurrencyDisplay amount={total} className="font-semibold" /></>}
        action={
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> Add Account
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          message={isFamily ? 'Add a shared family account like a joint bank account or GCash wallet.' : 'Add your first personal account to start tracking your money.'}
          action={<Button onClick={() => setFormOpen(true)}>Add Account</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between">
                <div className="rounded-lg bg-sage-50 p-2 text-sage-600 dark:bg-sage-800 dark:text-sage-300">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(a); setFormOpen(true) }} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setArchiving(a)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-gray-500">{a.name}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                <CurrencyDisplay amount={balances[a.id] ?? 0} />
              </p>
              <p className="mt-1 text-xs text-gray-400">{ACCOUNT_TYPE_LABELS[a.account_type]}</p>
            </Card>
          ))}
        </div>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} initial={editing} />
      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={handleArchive}
        variant="primary"
        title="Archive account?"
        message="Archived accounts are hidden from lists but their transaction history is preserved."
        confirmLabel="Archive"
      />
    </div>
  )
}
