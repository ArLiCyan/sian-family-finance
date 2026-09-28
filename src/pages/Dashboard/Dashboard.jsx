import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet, TrendingUp, TrendingDown, HandCoins, FolderKanban, Landmark, Target, PiggyBank,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useFinanceMode } from '../../contexts/FinanceModeContext'
import { generateDueRecurring, getAccountsWithBalances } from '../../lib/api'
import { getPresetRange, rangePresets } from '../../lib/dateRanges'
import PageHeader from '../../components/layout/PageHeader'
import FinancialCard from '../../components/financial/FinancialCard'
import Card, { CardHeader } from '../../components/ui/Card'
import { Select } from '../../components/ui/FormField'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import { StatusBadge } from '../../components/ui/Badge'
import { formatDateShort } from '../../lib/format'
import { TRANSACTION_TYPE_LABELS } from '../../lib/api'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'

const PIE_COLORS = ['#2c4876', '#3d5f92', '#5f80af', '#8fa9cc', '#b8cbe1', '#f59e0b', '#10b981', '#ef4444']

export default function Dashboard() {
  const { profile, family } = useAuth()
  const { mode, isFamily } = useFinanceMode()
  const [preset, setPreset] = useState('this_month')
  const [summary, setSummary] = useState(null)
  const [balance, setBalance] = useState(0)
  const [recent, setRecent] = useState([])
  const [byCategory, setByCategory] = useState([])
  const [monthly, setMonthly] = useState([])
  const [loading, setLoading] = useState(true)

  const range = getPresetRange(preset)

  const load = useCallback(async () => {
    if (!profile) return
    if (isFamily && !family) return
    setLoading(true)
    await generateDueRecurring()

    const scopeFilter = isFamily ? { scope: 'family', familyId: family?.id } : { scope: 'private', profileId: profile.id }
    const txnScopeQuery = (q) => (isFamily ? q.eq('family_id', family.id) : q.eq('owner_profile_id', profile.id))

    const [summaryRes, accountsRes, recentRes, catRes, monthlyRes] = await Promise.all([
      isFamily
        ? supabase.rpc('get_family_dashboard_summary', { p_family_id: family.id, p_start: range.start, p_end: range.end })
        : supabase.rpc('get_private_dashboard_summary', { p_start: range.start, p_end: range.end }),
      getAccountsWithBalances(scopeFilter),
      txnScopeQuery(
        supabase
          .from('transactions')
          .select('*, categories(name, icon)')
          .eq('scope', mode)
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(8)
      ),
      txnScopeQuery(
        supabase
          .from('transactions')
          .select('amount, categories(name)')
          .eq('scope', mode)
          .eq('type', 'expense')
          .gte('date', range.start)
          .lte('date', range.end)
          .is('deleted_at', null)
      ),
      getMonthlyTrend(scopeFilter),
    ])

    setSummary(summaryRes.data)
    setBalance(accountsRes.accounts.reduce((sum, a) => sum + (accountsRes.balances[a.id] ?? 0), 0))
    setRecent(recentRes.data ?? [])
    setByCategory(aggregateByCategory(catRes.data))
    setMonthly(monthlyRes)

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, family?.id, isFamily, preset])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <LoadingState label="Loading dashboard…" />

  return (
    <div>
      <PageHeader
        title={isFamily ? `Welcome back, ${profile?.first_name}` : `My Finances`}
        subtitle={isFamily ? 'SIAN Family financial overview' : 'Your private financial overview'}
        action={
          <Select value={preset} onChange={(e) => setPreset(e.target.value)} className="w-40">
            {rangePresets.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 mb-6">
        <FinancialCard label={isFamily ? 'Family Balance' : 'My Balance'} amount={balance} icon={Wallet} tone="navy" />
        <FinancialCard label="Income" amount={summary?.total_income ?? 0} icon={TrendingUp} tone="positive" />
        <FinancialCard label="Expenses" amount={summary?.total_expenses ?? 0} icon={TrendingDown} tone="negative" />
        {isFamily ? (
          <FinancialCard label="Contributions" amount={summary?.total_contributions ?? 0} icon={HandCoins} />
        ) : (
          <FinancialCard label="Contributions Made" amount={summary?.total_contributions_made ?? 0} icon={HandCoins} />
        )}
        {isFamily && (
          <FinancialCard label="Active Projects" amount={summary?.active_projects ?? 0} icon={FolderKanban} isCurrency={false} />
        )}
        <FinancialCard label="Outstanding Debts" amount={summary?.outstanding_debts ?? 0} icon={Landmark} tone="negative" />
        <FinancialCard label="Active Goals" amount={summary?.active_goals ?? 0} icon={Target} isCurrency={false} />
        <FinancialCard label="Total Savings" amount={summary?.total_savings ?? 0} icon={PiggyBank} tone="positive" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader title="Income vs Expenses" subtitle="Last 6 months" />
          {monthly.length === 0 ? (
            <EmptyState title="No data yet" message="Record some transactions to see trends." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={40} />
                <Tooltip formatter={(v) => `₱${Number(v).toLocaleString()}`} />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHeader title="Spending by Category" subtitle={rangePresets.find((p) => p.value === preset)?.label} />
          {byCategory.length === 0 ? (
            <EmptyState title="No expenses yet" message="Expenses in this period will appear here." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `₱${Number(v).toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent Transactions" action={<Link to="/transactions" className="text-sm text-sage-600 hover:underline dark:text-sage-400">View all</Link>} />
        {recent.length === 0 ? (
          <EmptyState title="No transactions yet" message="Start by adding your first income or expense." />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-sage-800">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t.description || TRANSACTION_TYPE_LABELS[t.type]}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDateShort(t.date)} · {t.categories?.name ?? TRANSACTION_TYPE_LABELS[t.type]}
                  </p>
                </div>
                <CurrencyDisplay
                  amount={t.amount}
                  positive={t.type === 'income' || t.type === 'deposit' || t.type === 'refund'}
                  negative={t.type === 'expense' || t.type === 'withdrawal' || t.type === 'contribution'}
                  className="font-semibold"
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function aggregateByCategory(rows) {
  const map = new Map()
  for (const r of rows ?? []) {
    const name = r.categories?.name ?? 'Uncategorized'
    map.set(name, (map.get(name) ?? 0) + Number(r.amount))
  }
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
}

async function getMonthlyTrend({ scope, familyId, profileId }) {
  const months = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
    months.push({ label: d.toLocaleString('en-PH', { month: 'short' }), start, end })
  }

  const results = []
  for (const m of months) {
    let query = supabase.from('transactions').select('amount, type').eq('scope', scope).gte('date', m.start).lte('date', m.end).is('deleted_at', null)
    query = scope === 'private' ? query.eq('owner_profile_id', profileId) : query.eq('family_id', familyId)
    const { data } = await query
    const income = (data ?? []).filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount), 0)
    const expenses = (data ?? []).filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount), 0)
    results.push({ month: m.label, income, expenses })
  }
  return results
}
