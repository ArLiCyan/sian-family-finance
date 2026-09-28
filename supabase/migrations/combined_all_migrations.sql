-- 001: Extensions, enums, and helper functions
-- Helper functions are SECURITY DEFINER so they can be safely called from
-- RLS policies without causing recursive-RLS evaluation on the tables they read.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ---------- ENUM TYPES ----------

create type family_role as enum ('owner', 'admin', 'member');
create type membership_status as enum ('active', 'inactive');
create type profile_status as enum ('active', 'invited', 'suspended');

create type record_scope as enum ('private', 'family');

create type account_type as enum ('cash', 'gcash', 'bank', 'maya', 'savings', 'ewallet', 'other');
create type account_status as enum ('active', 'archived');

create type category_type as enum ('income', 'expense');
create type category_scope as enum ('family', 'private', 'both');

create type transaction_type as enum (
  'income', 'expense', 'transfer', 'contribution', 'withdrawal',
  'deposit', 'refund', 'debt_payment', 'loan_received', 'loan_given', 'adjustment'
);

create type project_type as enum (
  'home_improvement', 'construction', 'vehicle', 'education',
  'family_event', 'travel', 'emergency', 'purchase', 'other'
);
create type project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');

create type contribution_status as enum (
  'pending', 'submitted', 'confirmed', 'rejected', 'partially_confirmed', 'refunded'
);

create type goal_status as enum ('active', 'completed', 'paused', 'cancelled');

create type debt_direction as enum ('borrowed', 'lent');
create type debt_status as enum ('active', 'partially_paid', 'paid', 'overdue', 'cancelled');

create type recurrence_frequency as enum ('daily', 'weekly', 'monthly', 'yearly', 'custom');
create type budget_period as enum ('monthly', 'yearly', 'custom');

-- ---------- HELPER FUNCTIONS ----------

-- Returns the profiles.id row for the currently authenticated Supabase user.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles where auth_user_id = auth.uid()
$$;

-- Is the current user an active member of the given family?
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_memberships fm
    where fm.family_id = p_family_id
      and fm.profile_id = current_profile_id()
      and fm.status = 'active'
  )
$$;

-- Current user's role within a family, or null if not a member.
create or replace function public.family_role_of(p_family_id uuid)
returns family_role
language sql
stable
security definer
set search_path = public
as $$
  select fm.role from family_memberships fm
  where fm.family_id = p_family_id
    and fm.profile_id = current_profile_id()
    and fm.status = 'active'
  limit 1
$$;

-- Is the current user an owner or admin of the given family?
create or replace function public.is_family_admin(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(family_role_of(p_family_id) in ('owner', 'admin'), false)
$$;

-- Is the current user the owner of the given family?
create or replace function public.is_family_owner(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(family_role_of(p_family_id) = 'owner', false)
$$;

-- Is the current user a member (participant or owner) of the given project?
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members pm
    where pm.project_id = p_project_id
      and pm.profile_id = current_profile_id()
  )
$$;

-- Can the current user manage (approve contributions / add expenses) a project?
create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_members pm
    join projects p on p.id = pm.project_id
    where pm.project_id = p_project_id
      and pm.profile_id = current_profile_id()
      and (pm.role = 'owner' or pm.can_approve_contributions or pm.can_manage_expenses)
  )
  or exists (
    select 1 from projects p
    where p.id = p_project_id and is_family_admin(p.family_id)
  )
$$;

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
-- 002: Families, profiles, and family memberships

create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'SIAN Family',
  currency text not null default 'PHP',
  timezone text not null default 'Asia/Manila',
  date_format text not null default 'MMMM d, yyyy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_families_updated_at
  before update on families
  for each row execute function set_updated_at();

create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  display_name text not null,
  profile_photo_url text,
  email text not null,
  phone text,
  date_joined date not null default current_date,
  status profile_status not null default 'active',
  theme_preference text not null default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_auth_user_id on profiles(auth_user_id);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create table family_memberships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role family_role not null default 'member',
  status membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, profile_id)
);

create index idx_family_memberships_family on family_memberships(family_id);
create index idx_family_memberships_profile on family_memberships(profile_id);

create trigger trg_family_memberships_updated_at
  before update on family_memberships
  for each row execute function set_updated_at();

