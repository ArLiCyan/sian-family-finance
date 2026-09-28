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
