import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../contexts/ToastContext'
import Card, { CardHeader } from '../../../components/ui/Card'
import { initials } from '../../../lib/format'

// Every family member is added to every project automatically (database
// triggers), so there is no add/remove here — only the per-project permissions.
export default function ProjectMembersTab({ project, members, canManage, onChange }) {
  const { showToast } = useToast()
  const [familyRoles, setFamilyRoles] = useState({})

  // Family owners/admins can approve and manage everything in every project, so
  // the per-project checkboxes only matter for regular members.
  useEffect(() => {
    supabase
      .from('family_memberships')
      .select('profile_id, role')
      .eq('family_id', project.family_id)
      .then(({ data }) => setFamilyRoles(Object.fromEntries((data ?? []).map((m) => [m.profile_id, m.role]))))
  }, [project.family_id])

  async function togglePermission(profileId, field, value) {
    const { error } = await supabase.from('project_members').update({ [field]: value }).eq('project_id', project.id).eq('profile_id', profileId)
    if (error) {
      showToast(`Couldn't update permission: ${error.message}`)
      return
    }
    onChange?.()
  }

  return (
    <div>
      <Card>
        <CardHeader title="Project Participants" subtitle="Every family member is added to every project automatically" />
        <div className="divide-y divide-gray-100 dark:divide-sage-800">
          {members.map((m) => {
            const isAdmin = familyRoles[m.profile_id] === 'owner' || familyRoles[m.profile_id] === 'admin'
            return (
            <div key={m.profile_id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-100 text-xs font-semibold text-sage-700 dark:bg-sage-800 dark:text-sage-300">
                  {initials(m.profiles?.display_name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.profiles?.display_name}</p>
                  <p className="text-xs text-gray-400 capitalize">{isAdmin ? `Family ${familyRoles[m.profile_id]}` : m.role}</p>
                </div>
              </div>
              {isAdmin ? (
                <span className="text-xs text-gray-400">Full access — approves and manages everything</span>
              ) : (
                canManage && m.role !== 'owner' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={m.can_approve_contributions} onChange={(e) => togglePermission(m.profile_id, 'can_approve_contributions', e.target.checked)} />
                    Can approve
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={m.can_manage_expenses} onChange={(e) => togglePermission(m.profile_id, 'can_manage_expenses', e.target.checked)} />
                    Can manage expenses
                  </label>
                </div>
                )
              )}
            </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