-- Auto-provision a profile (and attach to the single SIAN Family) whenever a
-- new Supabase Auth user signs up. The first user ever created becomes the
-- Family Owner; everyone after that joins as a Family Member.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_profile_id uuid;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_is_first boolean;
begin
  select id into v_family_id from families order by created_at asc limit 1;
  if v_family_id is null then
    insert into families (name) values ('SIAN Family') returning id into v_family_id;
  end if;

  v_first_name := coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1));
  v_last_name := coalesce(new.raw_user_meta_data->>'last_name', '');
  v_display_name := coalesce(new.raw_user_meta_data->>'display_name', trim(v_first_name || ' ' || v_last_name));

  insert into profiles (auth_user_id, first_name, last_name, display_name, email)
  values (new.id, v_first_name, v_last_name, v_display_name, new.email)
  returning id into v_profile_id;

  select not exists (select 1 from family_memberships where family_id = v_family_id) into v_is_first;

  insert into family_memberships (family_id, profile_id, role, status)
  values (v_family_id, v_profile_id, case when v_is_first then 'owner' else 'member' end, 'active');

  return new;
end;
$$;

create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
-- 003: Financial accounts and categories

create table categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  type category_type not null,
  icon text not null default 'circle',
  description text,
  scope category_scope not null default 'both',
  is_active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_categories_family on categories(family_id);

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function set_updated_at();

create table financial_accounts (
  id uuid primary key default gen_random_uuid(),
  scope record_scope not null,
  family_id uuid references families(id) on delete cascade,
  owner_profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  account_type account_type not null default 'other',
  starting_balance numeric(14,2) not null default 0,
  currency text not null default 'PHP',
  description text,
  status account_status not null default 'active',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_account_scope check (
    (scope = 'private' and owner_profile_id is not null and family_id is null)
    or
    (scope = 'family' and family_id is not null)
  )
);

create index idx_accounts_family on financial_accounts(family_id);
create index idx_accounts_owner on financial_accounts(owner_profile_id);

create trigger trg_accounts_updated_at
  before update on financial_accounts
  for each row execute function set_updated_at();
-- 004: Central transaction ledger + generic attachments
-- project_id / goal_id / debt_id / contribution_id are declared here as plain
-- uuid columns (no FK yet) because their target tables are created in later
-- migrations; the FK constraints are added there via ALTER TABLE.

create table transactions (
  id uuid primary key default gen_random_uuid(),
  scope record_scope not null,
  family_id uuid references families(id) on delete cascade,
  owner_profile_id uuid references profiles(id),
  type transaction_type not null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  account_id uuid references financial_accounts(id),
  to_account_id uuid references financial_accounts(id),
  category_id uuid references categories(id),
  project_id uuid,
  goal_id uuid,
  debt_id uuid,
  contribution_id uuid,
  description text,
  merchant text,
  payment_method text,
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id),
  constraint chk_txn_scope check (
    (scope = 'private' and owner_profile_id is not null and family_id is null)
    or
    (scope = 'family' and family_id is not null)
  ),
  constraint chk_txn_transfer_accounts check (
    (type = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (type <> 'transfer')
  )
);

create index idx_txn_family on transactions(family_id) where deleted_at is null;
create index idx_txn_owner on transactions(owner_profile_id) where deleted_at is null;
create index idx_txn_date on transactions(date);
create index idx_txn_account on transactions(account_id);
create index idx_txn_project on transactions(project_id);
create index idx_txn_type on transactions(type);

create trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function set_updated_at();

-- Generic attachments (receipts, invoices, quotations, photos, proof of payment)
-- entity_type is a free-form label: 'transaction' | 'project' | 'project_expense'
-- | 'contribution' | 'debt' | 'goal'
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index idx_attachments_entity on attachments(entity_type, entity_id);
-- 005: Family projects, membership, contribution requirements,
-- contributions, expenses, and an auto-generated activity feed.

create table projects (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  description text,
  project_type project_type not null default 'other',
  start_date date,
  target_completion_date date,
  budget numeric(14,2) not null default 0 check (budget >= 0),
  status project_status not null default 'planning',
  owner_profile_id uuid not null references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id)
);

create index idx_projects_family on projects(family_id) where deleted_at is null;
create index idx_projects_status on projects(status);

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'participant' check (role in ('owner', 'participant')),
  can_approve_contributions boolean not null default false,
  can_manage_expenses boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

create index idx_project_members_project on project_members(project_id);
create index idx_project_members_profile on project_members(profile_id);

