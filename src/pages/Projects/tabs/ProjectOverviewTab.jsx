import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Card, { CardHeader } from '../../../components/ui/Card'
import ProgressBar from '../../../components/financial/ProgressBar'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import { formatDate } from '../../../lib/format'
import EmptyState from '../../../components/ui/EmptyState'

export default function ProjectOverviewTab({ project, members }) {
  const [statuses, setStatuses] = useState([])

  useEffect(() => {
    supabase
      .from('project_member_contribution_status')
      .select('*, profiles(display_name)')
      .eq('project_id', project.id)
      .then(({ data }) => setStatuses(data ?? []))
  }, [project.id])

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
          <EmptyState title="No contribution targets set" message="Set expected contribution amounts in the Contributions tab." />
        ) : (
          <div className="space-y-3">
            {statuses.map((s) => (
              <div key={s.profile_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{s.profiles?.display_name}</span>
                  <span className="text-gray-500">
                    <CurrencyDisplay amount={s.confirmed_amount} /> / <CurrencyDisplay amount={s.expected_amount} />
                  </span>
                </div>
                <ProgressBar percent={s.percentage_complete} tone={s.percentage_complete >= 100 ? 'green' : 'navy'} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
