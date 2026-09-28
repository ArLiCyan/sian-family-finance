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
