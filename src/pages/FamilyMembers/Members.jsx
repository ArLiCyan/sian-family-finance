import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import LoadingState from '../../components/ui/LoadingState'
import Badge from '../../components/ui/Badge'
import { Select } from '../../components/ui/FormField'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { initials, formatDate } from '../../lib/format'

const ROLE_COLORS = { owner: 'navy', admin: 'blue', member: 'gray' }

export default function Members() {
  const { family, role: myRole, membership } = useAuth()
  const { showToast } = useToast()
  const [members, setMembers] = useState([])
  const [summaries, setSummaries] = useState({})
  const [loading, setLoading] = useState(true)
  const isOwner = myRole === 'owner'

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    const { data } = await supabase
      .from('family_memberships')
      .select('*, profiles(*)')
      .eq('family_id', family.id)
      .order('joined_at')
    setMembers(data ?? [])

    const sums = {}
    for (const m of data ?? []) {
      const { data: s } = await supabase.rpc('get_member_financial_summary', { p_profile_id: m.profile_id, p_family_id: family.id })
      sums[m.profile_id] = s
    }
    setSummaries(sums)
    setLoading(false)
  }, [family])

  useEffect(() => {
    load()
  }, [load])

  async function changeRole(membershipId, role) {
    const { error } = await supabase.from('family_memberships').update({ role }).eq('id', membershipId)
    if (error) {
      showToast(`Couldn't update role: ${error.message}`)
      return
    }
    load()
  }

  if (loading) return <LoadingState />

  return (
    <div>
      <PageHeader title="Family Members" subtitle={`${members.length} member${members.length === 1 ? '' : 's'} of the SIAN Family`} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => {
          const s = summaries[m.profile_id]
          return (
            <Card key={m.id}>
              <div className="flex items-center gap-3 mb-3">
                {m.profiles?.profile_photo_url ? (
                  <img src={m.profiles.profile_photo_url} className="h-11 w-11 rounded-full object-cover" alt="" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 font-semibold text-sage-700 dark:bg-sage-800 dark:text-sage-300">
                    {initials(m.profiles?.display_name)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{m.profiles?.display_name}</p>
                  <p className="text-xs text-gray-400">Joined {formatDate(m.joined_at)}</p>
                </div>
              </div>

              {isOwner && m.role !== 'owner' ? (
                <Select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)} className="mb-3 w-32">
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </Select>
              ) : (
                <Badge color={ROLE_COLORS[m.role]} className="mb-3 capitalize">{m.role}</Badge>
              )}

              <div className="space-y-1.5 text-sm border-t border-gray-100 dark:border-sage-800 pt-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Family Contributions</span>
                  <CurrencyDisplay amount={s?.total_family_contributions ?? 0} className="font-medium" />
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Projects</span>
                  <span className="font-medium">{s?.active_projects ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Family Goals</span>
                  <span className="font-medium">{s?.active_family_goals ?? 0}</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-gray-400 italic">Private finances are not visible to other family members.</p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
