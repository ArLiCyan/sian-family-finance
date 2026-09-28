import { useEffect, useState, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { useToast } from '../../contexts/ToastContext'
import { getCategories, TRANSACTION_TYPE_LABELS } from '../../lib/api'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { Select } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import TransactionForm from '../../components/financial/TransactionForm'
import TransactionTable from '../../components/financial/TransactionTable'
import { ArrowLeftRight } from 'lucide-react'

export default function Transactions() {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const { showToast } = useToast()
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let query = supabase
      .from('transactions')
      .select('*, categories(name, icon), financial_accounts!transactions_account_id_fkey(name)')
      .eq('scope', mode)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    query = isFamily ? query.eq('family_id', family?.id) : query.eq('owner_profile_id', profile.id)
    if (typeFilter) query = query.eq('type', typeFilter)
    if (categoryFilter) query = query.eq('category_id', categoryFilter)

    const { data } = await query
    setTransactions(data ?? [])
    setCategories(await getCategories())
    setLoading(false)
  }, [profile, family, mode, isFamily, typeFilter, categoryFilter])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete() {
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
      .eq('id', deleting.id)
    setDeleting(null)
    if (error) {
      showToast(`Couldn't delete transaction: ${error.message}`)
      return
    }
    load()
  }

  return (
    <div>
      <PageHeader
        title={isFamily ? 'Family Transactions' : 'My Transactions'}
        subtitle="Income, expenses, transfers and more"
        action={
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap gap-3" padded>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-44">
          <option value="">All Types</option>
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-44">
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Card>

      <Card>
        {loading ? (
          <LoadingState />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transactions yet"
            message="Start by adding your first income or expense."
            action={<Button onClick={() => setFormOpen(true)}>Add Transaction</Button>}
          />
        ) : (
          <TransactionTable
            transactions={transactions}
            canEdit
            onEdit={(t) => { setEditing(t); setFormOpen(true) }}
            onDelete={(t) => setDeleting(t)}
          />
        )}
      </Card>

      <TransactionForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={load} initial={editing} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete transaction?"
        message="This will remove this record from your active financial records. This can be restored by an administrator if needed."
        confirmLabel="Delete"
      />
    </div>
  )
}
