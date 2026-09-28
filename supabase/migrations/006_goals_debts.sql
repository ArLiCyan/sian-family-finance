-- 006: Financial goals (incl. savings goals) and debts/loans

create table goals (
  id uuid primary key default gen_random_uuid(),
  scope record_scope not null,
  family_id uuid references families(id) on delete cascade,
  owner_profile_id uuid references profiles(id) on delete cascade,
  project_id uuid references projects(id),
  name text not null,
  description text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  start_date date not null default current_date,
  target_date date,
  status goal_status not null default 'active',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_goal_scope check (
    (scope = 'private' and owner_profile_id is not null and family_id is null)
    or
    (scope = 'family' and family_id is not null)
  )
);

create index idx_goals_family on goals(family_id);
create index idx_goals_owner on goals(owner_profile_id);

create trigger trg_goals_updated_at
  before update on goals
  for each row execute function set_updated_at();

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  transaction_id uuid references transactions(id),
  notes text,
  created_at timestamptz not null default now()
);

create index idx_goal_contributions_goal on goal_contributions(goal_id);

create table debts (
  id uuid primary key default gen_random_uuid(),
  scope record_scope not null,
  family_id uuid references families(id) on delete cascade,
  owner_profile_id uuid references profiles(id) on delete cascade,
  direction debt_direction not null,
  counterparty_name text not null,
  counterparty_profile_id uuid references profiles(id),
  original_amount numeric(14,2) not null check (original_amount > 0),
  interest_rate numeric(5,2),
  start_date date not null default current_date,
  due_date date,
  status debt_status not null default 'active',
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_debt_scope check (
    (scope = 'private' and owner_profile_id is not null and family_id is null)
    or
    (scope = 'family' and family_id is not null)
  )
);

create index idx_debts_family on debts(family_id);
create index idx_debts_owner on debts(owner_profile_id);

create trigger trg_debts_updated_at
  before update on debts
  for each row execute function set_updated_at();

create table debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  transaction_id uuid references transactions(id),
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_debt_payments_debt on debt_payments(debt_id);

-- Wire up the dangling transaction FKs now that goals/debts exist.
alter table transactions
  add constraint fk_txn_goal foreign key (goal_id) references goals(id),
  add constraint fk_txn_debt foreign key (debt_id) references debts(id);

-- Auto-update debt status as payments accumulate.
create or replace function public.recalc_debt_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt debts%rowtype;
  v_paid numeric(14,2);
begin
  select * into v_debt from debts where id = coalesce(new.debt_id, old.debt_id);
  select coalesce(sum(amount), 0) into v_paid from debt_payments where debt_id = v_debt.id;

  if v_paid <= 0 then
    update debts set status = case when status = 'cancelled' then status else 'active' end where id = v_debt.id;
  elsif v_paid >= v_debt.original_amount then
    update debts set status = 'paid' where id = v_debt.id;
  else
    update debts set status = 'partially_paid' where id = v_debt.id;
  end if;

  return null;
end;
$$;

create trigger trg_recalc_debt_status
  after insert or update or delete on debt_payments
  for each row execute function recalc_debt_status();
