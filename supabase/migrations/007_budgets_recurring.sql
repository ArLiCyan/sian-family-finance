-- 007: Budgeting and recurring transactions

create table budgets (
  id uuid primary key default gen_random_uuid(),
  scope record_scope not null,
  family_id uuid references families(id) on delete cascade,
  owner_profile_id uuid references profiles(id) on delete cascade,
  project_id uuid references projects(id),
  name text not null,
  period budget_period not null default 'monthly',
  start_date date not null default date_trunc('month', current_date),
  end_date date,
  warning_threshold_pct int not null default 75 check (warning_threshold_pct between 1 and 100),
  critical_threshold_pct int not null default 90 check (critical_threshold_pct between 1 and 100),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_budget_scope check (
    (scope = 'private' and owner_profile_id is not null and family_id is null)
    or
    (scope = 'family' and family_id is not null)
  )
);

create index idx_budgets_family on budgets(family_id);
create index idx_budgets_owner on budgets(owner_profile_id);

create trigger trg_budgets_updated_at
  before update on budgets
  for each row execute function set_updated_at();

create table budget_categories (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references budgets(id) on delete cascade,
  category_id uuid not null references categories(id),
  amount_limit numeric(14,2) not null check (amount_limit >= 0),
  created_at timestamptz not null default now(),
  unique (budget_id, category_id)
);

create table recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  scope record_scope not null,
  family_id uuid references families(id) on delete cascade,
  owner_profile_id uuid references profiles(id) on delete cascade,
  type transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  account_id uuid references financial_accounts(id),
  to_account_id uuid references financial_accounts(id),
  category_id uuid references categories(id),
  description text,
  frequency recurrence_frequency not null default 'monthly',
  interval_count int not null default 1 check (interval_count > 0),
  custom_interval_days int,
  start_date date not null default current_date,
  next_run_date date not null default current_date,
  end_date date,
  last_generated_date date,
  is_active boolean not null default true,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_recurring_scope check (
    (scope = 'private' and owner_profile_id is not null and family_id is null)
    or
    (scope = 'family' and family_id is not null)
  ),
  constraint chk_recurring_custom check (frequency <> 'custom' or custom_interval_days is not null)
);

create index idx_recurring_family on recurring_transactions(family_id) where is_active;
create index idx_recurring_owner on recurring_transactions(owner_profile_id) where is_active;
create index idx_recurring_next_run on recurring_transactions(next_run_date) where is_active;

create trigger trg_recurring_updated_at
  before update on recurring_transactions
  for each row execute function set_updated_at();

create or replace function public.advance_recurring_date(p_date date, p_freq recurrence_frequency, p_interval int, p_custom_days int)
returns date
language sql
immutable
as $$
  select case p_freq
    when 'daily' then p_date + (p_interval || ' days')::interval
    when 'weekly' then p_date + (p_interval || ' weeks')::interval
    when 'monthly' then p_date + (p_interval || ' months')::interval
    when 'yearly' then p_date + (p_interval || ' years')::interval
    when 'custom' then p_date + (coalesce(p_custom_days, 30) || ' days')::interval
  end::date
$$;

-- Generates any transactions that are due (next_run_date <= today) for
-- recurring items the caller is allowed to trigger: their own private
-- recurring items, or family recurring items if they are a family admin/owner.
-- Safe to call repeatedly (e.g. on every dashboard load) - never creates
-- duplicates because next_run_date is advanced past "today" before returning.
create or replace function public.generate_due_recurring_transactions()
returns int
language plpgsql
as $$
declare
  r record;
  v_count int := 0;
  v_new_txn_id uuid;
begin
  for r in
    select * from recurring_transactions
    where is_active
      and next_run_date <= current_date
      and (
        (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_admin(family_id))
      )
    for update skip locked
  loop
    while r.next_run_date <= current_date and (r.end_date is null or r.next_run_date <= r.end_date) loop
      insert into transactions (
        scope, family_id, owner_profile_id, type, amount, date, account_id, to_account_id,
        category_id, description, payment_method, created_by
      ) values (
        r.scope, r.family_id, r.owner_profile_id, r.type, r.amount, r.next_run_date, r.account_id, r.to_account_id,
        r.category_id, coalesce(r.description, 'Recurring transaction'), 'recurring', current_profile_id()
      ) returning id into v_new_txn_id;

      v_count := v_count + 1;
      r.last_generated_date := r.next_run_date;
      r.next_run_date := advance_recurring_date(r.next_run_date, r.frequency, r.interval_count, r.custom_interval_days);
    end loop;

    update recurring_transactions
      set next_run_date = r.next_run_date,
          last_generated_date = r.last_generated_date,
          is_active = case when r.end_date is not null and r.next_run_date > r.end_date then false else is_active end
      where id = r.id;
  end loop;

  return v_count;
end;
$$;
