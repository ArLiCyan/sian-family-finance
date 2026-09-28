import { useEffect, useState, useRef } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDateTime } from '../../lib/format'
import { Link } from 'react-router-dom'

export default function NotificationBell() {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  async function load() {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setItems(data ?? [])
  }

  useEffect(() => {
    load()
    if (!profile) return
    const channel = supabase
      .channel('notifications-' + profile.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${profile.id}` },
        () => load()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const unreadCount = items.filter((n) => !n.is_read).length

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
    load()
  }

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-sage-800"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg dark:border-sage-800 dark:bg-sage-900">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-sage-800 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-sage-600 hover:underline dark:text-sage-400">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-sage-800">
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={`cursor-pointer px-4 py-3 hover:bg-gray-50 dark:hover:bg-sage-800 ${!n.is_read ? 'bg-sage-50/60 dark:bg-sage-800/40' : ''}`}
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{n.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{n.message}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-gray-100 dark:border-sage-800 px-4 py-2.5 text-center text-xs font-medium text-sage-600 hover:bg-gray-50 dark:text-sage-400 dark:hover:bg-sage-800"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  )
}