create table project_contribution_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  expected_amount numeric(14,2) not null default 0 check (expected_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

create trigger trg_pcr_updated_at
  before update on project_contribution_requirements
  for each row execute function set_updated_at();

create table project_contributions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  payment_method text,
  account_id uuid references financial_accounts(id),
  transaction_id uuid references transactions(id),
  status contribution_status not null default 'pending',
  notes text,
  receipt_path text,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_project_contributions_project on project_contributions(project_id);
create index idx_project_contributions_profile on project_contributions(profile_id);
create index idx_project_contributions_status on project_contributions(status);

create trigger trg_project_contributions_updated_at
  before update on project_contributions
  for each row execute function set_updated_at();

-- Defense-in-depth: nobody may verify (confirm/reject) their own contribution,
-- regardless of their family/project role.
create or replace function public.prevent_self_verification()
returns trigger
language plpgsql
as $$
begin
  if new.verified_by is not null and new.verified_by = new.profile_id then
    raise exception 'A member cannot verify their own contribution.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_verification
  before insert or update on project_contributions
  for each row execute function prevent_self_verification();

create table project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  category_id uuid references categories(id),
  vendor text,
  description text not null,
  receipt_path text,
  transaction_id uuid references transactions(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id)
);

create index idx_project_expenses_project on project_expenses(project_id) where deleted_at is null;

create trigger trg_project_expenses_updated_at
  before update on project_expenses
  for each row execute function set_updated_at();

create table project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  profile_id uuid references profiles(id),
  message text not null,
  update_type text not null default 'note',
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_project_updates_project on project_updates(project_id, created_at desc);

-- Now that project_contributions exists, wire up the FKs left dangling on transactions.
alter table transactions
  add constraint fk_txn_project foreign key (project_id) references projects(id),
  add constraint fk_txn_contribution foreign key (contribution_id) references project_contributions(id);

-- ---------- AUTO ACTIVITY FEED ----------

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := current_profile_id();
  v_name text;
begin
  if TG_TABLE_NAME = 'projects' and TG_OP = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into project_updates (project_id, profile_id, message, update_type, metadata)
      values (new.id, v_actor, format('Project status changed from %s to %s.', old.status, new.status), 'status_change',
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.budget is distinct from old.budget then
      insert into project_updates (project_id, profile_id, message, update_type, metadata)
      values (new.id, v_actor, format('Project budget changed from ₱%s to ₱%s.', to_char(old.budget, 'FM999,999,990.00'), to_char(new.budget, 'FM999,999,990.00')), 'budget_change',
        jsonb_build_object('from', old.budget, 'to', new.budget));
    end if;
    return new;
  end if;

  if TG_TABLE_NAME = 'project_contributions' then
    select display_name into v_name from profiles where id = new.profile_id;
    if TG_OP = 'INSERT' then
      insert into project_updates (project_id, profile_id, message, update_type, metadata)
      values (new.project_id, new.profile_id, format('%s added a ₱%s contribution.', v_name, to_char(new.amount, 'FM999,999,990.00')), 'contribution_added',
        jsonb_build_object('contribution_id', new.id, 'amount', new.amount));
    elsif TG_OP = 'UPDATE' and new.status is distinct from old.status then
      insert into project_updates (project_id, profile_id, message, update_type, metadata)
      values (new.project_id, v_actor, format('%s''s ₱%s contribution was %s.', v_name, to_char(new.amount, 'FM999,999,990.00'), new.status), 'contribution_status',
        jsonb_build_object('contribution_id', new.id, 'status', new.status));
    end if;
    return new;
  end if;

  if TG_TABLE_NAME = 'project_expenses' and TG_OP = 'INSERT' then
    insert into project_updates (project_id, profile_id, message, update_type, metadata)
    values (new.project_id, new.created_by, format('₱%s project expense added: %s', to_char(new.amount, 'FM999,999,990.00'), new.description), 'expense_added',
      jsonb_build_object('expense_id', new.id, 'amount', new.amount));
    return new;
  end if;

  if TG_TABLE_NAME = 'project_members' and TG_OP = 'INSERT' then
    select display_name into v_name from profiles where id = new.profile_id;
    insert into project_updates (project_id, profile_id, message, update_type)
    values (new.project_id, new.profile_id, format('%s was added to the project.', v_name), 'member_added');
    return new;
  end if;

  return new;
end;
$$;

create trigger trg_log_project_update
  after update on projects
  for each row execute function log_project_activity();

create trigger trg_log_contribution_activity
  after insert or update on project_contributions
  for each row execute function log_project_activity();

create trigger trg_log_expense_activity
  after insert on project_expenses
  for each row execute function log_project_activity();

create trigger trg_log_member_activity
  after insert on project_members
  for each row execute function log_project_activity();
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
-- 008: Notifications, announcements, and the audit log

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_notifications_profile on notifications(profile_id, is_read, created_at desc);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  message text not null,
  is_pinned boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references profiles(id)
);

