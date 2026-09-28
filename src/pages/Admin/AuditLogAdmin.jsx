import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Card from '../../components/ui/Card'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import { formatDateTime } from '../../lib/format'

export default function AuditLogAdmin() {
  const { family } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!family) return
    setLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*, profiles(display_name)')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setLogs(data ?? [])
    setLoading(false)
  }, [family])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState />
  if (logs.length === 0) return <EmptyState title="No activity recorded yet" message="Financial record changes will be logged here for transparency." />

  return (
    <Card padded={false}>
      <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100 dark:divide-sage-800">
        {logs.map((l) => (
          <div key={l.id} className="px-4 py-2.5 text-sm">
            <div className="flex justify-between">
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {l.profiles?.display_name ?? 'System'} · <span className="text-gray-500">{l.action.replace(/_/g, ' ')}</span>
              </span>
              <span className="text-xs text-gray-400">{formatDateTime(l.created_at)}</span>
            </div>
            <p className="text-xs text-gray-400">on {l.entity_type} {l.entity_id ? `#${l.entity_id.slice(0, 8)}` : ''}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
