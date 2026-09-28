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