create index idx_announcements_family on announcements(family_id) where deleted_at is null;

create trigger trg_announcements_updated_at
  before update on announcements
  for each row execute function set_updated_at();

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  family_id uuid references families(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_family on audit_logs(family_id, created_at desc);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);

-- ---------- GENERIC AUDIT TRIGGER ----------

create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_action text;
  v_row jsonb;
begin
  v_row := to_jsonb(coalesce(new, old));
  v_family_id := nullif(v_row->>'family_id', '')::uuid;
  v_action := lower(TG_OP) || '_' || TG_TABLE_NAME;

  insert into audit_logs (profile_id, family_id, action, entity_type, entity_id, metadata)
  values (
    current_profile_id(),
    v_family_id,
    v_action,
    TG_TABLE_NAME,
    (v_row->>'id')::uuid,
    case TG_OP
      when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      else jsonb_build_object('new', to_jsonb(new))
    end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_transactions
  after insert or update or delete on transactions
  for each row execute function log_audit_event();

create trigger trg_audit_projects
  after insert or update or delete on projects
  for each row execute function log_audit_event();

create trigger trg_audit_project_contributions
  after insert or update or delete on project_contributions
  for each row execute function log_audit_event();

create trigger trg_audit_project_expenses
  after insert or update or delete on project_expenses
  for each row execute function log_audit_event();

create trigger trg_audit_goals
  after insert or update or delete on goals
  for each row execute function log_audit_event();

create trigger trg_audit_debts
  after insert or update or delete on debts
  for each row execute function log_audit_event();

create trigger trg_audit_family_memberships
  after insert or update or delete on family_memberships
  for each row execute function log_audit_event();

-- ---------- AUTOMATIC NOTIFICATIONS ----------

create or replace function public.notify_contribution_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_contributor_name text;
  v_approver uuid;
begin
  select family_id into v_family_id from projects where id = new.project_id;
  select display_name into v_contributor_name from profiles where id = new.profile_id;

  if TG_OP = 'INSERT' then
    for v_approver in
      select pm.profile_id from project_members pm
      where pm.project_id = new.project_id and (pm.role = 'owner' or pm.can_approve_contributions)
      union
      select fm.profile_id from family_memberships fm
      where fm.family_id = v_family_id and fm.role in ('owner', 'admin') and fm.status = 'active'
    loop
      insert into notifications (profile_id, type, title, message, entity_type, entity_id)
      values (v_approver, 'contribution_submitted', 'Contribution pending verification',
        format('%s submitted a ₱%s contribution awaiting your verification.', v_contributor_name, to_char(new.amount, 'FM999,999,990.00')),
        'project_contribution', new.id);
    end loop;
  elsif TG_OP = 'UPDATE' and new.status is distinct from old.status and new.status in ('confirmed', 'rejected', 'partially_confirmed', 'refunded') then
    insert into notifications (profile_id, type, title, message, entity_type, entity_id)
    values (new.profile_id, 'contribution_' || new.status, 'Contribution ' || new.status,
      format('Your ₱%s contribution was %s.', to_char(new.amount, 'FM999,999,990.00'), new.status),
      'project_contribution', new.id);
  end if;

  return new;
end;
$$;

create trigger trg_notify_contribution_events
  after insert or update on project_contributions
  for each row execute function notify_contribution_events();

create or replace function public.notify_project_member_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_name text;
begin
  select name into v_project_name from projects where id = new.project_id;
  insert into notifications (profile_id, type, title, message, entity_type, entity_id)
  values (new.profile_id, 'project_member_added', 'Added to project',
    format('You were added to the project "%s".', v_project_name), 'project', new.project_id);
  return new;
end;
$$;

create trigger trg_notify_project_member_added
  after insert on project_members
  for each row execute function notify_project_member_added();

create or replace function public.notify_project_expense_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  for v_member in select profile_id from project_members where project_id = new.project_id and profile_id <> new.created_by loop
    insert into notifications (profile_id, type, title, message, entity_type, entity_id)
    values (v_member, 'project_expense_added', 'Project expense added',
      format('₱%s expense added: %s', to_char(new.amount, 'FM999,999,990.00'), new.description), 'project_expense', new.id);
  end loop;
  return new;
end;
$$;

create trigger trg_notify_project_expense_added
  after insert on project_expenses
  for each row execute function notify_project_expense_added();

create or replace function public.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  for v_member in select profile_id from family_memberships where family_id = new.family_id and status = 'active' and profile_id <> new.created_by loop
    insert into notifications (profile_id, type, title, message, entity_type, entity_id)
    values (v_member, 'announcement', new.title, new.message, 'announcement', new.id);
  end loop;
  return new;
end;
$$;

create trigger trg_notify_announcement
  after insert on announcements
  for each row execute function notify_announcement();
-- 009: Supabase Storage buckets + RLS
--
-- Path convention (enforced by the app, verified by these policies):
--   receipts bucket:  private/<owner_profile_id>/<filename>   (personal documents)
--                      family/<family_id>/<filename>           (family/project documents)
--   avatars bucket:    <profile_id>/<filename>                 (public-read profile photos)

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ---------- receipts (private) ----------

create policy "receipts_select_own_or_family"
on storage.objects for select
using (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = current_profile_id()::text)
    or
    ((storage.foldername(name))[1] = 'family' and is_family_member(((storage.foldername(name))[2])::uuid))
  )
);

