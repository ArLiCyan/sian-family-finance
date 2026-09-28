-- 011: Computed views and dashboard/report aggregate functions.
-- Views use security_invoker so RLS is evaluated against the querying user,
-- not the view owner (which would otherwise bypass RLS in Supabase/Postgres).

alter table project_contributions add column if not exists confirmed_amount numeric(14,2);

-- ---------- Account balances (never stored, always derived) ----------

create or replace view account_ledger
with (security_invoker = true) as
select account_id, case
    when type in ('income', 'deposit', 'refund', 'loan_received', 'adjustment') then amount
    when type in ('expense', 'withdrawal', 'debt_payment', 'loan_given', 'contribution') then -amount
    when type = 'transfer' then -amount
    else 0
  end as delta
from transactions
where deleted_at is null and account_id is not null
union all
select to_account_id as account_id, amount as delta
from transactions
where deleted_at is null and type = 'transfer' and to_account_id is not null;

create or replace view account_balances
with (security_invoker = true) as
select fa.id as account_id, fa.starting_balance + coalesce(sum(al.delta), 0) as current_balance
from financial_accounts fa
left join account_ledger al on al.account_id = fa.id
group by fa.id, fa.starting_balance;

-- ---------- Project financial summary (budget, funding %, spending %) ----------

create or replace view project_financial_summary
with (security_invoker = true) as
select
  p.id as project_id,
  p.budget,
  coalesce(req.expected_total, 0) as expected_total,
  coalesce(contrib.pending_total, 0) as pending_total,
  coalesce(contrib.confirmed_total, 0) as confirmed_total,
  coalesce(exp.expense_total, 0) as expense_total,
  greatest(coalesce(req.expected_total, 0) - coalesce(contrib.confirmed_total, 0), 0) as unfunded_amount,
  p.budget - coalesce(exp.expense_total, 0) as remaining_budget,
  case when coalesce(req.expected_total, 0) > 0
    then round(coalesce(contrib.confirmed_total, 0) / req.expected_total * 100, 2)
    else 0 end as funding_percentage,
  case when p.budget > 0
    then round(coalesce(exp.expense_total, 0) / p.budget * 100, 2)
    else 0 end as spending_percentage
from projects p
left join (
  select project_id, sum(expected_amount) as expected_total
  from project_contribution_requirements group by project_id
) req on req.project_id = p.id
left join (
  select project_id,
    sum(amount) filter (where status in ('pending', 'submitted')) as pending_total,
    sum(coalesce(confirmed_amount, amount)) filter (where status in ('confirmed', 'partially_confirmed')) as confirmed_total
  from project_contributions group by project_id
) contrib on contrib.project_id = p.id
left join (
  select project_id, sum(amount) as expense_total
  from project_expenses where deleted_at is null group by project_id
) exp on exp.project_id = p.id;

-- ---------- Per-member contribution status within a project ----------

create or replace view project_member_contribution_status
with (security_invoker = true) as
select
  req.project_id,
  req.profile_id,
  req.expected_amount,
  coalesce(c.confirmed, 0) as confirmed_amount,
  coalesce(c.pending, 0) as pending_amount,
  greatest(req.expected_amount - coalesce(c.confirmed, 0), 0) as remaining_amount,
  case when req.expected_amount > 0
    then round(coalesce(c.confirmed, 0) / req.expected_amount * 100, 2)
    else 0 end as percentage_complete
from project_contribution_requirements req
left join (
  select project_id, profile_id,
    sum(coalesce(confirmed_amount, amount)) filter (where status in ('confirmed', 'partially_confirmed')) as confirmed,
    sum(amount) filter (where status in ('pending', 'submitted')) as pending
  from project_contributions group by project_id, profile_id
) c on c.project_id = req.project_id and c.profile_id = req.profile_id;

-- ---------- Debt remaining balance ----------

create or replace view debt_balances
with (security_invoker = true) as
select d.id as debt_id, d.original_amount - coalesce(sum(dp.amount), 0) as remaining_amount
from debts d
left join debt_payments dp on dp.debt_id = d.id
group by d.id, d.original_amount;

-- ---------- Goal progress ----------

