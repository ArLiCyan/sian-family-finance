import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Wallet, Archive, Pencil, ChevronRight, Trash2 } from 'lucide-react'
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
import ExportMenu from '../../components/ui/ExportMenu'
import { exportToCsv, exportToXls, exportToPdf } from '../../lib/exportUtils'
import AccountForm from './AccountForm'
import AccountShelfModal, { ACCOUNT_TRASH_DAYS } from './AccountShelfModal'

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
  const [deleting, setDeleting] = useState(null)
  const [shelf, setShelf] = useState(null) // 'archived' | 'trash' | null

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

  async function handleDelete() {
    const account = deleting
    setDeleting(null)
    const { error } = await supabase.from('financial_accounts').update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq('id', account.id)
    if (error) {
      showToast(`Couldn't delete account: ${error.message}`)
      return
    }
    load()
  }

  const exportHeaders = ['Account', 'Type', 'Description', 'Opening Balance', 'Current Balance']
  const exportRows = () =>
    accounts.map((a) => [a.name, ACCOUNT_TYPE_LABELS[a.account_type], a.description?.trim() ?? '', Number(a.starting_balance).toFixed(2), Number(balances[a.id] ?? 0).toFixed(2)])
  const exportBase = isFamily ? 'sian-family-accounts' : 'my-accounts'
  async function exportPdf() {
    try {
      await exportToPdf(`${exportBase}.pdf`, {
        title: isFamily ? 'SIAN Family Finance — Accounts' : 'My Finances — Accounts',
        subtitle: new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
        headers: exportHeaders,
        rows: exportRows(),
        summary: [`Total balance: PHP ${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`],
      })
    } catch (err) {
      showToast(`Couldn't create the PDF: ${err.message}`)
    }
  }

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Accounts' : 'My Accounts'}
        subtitle={<>Total balance: <CurrencyDisplay amount={total} className="font-semibold" /></>}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportMenu
              onCsv={() => exportToCsv(`${exportBase}.csv`, exportHeaders, exportRows())}
              onXls={() => exportToXls(`${exportBase}.xls`, exportHeaders, exportRows(), 'Accounts')}
              onPdf={exportPdf}
              disabled={accounts.length === 0}
            />
            <Button variant="outline" onClick={() => setShelf('archived')}>
              <Archive className="h-4 w-4" /> Archived
            </Button>
            <Button variant="outline" onClick={() => setShelf('trash')}>
              <Trash2 className="h-4 w-4" /> Trash
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="h-4 w-4" /> Add Account
            </Button>
          </div>
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
            <div key={a.id} className="relative">
              <Link to={`/accounts/${a.id}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-sage-300 dark:hover:border-sage-600">
                  <div className="flex items-start justify-between">
                    <div className="rounded-lg bg-sage-50 p-2 text-sage-600 dark:bg-sage-800 dark:text-sage-300">
                      <Wallet className="h-5 w-5" />
                    </div>
                    {/* spacer so the edit/archive buttons below don't cover anything */}
                    <div className="h-7 w-24" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">{a.name}</p>
                  <p className={`text-xl font-bold ${(balances[a.id] ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    <CurrencyDisplay amount={balances[a.id] ?? 0} />
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{ACCOUNT_TYPE_LABELS[a.account_type]}</p>
                  {a.description?.trim() && (
                    <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-gray-500 dark:text-gray-400">{a.description.trim()}</p>
                  )}
                  <p className="mt-3 flex items-center gap-0.5 text-xs font-medium text-sage-600 dark:text-sage-400">
                    View details <ChevronRight className="h-3.5 w-3.5" />
                  </p>
                </Card>
              </Link>
              <div className="absolute right-3 top-3 flex gap-1 sm:right-4 sm:top-4">
                <button title="Edit" onClick={() => { setEditing(a); setFormOpen(true) }} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button title="Archive" onClick={() => setArchiving(a)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-sage-800">
                  <Archive className="h-3.5 w-3.5" />
                </button>
                <button title="Delete" onClick={() => setDeleting(a)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} initial={editing} />
      <AccountShelfModal open={!!shelf} mode={shelf ?? 'archived'} onClose={() => setShelf(null)} onRestored={load} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Move to Trash?"
        message={`"${deleting?.name}" moves to Trash and can be restored within ${ACCOUNT_TRASH_DAYS} days. After that it's permanently deleted, along with its Cash In / Cash Out entries. Other transactions that used this account are kept, just without an account.`}
        confirmLabel="Move to Trash"
      />
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