create policy "receipts_insert_own_or_family"
on storage.objects for insert
with check (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = current_profile_id()::text)
    or
    ((storage.foldername(name))[1] = 'family' and is_family_member(((storage.foldername(name))[2])::uuid))
  )
);

create policy "receipts_delete_own_or_family_admin"
on storage.objects for delete
using (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = 'private' and (storage.foldername(name))[2] = current_profile_id()::text)
    or
    ((storage.foldername(name))[1] = 'family' and is_family_admin(((storage.foldername(name))[2])::uuid))
  )
);

-- ---------- avatars (public read, owner write) ----------

create policy "avatars_public_read"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_owner_write"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = current_profile_id()::text);

create policy "avatars_owner_update"
on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = current_profile_id()::text);

create policy "avatars_owner_delete"
on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = current_profile_id()::text);
-- 010: Row Level Security — enabled on every table, with explicit policies.
-- No table uses `using (true)`. Ownership is always derived from
-- current_profile_id() (server-side, tied to auth.uid()), never from a
-- client-supplied column value.

-- ---------- Extra helper functions ----------

create or replace function public.shares_family_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_memberships fm1
    join family_memberships fm2 on fm1.family_id = fm2.family_id
    where fm1.profile_id = p_profile_id
      and fm2.profile_id = current_profile_id()
      and fm1.status = 'active' and fm2.status = 'active'
  )
$$;

create or replace function public.project_family_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from projects where id = p_project_id
$$;

create or replace function public.can_view_attachment_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result boolean := false;
begin
  if p_entity_type = 'transaction' then
    select (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_member(family_id))
      into v_result
    from transactions where id = p_entity_id;
  elsif p_entity_type in ('project', 'project_expense') then
    select is_family_member(p.family_id) into v_result
    from projects p
    where p.id = case when p_entity_type = 'project' then p_entity_id
                       else (select project_id from project_expenses where id = p_entity_id) end;
  elsif p_entity_type = 'contribution' then
    select is_family_member(p.family_id) into v_result
    from project_contributions pc join projects p on p.id = pc.project_id
    where pc.id = p_entity_id;
  elsif p_entity_type = 'debt' then
    select (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_member(family_id))
      into v_result
    from debts where id = p_entity_id;
  elsif p_entity_type = 'goal' then
    select (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_member(family_id))
      into v_result
    from goals where id = p_entity_id;
  end if;
  return coalesce(v_result, false);
end;
$$;

-- ---------- Field-lock trigger (prevents reassigning ownership columns) ----------

create or replace function public.prevent_field_change()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array TG_ARGV loop
    if (to_jsonb(new)->>col) is distinct from (to_jsonb(old)->>col) then
      raise exception 'Cannot change protected field "%" on %', col, TG_TABLE_NAME;
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_lock_txn_fields before update on transactions
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id', 'created_by');
create trigger trg_lock_account_fields before update on financial_accounts
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_contribution_fields before update on project_contributions
  for each row execute function prevent_field_change('project_id', 'profile_id');
create trigger trg_lock_goal_fields before update on goals
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_debt_fields before update on debts
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_project_fields before update on projects
  for each row execute function prevent_field_change('family_id');
create trigger trg_lock_budget_fields before update on budgets
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_recurring_fields before update on recurring_transactions
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');

-- ================= families =================
alter table families enable row level security;

create policy families_select on families for select
  using (is_family_member(id));
