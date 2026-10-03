import { useEffect, useState, useCallback } from 'react'
import { Plus, Check, X as XIcon, Settings2, Paperclip } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { getAccountsWithBalances } from '../../../lib/api'
import { useRealtimeRefresh } from '../../../lib/useRealtimeRefresh'
import Card, { CardHeader } from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import ReceiptModal from '../../../components/financial/ReceiptModal'
import { Field, Input, Select, Textarea } from '../../../components/ui/FormField'
import { StatusBadge } from '../../../components/ui/Badge'
import CurrencyDisplay from '../../../components/financial/CurrencyDisplay'
import EmptyState from '../../../components/ui/EmptyState'
import LoadingState from '../../../components/ui/LoadingState'
import { formatDateShort } from '../../../lib/format'

// People who can be picked as the contributor. The last option in the form
// lets you type any other name.
export const CONTRIBUTOR_OPTIONS = ['Elaine Bray', 'Arnolfo Sian', 'Arnel Sian']

export default function ProjectContributionsTab({ project, members, canManage, onChange }) {
  const { profile, role } = useAuth()
  const isAdmin = role === 'owner' || role === 'admin'
  const [contributions, setContributions] = useState([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [requirementsOpen, setRequirementsOpen] = useState(false)
  const [verifying, setVerifying] = useState(null)
  const [viewingReceipt, setViewingReceipt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('project_contributions')
      .select('*, profiles!project_contributions_profile_id_fkey(display_name), verifier:profiles!project_contributions_verified_by_fkey(display_name)')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    setContributions(data ?? [])
    setLoading(false)
  }, [project.id])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(`project-contributions-${project.id}`, [{ table: 'project_contributions', filter: `project_id=eq.${project.id}` }], load)

  function afterChange() {
    load()
    onChange?.()
  }

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        {canManage && (
          <Button variant="outline" onClick={() => setRequirementsOpen(true)}>
            <Settings2 className="h-4 w-4" /> Set Expected Amounts
          </Button>
        )}
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add Contribution
        </Button>
      </div>

      <Card>
        <CardHeader title="Contributions" />
        {loading ? (
          <LoadingState />
        ) : contributions.length === 0 ? (
          <EmptyState title="No contributions yet" message="Members can add contributions toward this project's budget." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-sage-800 text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3">Contributor</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Receipt</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-sage-800">
                {contributions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{c.contributor_name || c.profiles?.display_name}</td>
                    <td className="py-2.5 pr-3 text-gray-500">{formatDateShort(c.date)}</td>
                    <td className="py-2.5 pr-3 text-gray-500">{c.payment_method || '—'}</td>
                    <td className="py-2.5 pr-3 text-right font-semibold"><CurrencyDisplay amount={c.confirmed_amount ?? c.amount} /></td>
                    <td className="py-2.5 pr-3"><StatusBadge status={c.status} /></td>
                    <td className="py-2.5 pr-3">
                      {c.receipt_path ? (
                        <button
                          onClick={() => setViewingReceipt(c.receipt_path)}
                          title="View receipt"
                          className="rounded p-1.5 text-sage-600 hover:bg-sage-50 dark:text-sage-400 dark:hover:bg-sage-800"
                        >
                          <Paperclip className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-sage-700">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {c.status === 'pending' && (isAdmin || c.profile_id !== profile.id) && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setVerifying({ contribution: c, action: 'confirm' })} className="rounded p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setVerifying({ contribution: c, action: 'reject' })} className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                            <XIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {c.verifier && <p className="text-xs text-gray-400">by {c.verifier.display_name}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddContributionModal open={addOpen} onClose={() => setAddOpen(false)} project={project} members={members} canManage={canManage} isAdmin={isAdmin} onSaved={afterChange} />
      <RequirementsModal open={requirementsOpen} onClose={() => setRequirementsOpen(false)} project={project} members={members} onSaved={afterChange} />
      <VerifyModal state={verifying} onClose={() => setVerifying(null)} onSaved={afterChange} />
      <ReceiptModal path={viewingReceipt} onClose={() => setViewingReceipt(null)} />
    </div>
  )
}

const ALLOWED_RECEIPT_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024 // 10MB

const CUSTOM_CONTRIBUTOR = '__custom__'

function AddContributionModal({ open, onClose, project, members, canManage, isAdmin, onSaved }) {
  const { profile } = useAuth()
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), payment_method: '', account_id: '', notes: '' })
  const [receiptFile, setReceiptFile] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [contributor, setContributor] = useState('')
  const [customName, setCustomName] = useState('')

  const contributorName = (contributor === CUSTOM_CONTRIBUTOR ? customName : contributor).trim()
  // If the chosen name belongs to a site member, the contribution is recorded under their account.
  const matched = members.find((m) => m.profiles?.display_name?.trim().toLowerCase() === contributorName.toLowerCase())
  const effectiveProfileId = matched && (matched.profile_id === profile.id || canManage) ? matched.profile_id : profile.id
  const forMe = effectiveProfileId === profile.id

  useEffect(() => {
    if (open) {
      setContributor('')
      setCustomName('')
      getAccountsWithBalances({ scope: 'private', profileId: profile.id }).then(({ accounts: a }) => setAccounts(a))
      setForm({ amount: '', date: new Date().toISOString().slice(0, 10), payment_method: '', account_id: '', notes: '' })
      setReceiptFile(null)
      setError('')
    }
  }, [open, profile.id])

  function handleReceiptChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
      setError('Receipt must be a JPG, PNG, WEBP, or PDF file.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_RECEIPT_SIZE) {
      setError('Receipt must be under 10MB.')
      e.target.value = ''
      return
    }
    setError('')
    setReceiptFile(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!contributorName) {
      setError(contributor === CUSTOM_CONTRIBUTOR ? "Type the contributor's name." : 'Choose who is contributing.')
      return
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }
    setSaving(true)
    setError('')

    let receiptPath = null
    if (receiptFile) {
      const ext = receiptFile.name.split('.').pop()
      receiptPath = `family/${project.family_id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('receipts').upload(receiptPath, receiptFile, { contentType: receiptFile.type })
      if (uploadErr) {
        setSaving(false)
        setError(`Couldn't upload receipt: ${uploadErr.message}`)
        return
      }
    }

    const { data: contribution, error: err } = await supabase
      .from('project_contributions')
      .insert({
        project_id: project.id,
        profile_id: effectiveProfileId,
        contributor_name: contributorName,
        amount: Number(form.amount),
        date: form.date,
        payment_method: form.payment_method || null,
        account_id: forMe ? form.account_id || null : null,
        notes: form.notes || null,
        receipt_path: receiptPath,
        // Admins don't need anyone's approval.
        ...(isAdmin
          ? { status: 'confirmed', confirmed_amount: Number(form.amount), verified_by: profile.id, verified_at: new Date().toISOString() }
          : { status: 'pending' }),
      })
      .select()
      .single()

    if (err) {
      setSaving(false)
      setError(err.message)
      return
    }

    if (forMe && form.account_id) {
      const { data: txn } = await supabase
        .from('transactions')
        .insert({
          scope: 'private',
          owner_profile_id: profile.id,
          type: 'contribution',
          amount: Number(form.amount),
          date: form.date,
          account_id: form.account_id,
          project_id: project.id,
          contribution_id: contribution.id,
          description: `Contribution to ${project.name}`,
          created_by: profile.id,
        })
        .select()
        .single()
      if (txn) {
        await supabase.from('project_contributions').update({ transaction_id: txn.id }).eq('id', contribution.id)
      }
    }

    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Contribution">
      <form onSubmit={handleSubmit}>
        <Field label="Contributor" required>
          <Select value={contributor} onChange={(e) => setContributor(e.target.value)}>
            <option value="">Select contributor</option>
            {CONTRIBUTOR_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value={CUSTOM_CONTRIBUTOR}>Other (type a name)…</option>
          </Select>
          {contributor === CUSTOM_CONTRIBUTOR && (
            <Input className="mt-2" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Contributor's name" autoFocus />
          )}
        </Field>
        <Field label="Amount (₱)" required>
          <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="Payment Method">
          <Input value={form.payment_method} onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))} placeholder="GCash, Cash…" />
        </Field>
        {forMe && (
          <Field label="Source Account (optional)" hint="If set, this amount will be deducted from your private account balance.">
            <Select value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}>
              <option value="">Don't track source account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
        <Field label="Receipt (optional)" hint="Upload proof of the money transfer — JPG, PNG, WEBP, or PDF, up to 10MB.">
          <input
            type="file"
            accept={ALLOWED_RECEIPT_TYPES.join(',')}
            onChange={handleReceiptChange}
            className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sage-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-sage-700 hover:file:bg-sage-200 dark:file:bg-sage-800 dark:file:text-sage-200"
          />
          {receiptFile && <p className="mt-1 text-xs text-gray-500">{receiptFile.name}</p>}
        </Field>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>{isAdmin ? 'Add Contribution' : 'Submit Contribution'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function RequirementsModal({ open, onClose, project, members, onSaved }) {
  const { showToast } = useToast()
  const [amounts, setAmounts] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      supabase
        .from('project_contribution_requirements')
        .select('*')
        .eq('project_id', project.id)
        .then(({ data }) => setAmounts(Object.fromEntries((data ?? []).map((r) => [r.profile_id, r.expected_amount]))))
    }
  }, [open, project.id])

  async function handleSave() {
    setSaving(true)
    for (const m of members) {
      const amount = Number(amounts[m.profile_id] || 0)
      const { error } = await supabase.from('project_contribution_requirements').upsert(
        { project_id: project.id, profile_id: m.profile_id, expected_amount: amount },
        { onConflict: 'project_id,profile_id' }
      )
      if (error) {
        setSaving(false)
        showToast(`Couldn't save expected amount for ${m.profiles?.display_name}: ${error.message}`)
        return
      }
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Set Expected Contributions" size="sm">
      <div className="space-y-3 mb-4">
        {members.map((m) => (
          <Field key={m.profile_id} label={m.profiles?.display_name}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amounts[m.profile_id] ?? ''}
              onChange={(e) => setAmounts((a) => ({ ...a, [m.profile_id]: e.target.value }))}
            />
          </Field>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Save</Button>
      </div>
    </Modal>
  )
}

function VerifyModal({ state, onClose, onSaved }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [partialAmount, setPartialAmount] = useState('')
  const [partial, setPartial] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNote('')
    setPartialAmount('')
    setPartial(false)
  }, [state])

  if (!state) return null
  const { contribution, action } = state

  async function handleConfirm() {
    setSaving(true)
    const status = action === 'confirm' ? (partial ? 'partially_confirmed' : 'confirmed') : 'rejected'
    const { error } = await supabase
      .from('project_contributions')
      .update({
        status,
        verified_by: profile.id,
        verified_at: new Date().toISOString(),
        verification_note: note || null,
        confirmed_amount: action === 'confirm' ? (partial ? Number(partialAmount) : contribution.amount) : null,
      })
      .eq('id', contribution.id)
    setSaving(false)
    if (error) {
      showToast(`Couldn't ${action} contribution: ${error.message}`)
      return
    }
    onSaved?.()
    onClose()
  }

  return (
    <Modal open={!!state} onClose={onClose} title={action === 'confirm' ? 'Confirm Contribution' : 'Reject Contribution'} size="sm">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
        {contribution.contributor_name || contribution.profiles?.display_name}'s <CurrencyDisplay amount={contribution.amount} className="font-semibold" /> contribution.
      </p>
      {action === 'confirm' && (
        <label className="mb-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
          Only part of this amount was received
        </label>
      )}
      {action === 'confirm' && partial && (
        <Field label="Confirmed Amount (₱)" required>
          <Input type="number" min="0.01" step="0.01" max={contribution.amount} value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} />
        </Field>
      )}
      <Field label="Note">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional verification note" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={action === 'confirm' ? 'primary' : 'danger'} onClick={handleConfirm} loading={saving}>
          {action === 'confirm' ? 'Confirm' : 'Reject'}
        </Button>
      </div>
    </Modal>
  )
}
