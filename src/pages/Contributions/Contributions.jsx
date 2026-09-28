import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Check, X as XIcon, HandCoins, Paperclip } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import { Select } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/Badge'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import ReceiptModal from '../../components/financial/ReceiptModal'
import { formatDateShort } from '../../lib/format'

const STATUS_OPTIONS = ['pending', 'submitted', 'confirmed', 'partially_confirmed', 'rejected', 'refunded']

export default function Contributions() {
  const { profile, family } = useAuth()
  const { showToast } = useToast()
  const [contributions, setContributions] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewingReceipt, setViewingReceipt] = useState(null)

  const load = useCallback(async () => {
    if (!family || !profile) return
    setLoading(true)
    let query = supabase
      .from('project_contributions')
      .select('*, projects!inner(id, name, family_id), profiles!project_contributions_profile_id_fkey(display_name)')
      .eq('projects.family_id', family.id)
      .order('created_at', { ascending: false })
    if (statusFilter) query = query.eq('status', statusFilter)
    const { data } = await query
    setContributions(data ?? [])
    setLoading(false)
  }, [family, profile, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`family-contributions-${family?.id}`, family ? [{ table: 'project_contributions' }] : [], load)

  // Any family member may confirm/reject anyone else's contribution — a
  // trusted-family policy, not gated by role or project membership. The
  // database independently blocks verifying your own, regardless of role.
  async function verify(c, status) {
    const { error } = await supabase
      .from('project_contributions')
      .update({ status, verified_by: profile.id, verified_at: new Date().toISOString() })
      .eq('id', c.id)
    if (error) {
      showToast(`Couldn't ${status === 'confirmed' ? 'confirm' : 'reject'} contribution: ${error.message}`)
      return
    }
    load()
  }

  return (
    <div>
      <PageHeader title="Contributions" subtitle="All family project contributions, across every project" />

      <Card className="mb-4" padded>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-48">
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </Select>
      </Card>

      <Card>
        {loading ? (
          <LoadingState />
        ) : contributions.length === 0 ? (
          <EmptyState icon={HandCoins} title="No contributions yet" message="Contributions submitted toward family projects will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3">Contributor</th>
                  <th className="py-2 pr-3">Project</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Receipt</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {contributions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{c.profiles?.display_name}</td>
                    <td className="py-2.5 pr-3">
                      <Link to={`/projects/${c.projects?.id}`} className="text-sage-600 hover:underline dark:text-sage-400">{c.projects?.name}</Link>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500">{formatDateShort(c.date)}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold"><CurrencyDisplay amount={c.confirmed_amount ?? c.amount} /></td>
                    <td className="py-2.5 pr-3"><StatusBadge status={c.status} /></td>
                    <td className="py-2.5 pr-3">
                      {c.receipt_path ? (
                        <button
                          onClick={() => setViewingReceipt(c.receipt_path)}
                          title="View receipt"
                          className="rounded p-1.5 text-sage-600 hover:bg-sage-50 dark:text-sage-400 dark:hover:bg-sage-800"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-sage-700">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {c.status === 'pending' && c.profile_id !== profile.id && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => verify(c, 'confirmed')} className="rounded p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => verify(c, 'rejected')} className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                            <XIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <ReceiptModal path={viewingReceipt} onClose={() => setViewingReceipt(null)} />
    </div>
  )
}
