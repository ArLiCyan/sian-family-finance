import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import { Textarea } from '../../../components/ui/FormField'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingState from '../../../components/ui/LoadingState'
import { formatDateTime } from '../../../lib/format'

export default function ProjectActivityTab({ project }) {
  const { profile } = useAuth()
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('project_updates')
      .select('*, profiles(display_name)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setUpdates(data ?? [])
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    load()
  }, [load])

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    await supabase.from('project_updates').insert({ project_id: project.id, profile_id: profile.id, message: note.trim(), update_type: 'note' })
    setNote('')
    setSaving(false)
    load()
  }

  return (
    <div>
      <Card className="mb-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Post an update or note to the project team…" />
        <div className="mt-2 flex justify-end">
          <Button onClick={addNote} loading={saving} disabled={!note.trim()}>Post Update</Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <LoadingState />
        ) : updates.length === 0 ? (
          <EmptyState title="No activity yet" message="Contributions, expenses, and updates will show up here automatically." />
        ) : (
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sage-400" />
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{u.message}</p>
                  <p className="text-xs text-gray-400">
                    {u.profiles?.display_name ?? 'System'} · {formatDateTime(u.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