create policy families_update on families for update
  using (is_family_admin(id)) with check (is_family_admin(id));

-- ================= profiles =================
alter table profiles enable row level security;

create policy profiles_select on profiles for select
  using (auth_user_id = auth.uid() or shares_family_with(id));
create policy profiles_update on profiles for update
  using (
    auth_user_id = auth.uid()
    or exists (select 1 from family_memberships fm where fm.profile_id = profiles.id and is_family_admin(fm.family_id))
  )
  with check (
    auth_user_id = auth.uid()
    or exists (select 1 from family_memberships fm where fm.profile_id = profiles.id and is_family_admin(fm.family_id))
  );

-- ================= family_memberships =================
alter table family_memberships enable row level security;

create policy family_memberships_select on family_memberships for select
  using (is_family_member(family_id));
create policy family_memberships_update on family_memberships for update
  using (is_family_owner(family_id)) with check (is_family_owner(family_id));
create policy family_memberships_delete on family_memberships for delete
  using (is_family_owner(family_id));

-- ================= categories =================
alter table categories enable row level security;

create policy categories_select on categories for select
  using (family_id is null or is_family_member(family_id));
create policy categories_insert on categories for insert
  with check (is_family_admin(family_id) and created_by = current_profile_id());
create policy categories_update on categories for update
  using (is_family_admin(family_id)) with check (is_family_admin(family_id));
create policy categories_delete on categories for delete
  using (is_family_admin(family_id));

-- ================= financial_accounts =================
alter table financial_accounts enable row level security;

create policy accounts_select on financial_accounts for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy accounts_insert on financial_accounts for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy accounts_update on financial_accounts for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy accounts_delete on financial_accounts for delete
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= transactions =================
alter table transactions enable row level security;

create policy transactions_select on transactions for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy transactions_insert on transactions for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy transactions_update on transactions for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and (created_by = current_profile_id() or is_family_admin(family_id)))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and (created_by = current_profile_id() or is_family_admin(family_id)))
  );
-- No delete policy: financial records are soft-deleted via UPDATE (deleted_at).

-- ================= attachments =================
alter table attachments enable row level security;

create policy attachments_select on attachments for select
  using (can_view_attachment_entity(entity_type, entity_id));
create policy attachments_insert on attachments for insert
  with check (uploaded_by = current_profile_id() and can_view_attachment_entity(entity_type, entity_id));
create policy attachments_delete on attachments for delete
  using (uploaded_by = current_profile_id());

-- ================= projects =================
alter table projects enable row level security;

create policy projects_select on projects for select
  using (is_family_member(family_id));
create policy projects_insert on projects for insert
  with check (is_family_member(family_id) and created_by = current_profile_id() and owner_profile_id = current_profile_id());
create policy projects_update on projects for update
  using (can_manage_project(id)) with check (can_manage_project(id));
-- No delete policy: use status = 'cancelled' / deleted_at via UPDATE.

-- ================= project_members =================
alter table project_members enable row level security;

create policy project_members_select on project_members for select
  using (is_family_member(project_family_id(project_id)));
create policy project_members_insert on project_members for insert
  with check (can_manage_project(project_id));
create policy project_members_update on project_members for update
  using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy project_members_delete on project_members for delete
  using (can_manage_project(project_id));

-- ================= project_contribution_requirements =================
alter table project_contribution_requirements enable row level security;

create policy pcr_select on project_contribution_requirements for select
  using (is_family_member(project_family_id(project_id)));
create policy pcr_insert on project_contribution_requirements for insert
  with check (can_manage_project(project_id));
create policy pcr_update on project_contribution_requirements for update
  using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy pcr_delete on project_contribution_requirements for delete
  using (can_manage_project(project_id));

-- ================= project_contributions =================
alter table project_contributions enable row level security;

create policy project_contributions_select on project_contributions for select
  using (is_family_member(project_family_id(project_id)));
create policy project_contributions_insert on project_contributions for insert
  with check (
    is_family_member(project_family_id(project_id))
    and (profile_id = current_profile_id() or can_manage_project(project_id))
  );
create policy project_contributions_update on project_contributions for update
  using ((profile_id = current_profile_id() and status = 'pending') or can_manage_project(project_id))
  with check ((profile_id = current_profile_id() and status = 'pending') or can_manage_project(project_id));
-- No delete policy: contributions are permanent; use status ('rejected'/'refunded').

-- ================= project_expenses =================
alter table project_expenses enable row level security;

create policy project_expenses_select on project_expenses for select
  using (is_family_member(project_family_id(project_id)));
