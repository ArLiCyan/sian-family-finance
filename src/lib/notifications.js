import { supabase } from './supabase'

// Maps a notification's entity_type/entity_id to the in-app route it refers
// to. Contribution/expense notifications point at a row inside a project, so
// this looks up the parent project before building the link. Falls back to
// null (no navigation) if the underlying record no longer exists, e.g. it
// was deleted after the notification was sent.
export async function resolveNotificationPath(notification) {
  const { entity_type: type, entity_id: id } = notification
  if (!type || !id) return null

  switch (type) {
    case 'project':
      return `/projects/${id}`

    case 'project_contribution': {
      const { data } = await supabase.from('project_contributions').select('project_id').eq('id', id).single()
      return data ? `/projects/${data.project_id}?tab=contributions` : '/projects'
    }

    case 'project_expense': {
      const { data } = await supabase.from('project_expenses').select('project_id').eq('id', id).single()
      return data ? `/projects/${data.project_id}?tab=expenses` : '/projects'
    }

    case 'announcement':
      return '/announcements'

    case 'debt':
      return '/debts'

    case 'goal':
      return '/goals'

    case 'transaction':
      return '/transactions'

    default:
      return null
  }
}
