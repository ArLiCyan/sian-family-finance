import { useEffect, useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { getFamilyMembers } from '../../lib/api'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import { Select } from '../../components/ui/FormField'

// Family owners/admins always have access automatically (see is_store_member
// in the database). This lets them additionally grant access to a specific
// non-admin member — e.g. Mom, who runs the store day to day.
export default function StoreMembersModal({ open, onClose, family, onChanged }) {
  const { showToast } = useToast()
  const [familyMembers, setFamilyMembers] = useState([])
  const [storeMembers, setStoreMembers] = useState([])
  const [addingProfileId, setAddingProfileId] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [fm, sm] = await Promise.all([
      getFamilyMembers(family.id),
      supabase.from('store_members').select('*, profiles(display_name)').eq('family_id', family.id),
    ])
    setFamilyMembers(fm)
    setStoreMembers(sm.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const candidateMembers = familyMembers.filter((fm) => !storeMembers.some((sm) => sm.profile_id === fm.profile_id))

  async function addMember() {
    if (!addingProfileId) return
    const { error } = await supabase.from('store_members').insert({ family_id: family.id, profile_id: addingProfileId })
    if (error) {
      showToast(`Couldn't grant access: ${error.message}`)
      return
    }
    setAddingProfileId('')
    load()
    onChanged?.()
  }

  async function togglePermission(memberId, field, value) {
    const { error } = await supabase.from('store_members').update({ [field]: value }).eq('id', memberId)
    if (error) {
      showToast(`Couldn't update permission: ${error.message}`)
      return
    }
    load()
    onChanged?.()
  }

  async function removeMember(memberId) {
    const { error } = await supabase.from('store_members').delete().eq('id', memberId)
    if (error) {
      showToast(`Couldn't remove access: ${error.message}`)
      return
    }
    load()
    onChanged?.()
  }

  return (
    <Modal open={open} onClose={onClose} title="Store Access" size="md">
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Family owners and admins always have full access. Grant access to other members here.
      </p>

      {!loading && candidateMembers.length > 0 && (
        <div className="mb-4 flex items-end gap-2">
          <div className="flex-1">
            <Select value={addingProfileId} onChange={(e) => setAddingProfileId(e.target.value)}>
              <option value="">Choose a family member…</option>
              {candidateMembers.map((fm) => (
                <option key={fm.profile_id} value={fm.profile_id}>{fm.profiles?.display_name}</option>
              ))}
            </Select>
          </div>
          <Button onClick={addMember} disabled={!addingProfileId}>
            <UserPlus className="h-4 w-4" /> Grant Access
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : storeMembers.length === 0 ? (
        <p className="text-sm text-gray-400">No one has been granted extra access yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-sage-800">
          {storeMembers.map((sm) => (
            <div key={sm.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{sm.profiles?.display_name}</p>
                <div className="mt-1 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={sm.can_manage_inventory}
                      onChange={(e) => togglePermission(sm.id, 'can_manage_inventory', e.target.checked)}
                    />
                    Manage Inventory
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={sm.can_manage_capital}
                      onChange={(e) => togglePermission(sm.id, 'can_manage_capital', e.target.checked)}
                    />
                    Manage Capital
                  </label>
                </div>
              </div>
              <button
                onClick={() => removeMember(sm.id)}
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
