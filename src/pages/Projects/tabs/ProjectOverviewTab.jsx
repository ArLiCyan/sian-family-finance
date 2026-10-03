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

  // Totals are grouped by the contributor's name (the name typed/picked when the
  // contribution was added, else the account holder's name), so people without an
  // account — and contributions recorded on someone's behalf — get their own line.
  const load = useCallback(async () => {
    const [{ data: contributions }, { data: requirements }] = await Promise.all([
      supabase
        .from('project_contributions')
        .select('amount, confirmed_amount, status, contributor_name, profile_id, profiles!project_contributions_profile_id_fkey(display_name)')
        .eq('project_id', project.id),
      supabase.from('project_contribution_requirements').select('profile_id, expected_amount').eq('project_id', project.id),
    ])
    const expectedByProfile = Object.fromEntries((requirements ?? []).map((r) => [r.profile_id, Number(r.expected_amount)]))
    const groups = new Map()
    const group = (name) => {
      const key = name.trim().toLowerCase()
      if (!groups.has(key)) groups.set(key, { key, name: name.trim(), confirmed: 0, pending: 0, count: 0, expected: null })
      return groups.get(key)
    }
    for (const c of contributions ?? []) {
      const g = group(c.contributor_name || c.profiles?.display_name || 'Unknown')
      g.count += 1
      if (c.status === 'confirmed' || c.status === 'partially_confirmed') g.confirmed += Number(c.confirmed_amount ?? c.amount)
      else if (c.status === 'pending' || c.status === 'submitted') g.pending += Number(c.amount)
    }
    for (const m of members) {
      const expected = expectedByProfile[m.profile_id]
      if (expected > 0) group(m.profiles?.display_name ?? 'Unknown').expected = expected
    }
    setStatuses([...groups.values()].sort((x, y) => y.confirmed - x.confirmed))
  }, [project.id, members])

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
        <CardHeader title="Member Funding Status" subtitle="Total contributed by each contributor" />
        {statuses.length === 0 ? (
          <EmptyState title="No contributions yet" message="Contributions made toward this project will show up here." />
        ) : (
          <div className="space-y-3">
            {statuses.map((s) => (
              <div key={s.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{s.name}</span>
                  <span className="text-gray-500">
                    {s.expected != null ? (
                      <>
                        <CurrencyDisplay amount={s.confirmed} /> / <CurrencyDisplay amount={s.expected} />
                      </>
                    ) : (
                      <CurrencyDisplay amount={s.confirmed} />
                    )}
                  </span>
                </div>
                {s.expected != null ? (
                  <ProgressBar percent={Math.min(100, (s.confirmed / s.expected) * 100)} tone={s.confirmed >= s.expected ? 'green' : 'navy'} />
                ) : (
                  <p className="text-xs text-gray-400">
                    {s.count} contribution{s.count === 1 ? '' : 's'}
                    {s.pending > 0 && <> · <CurrencyDisplay amount={s.pending} /> pending</>}
                  </p>
                )}
              </div>
            ))}
            <div className="flex justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900 dark:border-sage-800 dark:text-gray-100">
              <span>Total confirmed</span>
              <CurrencyDisplay amount={statuses.reduce((sum, s) => sum + s.confirmed, 0)} />
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