create policy project_expenses_insert on project_expenses for insert
  with check (can_manage_project(project_id) and created_by = current_profile_id());
create policy project_expenses_update on project_expenses for update
  using (can_manage_project(project_id)) with check (can_manage_project(project_id));

-- ================= project_updates =================
alter table project_updates enable row level security;

create policy project_updates_select on project_updates for select
  using (is_family_member(project_family_id(project_id)));
create policy project_updates_insert on project_updates for insert
  with check (is_project_member(project_id) and profile_id = current_profile_id());

-- ================= goals =================
alter table goals enable row level security;

create policy goals_select on goals for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy goals_insert on goals for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy goals_update on goals for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= goal_contributions =================
alter table goal_contributions enable row level security;

create policy goal_contributions_select on goal_contributions for select
  using (exists (
    select 1 from goals g where g.id = goal_contributions.goal_id
    and ((g.scope = 'private' and g.owner_profile_id = current_profile_id())
      or (g.scope = 'family' and is_family_member(g.family_id)))
  ));
create policy goal_contributions_insert on goal_contributions for insert
  with check (
    profile_id = current_profile_id()
    and exists (
      select 1 from goals g where g.id = goal_contributions.goal_id
      and ((g.scope = 'private' and g.owner_profile_id = current_profile_id())
        or (g.scope = 'family' and is_family_member(g.family_id)))
    )
  );

-- ================= debts =================
alter table debts enable row level security;

create policy debts_select on debts for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy debts_insert on debts for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy debts_update on debts for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= debt_payments =================
alter table debt_payments enable row level security;

create policy debt_payments_select on debt_payments for select
  using (exists (
    select 1 from debts d where d.id = debt_payments.debt_id
    and ((d.scope = 'private' and d.owner_profile_id = current_profile_id())
      or (d.scope = 'family' and is_family_member(d.family_id)))
  ));
create policy debt_payments_insert on debt_payments for insert
  with check (
    created_by = current_profile_id()
    and exists (
      select 1 from debts d where d.id = debt_payments.debt_id
      and ((d.scope = 'private' and d.owner_profile_id = current_profile_id())
        or (d.scope = 'family' and is_family_member(d.family_id)))
    )
  );
create policy debt_payments_delete on debt_payments for delete
  using (exists (
    select 1 from debts d where d.id = debt_payments.debt_id
    and ((d.scope = 'private' and d.owner_profile_id = current_profile_id())
      or (d.scope = 'family' and is_family_member(d.family_id)))
  ));

-- ================= budgets =================
alter table budgets enable row level security;

create policy budgets_select on budgets for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy budgets_insert on budgets for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy budgets_update on budgets for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy budgets_delete on budgets for delete
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= budget_categories =================
alter table budget_categories enable row level security;

create policy budget_categories_select on budget_categories for select
  using (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_member(b.family_id)))
  ));
create policy budget_categories_insert on budget_categories for insert
  with check (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_member(b.family_id)))
  ));
create policy budget_categories_update on budget_categories for update
  using (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_member(b.family_id)))
  ));
create policy budget_categories_delete on budget_categories for delete
  using (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_member(b.family_id)))
  ));

-- ================= recurring_transactions =================
alter table recurring_transactions enable row level security;

create policy recurring_select on recurring_transactions for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy recurring_insert on recurring_transactions for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy recurring_update on recurring_transactions for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy recurring_delete on recurring_transactions for delete
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= notifications =================
alter table notifications enable row level security;

create policy notifications_select on notifications for select
  using (profile_id = current_profile_id());
create policy notifications_update on notifications for update
  using (profile_id = current_profile_id()) with check (profile_id = current_profile_id());
create policy notifications_delete on notifications for delete
  using (profile_id = current_profile_id());

-- ================= announcements =================
alter table announcements enable row level security;

create policy announcements_select on announcements for select
  using (is_family_member(family_id));
create policy announcements_insert on announcements for insert
  with check (is_family_member(family_id) and created_by = current_profile_id());
create policy announcements_update on announcements for update
  using (is_family_admin(family_id)) with check (is_family_admin(family_id));

-- ================= audit_logs =================
alter table audit_logs enable row level security;