create or replace view goal_progress
with (security_invoker = true) as
select g.id as goal_id, coalesce(sum(gc.amount), 0) as current_amount,
  case when g.target_amount > 0
    then round(coalesce(sum(gc.amount), 0) / g.target_amount * 100, 2)
    else 0 end as percentage_complete
from goals g
left join goal_contributions gc on gc.goal_id = g.id
group by g.id, g.target_amount;

-- ---------- Dashboard aggregate RPCs ----------
-- Plain SQL, invoker-rights (default): RLS on the underlying tables applies
-- using the caller's own permissions, so a family member naturally only ever
-- sees family-scope totals, and private totals are always their own.

create or replace function public.get_family_dashboard_summary(p_family_id uuid, p_start date, p_end date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total_income', coalesce((select sum(amount) from transactions
      where scope = 'family' and family_id = p_family_id and type = 'income'
        and date between p_start and p_end and deleted_at is null), 0),
    'total_expenses', coalesce((select sum(amount) from transactions
      where scope = 'family' and family_id = p_family_id and type = 'expense'
        and date between p_start and p_end and deleted_at is null), 0),
    'total_contributions', coalesce((select sum(coalesce(pc.confirmed_amount, pc.amount))
      from project_contributions pc join projects p on p.id = pc.project_id
      where p.family_id = p_family_id and pc.status in ('confirmed', 'partially_confirmed')
        and pc.date between p_start and p_end), 0),
    'active_projects', (select count(*) from projects where family_id = p_family_id and status = 'active' and deleted_at is null),
    'outstanding_debts', coalesce((select sum(db.remaining_amount) from debts d join debt_balances db on db.debt_id = d.id
      where d.family_id = p_family_id and d.scope = 'family' and d.status in ('active', 'partially_paid', 'overdue')), 0),
    'active_goals', (select count(*) from goals where family_id = p_family_id and scope = 'family' and status = 'active'),
    'total_savings', coalesce((select sum(gp.current_amount) from goals g join goal_progress gp on gp.goal_id = g.id
      where g.family_id = p_family_id and g.scope = 'family' and g.status in ('active', 'completed')), 0)
  )
$$;

create or replace function public.get_private_dashboard_summary(p_start date, p_end date)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total_income', coalesce((select sum(amount) from transactions
      where scope = 'private' and owner_profile_id = current_profile_id() and type = 'income'
        and date between p_start and p_end and deleted_at is null), 0),
    'total_expenses', coalesce((select sum(amount) from transactions
      where scope = 'private' and owner_profile_id = current_profile_id() and type = 'expense'
        and date between p_start and p_end and deleted_at is null), 0),
    'total_contributions_made', coalesce((select sum(pc.amount) from project_contributions pc
      where pc.profile_id = current_profile_id() and pc.status in ('confirmed', 'partially_confirmed')
        and pc.date between p_start and p_end), 0),
    'outstanding_debts', coalesce((select sum(db.remaining_amount) from debts d join debt_balances db on db.debt_id = d.id
      where d.owner_profile_id = current_profile_id() and d.scope = 'private' and d.status in ('active', 'partially_paid', 'overdue')), 0),
    'active_goals', (select count(*) from goals where owner_profile_id = current_profile_id() and scope = 'private' and status = 'active'),
    'total_savings', coalesce((select sum(gp.current_amount) from goals g join goal_progress gp on gp.goal_id = g.id
      where g.owner_profile_id = current_profile_id() and g.scope = 'private' and g.status in ('active', 'completed')), 0)
  )
$$;

-- Family member summary card data (for the Family Members page)
create or replace function public.get_member_financial_summary(p_profile_id uuid, p_family_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total_family_contributions', coalesce((select sum(coalesce(pc.confirmed_amount, pc.amount))
      from project_contributions pc join projects p on p.id = pc.project_id
      where pc.profile_id = p_profile_id and p.family_id = p_family_id and pc.status in ('confirmed', 'partially_confirmed')), 0),
    'active_projects', (select count(distinct pm.project_id) from project_members pm join projects p on p.id = pm.project_id
      where pm.profile_id = p_profile_id and p.family_id = p_family_id and p.status = 'active'),
    'active_family_goals', (select count(*) from goals where scope = 'family' and family_id = p_family_id
      and status = 'active' and created_by = p_profile_id)
  )
$$;
