import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Wallet, ArrowDownLeft, ArrowUpRight, Pencil, Archive, Trash2, TrendingUp, TrendingDown, ListOrdered } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import { useAuth } from '../../contexts/AuthContext'
import { ACCOUNT_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from '../../lib/api'
import { formatDate, formatDateShort } from '../../lib/format'
import Card, { CardHeader } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import LoadingState from '../../components/ui/LoadingState'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import CurrencyDisplay from '../../components/financial/CurrencyDisplay'
import AccountForm from './AccountForm'
import ExportMenu from '../../components/ui/ExportMenu'
import { exportDocumentToCsv, exportDocumentToXls, exportDocumentToPdf } from '../../lib/exportUtils'
import AccountMoneyModal from './AccountMoneyModal'
import { ACCOUNT_TRASH_DAYS } from './AccountShelfModal'

// Same rules as the account_ledger database view.
const INFLOW = new Set(['income', 'deposit', 'refund', 'loan_received', 'adjustment'])
const OUTFLOW = new Set(['expense', 'withdrawal', 'debt_payment', 'loan_given', 'contribution', 'transfer'])
const PAGE_SIZE = 15
const GREEN = '#34a76b'
const RED = '#e0645c'

const money = (n) => `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
const tooltipStyle = { backgroundColor: '#1d2b22', border: '1px solid #35503d', borderRadius: 8, color: '#e8efe9', fontSize: 12 }

export default function AccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { profile } = useAuth()
  const [account, setAccount] = useState(null)
  const [balance, setBalance] = useState(0)
  const [txns, setTxns] = useState([])
  const [accountNames, setAccountNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [moneyMode, setMoneyMode] = useState(null) // 'in' | 'out' | null
  const [editOpen, setEditOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [filter, setFilter] = useState('all')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [days, setDays] = useState(30)

  const load = useCallback(async () => {
    const { data: acc } = await supabase.from('financial_accounts').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
    if (!acc) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setAccount(acc)
    const [{ data: bal }, { data: rows }] = await Promise.all([
      supabase.from('account_balances').select('current_balance').eq('account_id', id).maybeSingle(),
      supabase
        .from('transactions')
        .select('*, categories(name), projects(name), profiles!transactions_created_by_fkey(display_name)')
        .or(`account_id.eq.${id},to_account_id.eq.${id}`)
        .is('deleted_at', null)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true }),
    ])
    setBalance(Number(bal?.current_balance ?? acc.starting_balance))
    setTxns(rows ?? [])

    const otherIds = [...new Set((rows ?? []).flatMap((t) => [t.account_id, t.to_account_id]).filter((x) => x && x !== id))]
    if (otherIds.length) {
      const { data: accs } = await supabase.from('financial_accounts').select('id, name').in('id', otherIds)
      setAccountNames(Object.fromEntries((accs ?? []).map((a) => [a.id, a.name])))
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // One entry per money movement on this account, oldest first, with the balance after it.
  const entries = useMemo(() => {
    if (!account) return []
    let running = Number(account.starting_balance)
    const list = [
      { key: 'opening', date: account.created_at.slice(0, 10), delta: running, label: 'Opening balance', sub: 'Account created', by: null, running, opening: true },
    ]
    for (const t of txns) {
      const amount = Number(t.amount)
      let delta = 0
      let label = TRANSACTION_TYPE_LABELS[t.type] ?? t.type
      if (t.type === 'transfer') {
        if (t.account_id === id) {
          delta = -amount
          label = `Transfer to ${accountNames[t.to_account_id] ?? 'another account'}`
        } else {
          delta = amount
          label = `Transfer from ${accountNames[t.account_id] ?? 'another account'}`
        }
      } else if (INFLOW.has(t.type)) delta = amount
      else if (OUTFLOW.has(t.type)) delta = -amount
      running += delta
      const details = [t.description, t.categories?.name, t.projects?.name && `Project: ${t.projects.name}`].filter(Boolean).join(' · ')
      list.push({ key: t.id, date: t.date, delta, label, sub: details, notes: t.notes, by: t.profiles?.display_name ?? null, running })
    }
    return list
  }, [account, txns, accountNames, id])

  const moves = entries.filter((e) => !e.opening)
  const totalIn = moves.filter((e) => e.delta > 0).reduce((s, e) => s + e.delta, 0)
  const totalOut = moves.filter((e) => e.delta < 0).reduce((s, e) => s - e.delta, 0)

  const trend = useMemo(() => {
    if (!entries.length) return []
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - (days - 1))
    const iso = (d) => d.toISOString().slice(0, 10)
    const startIso = iso(startDate)
    let bal = entries.filter((e) => e.date < startIso).reduce((s, e) => s + e.delta, 0)
    const byDay = {}
    entries.filter((e) => e.date >= startIso).forEach((e) => { byDay[e.date] = (byDay[e.date] ?? 0) + e.delta })
    const points = []
    for (let d = new Date(startDate); iso(d) <= iso(today); d.setDate(d.getDate() + 1)) {
      bal += byDay[iso(d)] ?? 0
      points.push({ day: formatDateShort(iso(d)).replace(/, \d{4}$/, ''), balance: Math.round(bal * 100) / 100 })
    }
    return points
  }, [entries, days])

  const monthly = useMemo(() => {
    const today = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, month: d.toLocaleString('en-PH', { month: 'short' }), in: 0, out: 0 })
    }
    for (const e of moves) {
      const m = months.find((x) => x.key === e.date.slice(0, 7))
      if (!m) continue
      if (e.delta > 0) m.in += e.delta
      else m.out -= e.delta
    }
    return months
  }, [moves])

  async function handleArchive() {
    const { error } = await supabase.from('financial_accounts').update({ status: 'archived' }).eq('id', id)
    setArchiving(false)
    if (error) {
      showToast(`Couldn't archive account: ${error.message}`)
      return
    }
    navigate('/accounts')
  }

  async function handleDelete() {
    const { error } = await supabase.from('financial_accounts').update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq('id', id)
    setDeleting(false)
    if (error) {
      showToast(`Couldn't delete account: ${error.message}`)
      return
    }
    navigate('/accounts')
  }

  // Printable copy of this account: details plus the full history, oldest first.
  // symbol: "PHP " for PDF (its font has no peso sign), "₱" for Excel, "" for CSV.
  function buildReport(symbol) {
    const fmt = (n) => `${symbol}${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    return {
      title: `${account.name} — Account Statement`,
      subtitle: `${ACCOUNT_TYPE_LABELS[account.account_type]} · printed ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      details: [
        ['Account', account.name],
        ['Type', ACCOUNT_TYPE_LABELS[account.account_type]],
        ['Description', account.description?.trim() || '—'],
        ['Opened', formatDate(account.created_at)],
        ['Opening balance', fmt(account.starting_balance)],
        ['Total money in', fmt(totalIn)],
        ['Total money out', fmt(totalOut)],
        ['Current balance', fmt(balance)],
      ],
      sections: [
        {
          title: 'History',
          headers: ['Date', 'Details', 'Amount', 'Balance after', 'By'],
          rows: entries.map((e) => [
            e.date,
            [e.label, e.sub, e.notes].filter(Boolean).join(' — '),
            `${e.delta >= 0 ? '+' : '-'}${fmt(Math.abs(e.delta))}`,
            fmt(e.running),
            e.by ?? '',
          ]),
        },
      ],
    }
  }
  const fileBase = String(account?.name ?? 'account').replace(/[\\/:*?"<>|]/g, '-')
  async function exportPdf() {
    try {
      await exportDocumentToPdf(`${fileBase}-statement.pdf`, buildReport('PHP '))
    } catch (err) {
      showToast(`Couldn't create the PDF: ${err.message}`)
    }
  }

  if (loading) return <LoadingState />
  if (notFound) {
    return (
      <div>
        <Link to="/accounts" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
          <ChevronLeft className="h-4 w-4" /> All Accounts
        </Link>
        <EmptyState icon={Wallet} title="Account not found" message="It may have been archived, or you may not have access to it." />
      </div>
    )
  }

  const history = [...entries].reverse().filter((e) => (filter === 'in' ? e.delta > 0 : filter === 'out' ? e.delta < 0 : true))
  const lastActivity = moves.length ? moves[moves.length - 1].date : null

  return (
    <div>
      <Link to="/accounts" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
        <ChevronLeft className="h-4 w-4" /> All Accounts
      </Link>

      {/* Header */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-sage-50 p-3 text-sage-600 dark:bg-sage-800 dark:text-sage-300">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{account.name}</h1>
                <Badge color="navy">{ACCOUNT_TYPE_LABELS[account.account_type]}</Badge>
                <Badge color="gray" className="capitalize">{account.scope}</Badge>
              </div>
              {account.description?.trim() ? (
                <p className="mt-1 max-w-xl whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{account.description.trim()}</p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">No description</p>
              )}
              <p className="mt-1 text-xs text-gray-400">Opened {formatDate(account.created_at)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Current balance</p>
            <p className={clsx('text-3xl font-bold', balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100')}>
              <CurrencyDisplay amount={balance} />
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-sage-800">
          <Button onClick={() => setMoneyMode('in')}>
            <ArrowDownLeft className="h-4 w-4" /> Cash In
          </Button>
          <Button variant="outline" className="!border-red-300 !text-red-600 hover:!bg-red-50 dark:!border-red-800 dark:!text-red-400 dark:hover:!bg-red-900/20" onClick={() => setMoneyMode('out')}>
            <ArrowUpRight className="h-4 w-4" /> Cash Out
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <ExportMenu
              onCsv={() => exportDocumentToCsv(`${fileBase}-statement.csv`, buildReport(''))}
              onXls={() => exportDocumentToXls(`${fileBase}-statement.xls`, buildReport('₱'))}
              onPdf={exportPdf}
            />
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" onClick={() => setArchiving(true)}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
            <Button variant="outline" className="!text-red-600 hover:!bg-red-50 dark:!text-red-400 dark:hover:!bg-red-900/20" onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={Wallet} label="Opening balance" value={<CurrencyDisplay amount={account.starting_balance} />} />
        <SummaryCard icon={TrendingUp} label="Total money in" tone="text-green-600 dark:text-green-400" value={<CurrencyDisplay amount={totalIn} />} />
        <SummaryCard icon={TrendingDown} label="Total money out" tone="text-red-600 dark:text-red-400" value={<CurrencyDisplay amount={totalOut} />} />
        <SummaryCard
          icon={ListOrdered}
          label="Activity"
          value={`${moves.length} ${moves.length === 1 ? 'entry' : 'entries'}`}
          hint={lastActivity ? `Last: ${formatDateShort(lastActivity)}` : 'No activity yet'}
        />
      </div>

      {/* Charts */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Balance trend"
            action={
              <div className="flex gap-1 rounded-lg bg-sage-50 p-0.5 text-xs dark:bg-sage-800/60">
                {[30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={clsx('rounded-md px-2.5 py-1 font-medium', days === d ? 'bg-white text-gray-900 shadow-sm dark:bg-sage-700 dark:text-gray-100' : 'text-gray-500')}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            }
          />
          {moves.length === 0 ? (
            <EmptyState title="No activity yet" message="Use Cash In or Cash Out to start the history." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend} margin={{ left: 0, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} interval="preserveStartEnd" minTickGap={30} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={56} tickFormatter={money} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, 'Balance']} />
                <Area type="monotone" dataKey="balance" stroke={GREEN} strokeWidth={2} fill="url(#balFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHeader title="Money in vs out" subtitle="Last 6 months" />
          {moves.length === 0 ? (
            <EmptyState title="No activity yet" message="Monthly totals will show up here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} width={56} tickFormatter={money} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.08)' }} formatter={(v, name) => [`₱${Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="in" name="Money in" fill={GREEN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" name="Money out" fill={RED} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader
          title="History"
          subtitle="Every movement of money in this account, newest first"
          action={
            <div className="flex gap-1 rounded-lg bg-sage-50 p-0.5 text-xs dark:bg-sage-800/60">
              {[['all', 'All'], ['in', 'Money in'], ['out', 'Money out']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => { setFilter(v); setShown(PAGE_SIZE) }}
                  className={clsx('rounded-md px-2.5 py-1 font-medium', filter === v ? 'bg-white text-gray-900 shadow-sm dark:bg-sage-700 dark:text-gray-100' : 'text-gray-500')}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        />
        {history.length === 0 ? (
          <EmptyState title="Nothing here" message="No entries match this filter." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400 dark:border-sage-800">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Details</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2 pr-3 text-right">Balance after</th>
                    <th className="py-2 pr-3">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                  {history.slice(0, shown).map((e) => (
                    <tr key={e.key}>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-gray-500">{formatDateShort(e.date)}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{e.label}</p>
                        {e.sub && <p className="text-xs text-gray-500 dark:text-gray-400">{e.sub}</p>}
                        {e.notes && <p className="text-xs italic text-gray-400">{e.notes}</p>}
                      </td>
                      <td className={clsx('whitespace-nowrap py-2.5 pr-3 text-right font-semibold', e.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                        {e.delta >= 0 ? '+' : '−'}
                        <CurrencyDisplay amount={Math.abs(e.delta)} />
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right text-gray-600 dark:text-gray-300">
                        <CurrencyDisplay amount={e.running} />
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-gray-400">{e.by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.length > shown && (
              <div className="mt-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                  Show more ({history.length - shown} left)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <AccountMoneyModal open={!!moneyMode} mode={moneyMode ?? 'in'} account={account} balance={balance} onClose={() => setMoneyMode(null)} onSaved={load} />
      <AccountForm open={editOpen} onClose={() => setEditOpen(false)} onSaved={load} initial={account} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title="Move to Trash?"
        message={`"${account.name}" moves to Trash and can be restored within ${ACCOUNT_TRASH_DAYS} days. After that it's permanently deleted, along with its Cash In / Cash Out entries. Other transactions that used this account are kept, just without an account.`}
        confirmLabel="Move to Trash"
      />
      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        onConfirm={handleArchive}
        variant="primary"
        title="Archive account?"
        message="Archived accounts are hidden from lists but their transaction history is preserved."
        confirmLabel="Archive"
      />
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, hint, tone = 'text-gray-900 dark:text-gray-100' }) {
  return (
    <Card className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className={clsx('mt-1.5 text-lg font-bold', tone)}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
      </div>
      <div className="rounded-lg bg-sage-50 p-2 text-sage-600 dark:bg-sage-800 dark:text-sage-300">
        <Icon className="h-5 w-5" />
      </div>
    </Card>
  )
}