create policy audit_logs_select on audit_logs for select
  using (family_id is not null and is_family_admin(family_id));
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
  greatest(p.budget - coalesce(contrib.confirmed_total, 0), 0) as unfunded_amount,
  p.budget - coalesce(exp.expense_total, 0) as remaining_budget,
  case when p.budget > 0
    then round(coalesce(contrib.confirmed_total, 0) / p.budget * 100, 2)
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
with contributors as (
  select profile_id, project_id from project_members
  union
  select profile_id, project_id from project_contribution_requirements
  union
  select profile_id, project_id from project_contributions
)
select
  ct.project_id,
  ct.profile_id,
  req.expected_amount,
  coalesce(c.confirmed, 0) as confirmed_amount,
  coalesce(c.pending, 0) as pending_amount,
  case when req.expected_amount is not null then greatest(req.expected_amount - coalesce(c.confirmed, 0), 0) else null end as remaining_amount,
  case when coalesce(req.expected_amount, 0) > 0
    then round(coalesce(c.confirmed, 0) / req.expected_amount * 100, 2)
    else null end as percentage_complete
from contributors ct
left join project_contribution_requirements req on req.project_id = ct.project_id and req.profile_id = ct.profile_id
left join (
  select project_id, profile_id,
    sum(coalesce(confirmed_amount, amount)) filter (where status in ('confirmed', 'partially_confirmed')) as confirmed,
    sum(amount) filter (where status in ('pending', 'submitted')) as pending
  from project_contributions group by project_id, profile_id
) c on c.project_id = ct.project_id and c.profile_id = ct.profile_id
where coalesce(c.confirmed, 0) > 0 or coalesce(c.pending, 0) > 0 or req.expected_amount is not null;

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
-- 012: Seed data — the SIAN Family record and a default category set.
-- Safe to run once; guarded so it won't duplicate on re-run.
-- No fake family members are created here: real members are provisioned
-- automatically (via handle_new_auth_user) the moment they sign up.

insert into families (name, currency, timezone, date_format)
select 'SIAN Family', 'PHP', 'Asia/Manila', 'MMMM d, yyyy'
where not exists (select 1 from families);

do $$
declare
  v_family_id uuid;
begin
  select id into v_family_id from families order by created_at asc limit 1;

  if not exists (select 1 from categories where family_id = v_family_id) then
    insert into categories (family_id, name, type, icon, scope) values
      (v_family_id, 'Salary', 'income', 'banknote', 'both'),
      (v_family_id, 'Freelance', 'income', 'laptop', 'both'),
      (v_family_id, 'Business', 'income', 'briefcase', 'both'),
      (v_family_id, 'Allowance', 'income', 'hand-coins', 'both'),
      (v_family_id, 'Gifts', 'income', 'gift', 'both'),
      (v_family_id, 'Side Income', 'income', 'coins', 'both'),
      (v_family_id, 'Family Income', 'income', 'users', 'family'),
      (v_family_id, 'Other Income', 'income', 'circle-dot', 'both'),

      (v_family_id, 'Food', 'expense', 'utensils', 'both'),
      (v_family_id, 'Groceries', 'expense', 'shopping-cart', 'both'),
      (v_family_id, 'Utilities', 'expense', 'zap', 'both'),
      (v_family_id, 'Electricity', 'expense', 'plug-zap', 'both'),
      (v_family_id, 'Water', 'expense', 'droplet', 'both'),
      (v_family_id, 'Internet', 'expense', 'wifi', 'both'),
      (v_family_id, 'Transportation', 'expense', 'car', 'both'),
      (v_family_id, 'Fuel', 'expense', 'fuel', 'both'),
      (v_family_id, 'Medical', 'expense', 'heart-pulse', 'both'),
      (v_family_id, 'Education', 'expense', 'graduation-cap', 'both'),
      (v_family_id, 'House Maintenance', 'expense', 'hammer', 'family'),
      (v_family_id, 'Repairs', 'expense', 'wrench', 'both'),
      (v_family_id, 'Shopping', 'expense', 'shopping-bag', 'both'),
      (v_family_id, 'Entertainment', 'expense', 'clapperboard', 'both'),
      (v_family_id, 'Pets', 'expense', 'paw-print', 'both'),
      (v_family_id, 'Clothing', 'expense', 'shirt', 'both'),
      (v_family_id, 'Government', 'expense', 'landmark', 'both'),
      (v_family_id, 'Insurance', 'expense', 'shield', 'both'),
      (v_family_id, 'Subscriptions', 'expense', 'repeat', 'both'),
      (v_family_id, 'Family', 'expense', 'users', 'family'),
      (v_family_id, 'Personal', 'expense', 'user', 'private'),
      (v_family_id, 'Other Expense', 'expense', 'circle-dot', 'both');
  end if;
end $$;
