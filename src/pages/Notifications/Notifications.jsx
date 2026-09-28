import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/layout/PageHeader'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/format'
import { resolveNotificationPath } from '../../lib/notifications'

export default function Notifications() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    load()
  }

  async function handleClick(n) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      load()
    }
    const path = await resolveNotificationPath(n)
    if (path) navigate(path)
  }

  const unread = items.filter((n) => !n.is_read).length

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : 'All caught up'}
        action={unread > 0 && <Button variant="outline" onClick={markAllRead}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" message="You'll be notified about contributions, projects, and announcements here." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-gray-100 dark:divide-sage-800">
            {items.map((n) => (
              <li key={n.id} onClick={() => handleClick(n)} className={`cursor-pointer px-4 py-3 hover:bg-gray-50 dark:hover:bg-sage-800/50 ${!n.is_read ? 'bg-sage-50/60 dark:bg-sage-800/30' : ''}`}>
                <div className="flex justify-between">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-sage-500 mt-1.5" />}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{n.message}</p>
                <p className="mt-1 text-xs text-gray-400">{formatDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
