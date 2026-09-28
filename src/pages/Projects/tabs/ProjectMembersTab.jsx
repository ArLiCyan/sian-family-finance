import { useEffect, useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { getFamilyMembers } from '../../../lib/api'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { Field, Select } from '../../../components/ui/FormField'
import { initials } from '../../../lib/format'

export default function ProjectMembersTab({ project, members, canManage, onChange }) {
  const { family } = useAuth()
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState('')

  useEffect(() => {
    if (open && family) {
      getFamilyMembers(family.id).then((all) => {
        const memberIds = new Set(members.map((m) => m.profile_id))
        setCandidates(all.filter((m) => !memberIds.has(m.profile_id)))
      })
    }
  }, [open, family, members])

  async function addMember() {
    if (!selected) return
    await supabase.from('project_members').insert({ project_id: project.id, profile_id: selected, role: 'participant' })
    setOpen(false)
    setSelected('')
    onChange?.()
  }

  async function removeMember(profileId) {
    await supabase.from('project_members').delete().eq('project_id', project.id).eq('profile_id', profileId)
    onChange?.()
  }

  async function togglePermission(profileId, field, value) {
    await supabase.from('project_members').update({ [field]: value }).eq('project_id', project.id).eq('profile_id', profileId)
    onChange?.()
  }

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-4">
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Participant
          </Button>
        </div>
      )}
      <Card>
        <CardHeader title="Project Participants" />
        <div className="divide-y divide-gray-100 dark:divide-sage-800">
          {members.map((m) => (
            <div key={m.profile_id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sage-100 text-xs font-semibold text-sage-700 dark:bg-sage-800 dark:text-sage-300">
                  {initials(m.profiles?.display_name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.profiles?.display_name}</p>
                  <p className="text-xs text-gray-400 capitalize">{m.role}</p>
                </div>
              </div>
              {canManage && m.role !== 'owner' && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={m.can_approve_contributions} onChange={(e) => togglePermission(m.profile_id, 'can_approve_contributions', e.target.checked)} />
                    Can approve
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={m.can_manage_expenses} onChange={(e) => togglePermission(m.profile_id, 'can_manage_expenses', e.target.checked)} />
                    Can manage expenses
                  </label>
                  <button onClick={() => removeMember(m.profile_id)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Participant" size="sm">
        <Field label="Family Member">
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Select a member</option>
            {candidates.map((c) => (
              <option key={c.profile_id} value={c.profile_id}>{c.profiles?.display_name}</option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={addMember} disabled={!selected}>Add</Button>
        </div>
      </Modal>
    </div>
  )
}
