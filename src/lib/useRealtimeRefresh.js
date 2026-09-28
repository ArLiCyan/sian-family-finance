import { useEffect } from 'react'
import { supabase } from './supabase'

// Subscribes to one or more tables' postgres_changes and re-runs `onChange`
// whenever a row is inserted/updated/deleted, so open pages reflect other
// family members' edits without a manual refresh.
export function useRealtimeRefresh(channelName, subscriptions, onChange) {
  useEffect(() => {
    if (!subscriptions?.length) return
    const channel = supabase.channel(channelName)
    for (const sub of subscriptions) {
      channel.on('postgres_changes', { event: '*', schema: 'public', ...sub }, onChange)
    }
    channel.subscribe()
    return () => supabase.removeChannel(channel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName])
}
