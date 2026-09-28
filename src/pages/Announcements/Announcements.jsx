import { useEffect, useState, useCallback } from 'react'
import { Plus, Megaphone, Pin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Field, Input, Textarea } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/format'

export default function Announcements() {
  const { profile, family, role } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const canPost = role === 'owner' || role === 'admin'

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    const { data } = await supabase
      .from('announcements')
      .select('*, profiles(display_name)')
      .eq('family_id', family.id)
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <PageHeader
        title="Family Announcements"
        subtitle="Important updates and reminders for the family"
        action={canPost && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Announcement</Button>}
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" message="Family admins can post financial announcements and reminders here." />
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between mb-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  {a.is_pinned && <Pin className="h-3.5 w-3.5 text-amber-500" />}
                  {a.title}
                </p>
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(a.created_at)}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">{a.message}</p>
              <p className="mt-2 text-xs text-gray-400">Posted by {a.profiles?.display_name}</p>
            </Card>
          ))}
        </div>
      )}

      <AnnouncementForm open={open} onClose={() => setOpen(false)} onSaved={load} />
    </div>
  )
}

function AnnouncementForm({ open, onClose, onSaved }) {
  const { profile, family } = useAuth()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [pinned, setPinned] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle('')
      setMessage('')
      setPinned(false)
      setError('')
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !message.trim()) {
      setError('Title and message are required.')
      return
    }
    setSaving(true)
    const { error: err } = await supabase.from('announcements').insert({ family_id: family.id, title: title.trim(), message: message.trim(), is_pinned: pinned, created_by: profile.id })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Announcement" size="sm">
      <form onSubmit={handleSubmit}>
        <Field label="Title" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Message" required>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
        </Field>
        <label className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top
        </label>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Post Announcement</Button>
        </div>
      </form>
    </Modal>
  )
}
