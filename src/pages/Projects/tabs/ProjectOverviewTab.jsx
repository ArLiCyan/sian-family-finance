import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import ProgressBar from '../../../components/financial/ProgressBar'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import { formatDate } from '../../../lib/format'
import EmptyState from '../../../components/ui/EmptyState'

export default function ProjectOverviewTab({ project, members }) {
  const [statuses, setStatuses] = useState([])

  const load = useCallback(async () => {
    // project_member_contribution_status is a UNION-based view, which
    // Postgres can't give a foreign key — so PostgREST's automatic
    // "profiles(display_name)" embed silently returns nothing. Names are
    // fetched separately instead.
    const { data: rows } = await supabase.from('project_member_contribution_status').select('*').eq('project_id', project.id)
    const ids = [...new Set((rows ?? []).map((r) => r.profile_id))]
    let names = {}
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name').in('id', ids)
      names = Object.fromEntries((profs ?? []).map((p) => [p.id, p.display_name]))
    }
    setStatuses((rows ?? []).map((r) => ({ ...r, display_name: names[r.profile_id] })))
  }, [project.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`project-overview-${project.id}`, [{ table: 'project_contributions', filter: `project_id=eq.${project.id}` }], load)

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Timeline" />
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Start Date</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{project.start_date ? formatDate(project.start_date) : 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Target Completion</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{project.target_completion_date ? formatDate(project.target_completion_date) : 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Participants</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{members.length}</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Member Funding Status" subtitle="Who has contributed so far" />
        {statuses.length === 0 ? (
          <EmptyState title="No contributions yet" message="Contributions members make toward this project will show up here." />
        ) : (
          <div className="space-y-3">
            {statuses.map((s) => (
              <div key={s.profile_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{s.display_name}</span>
                  <span className="text-gray-500">
                    {s.expected_amount != null ? (
                      <>
                        <CurrencyDisplay amount={s.confirmed_amount} /> / <CurrencyDisplay amount={s.expected_amount} />
                      </>
                    ) : (
                      <CurrencyDisplay amount={s.confirmed_amount} />
                    )}
                  </span>
                </div>
                {s.expected_amount != null ? (
                  <ProgressBar percent={s.percentage_complete} tone={s.percentage_complete >= 100 ? 'green' : 'navy'} />
                ) : (
                  <p className="text-xs text-gray-400">No personal target set</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
