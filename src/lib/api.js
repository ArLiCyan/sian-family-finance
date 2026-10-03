import { supabase } from './supabase'

export async function generateDueRecurring() {
  try {
    await supabase.rpc('generate_due_recurring_transactions')
  } catch {
    /* non-fatal */
  }
}

export async function getAccountsWithBalances({ scope, familyId, profileId }) {
  let query = supabase.from('financial_accounts').select('*').eq('scope', scope).eq('status', 'active')
  query = scope === 'private' ? query.eq('owner_profile_id', profileId) : query.eq('family_id', familyId)
  const { data: accounts, error } = await query.order('created_at', { ascending: true })
  if (error || !accounts?.length) return { accounts: accounts ?? [], balances: {} }

  const ids = accounts.map((a) => a.id)
  const { data: balances } = await supabase.from('account_balances').select('*').in('account_id', ids)
  const balanceMap = Object.fromEntries((balances ?? []).map((b) => [b.account_id, Number(b.current_balance)]))
  return { accounts, balances: balanceMap }
}

export async function getCategories(type) {
  let query = supabase.from('categories').select('*').eq('is_active', true).order('name')
  if (type) query = query.eq('type', type)
  const { data } = await query
  return data ?? []
}

export async function getFamilyMembers(familyId) {
  const { data } = await supabase
    .from('family_memberships')
    .select('*, profiles(*)')
    .eq('family_id', familyId)
    .eq('status', 'active')
    .order('joined_at')
  return data ?? []
}

export const TRANSACTION_TYPE_LABELS = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  contribution: 'Contribution',
  withdrawal: 'Cash Out',
  deposit: 'Cash In',
  refund: 'Refund',
  debt_payment: 'Debt Payment',
  loan_received: 'Loan Received',
  loan_given: 'Loan Given',
  adjustment: 'Adjustment',
}

export const ACCOUNT_TYPE_LABELS = {
  cash: 'Cash',
  gcash: 'GCash',
  bank: 'Bank Account',
  maya: 'Maya',
  savings: 'Savings Account',
  ewallet: 'E-Wallet',
  other: 'Other',
}
