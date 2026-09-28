-- 018: Business Capital / Repayments.
--
-- Deliberately separate from the inventory tables above — nothing here reads
-- from or writes to inventory_*, and nothing inventory-related writes here.
-- A repayment only ever exists because someone explicitly recorded one via
-- "Add Repayment"; remaining balance is always derived, never trigger-set
-- from sales/inventory/profit.

create table business_funding (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  funding_date date not null default current_date,
  purpose text,
  interest_rate numeric(5,2) not null default 0 check (interest_rate >= 0),
  notes text,
  provided_by_name text,
  provided_by uuid references profiles(id),
  recipient_profile_id uuid references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_business_funding_family on business_funding(family_id);

create trigger trg_business_funding_updated_at
  before update on business_funding
  for each row execute function private.set_updated_at();

create table funding_repayments (
  id uuid primary key default gen_random_uuid(),
  funding_id uuid not null references business_funding(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  repayment_date date not null default current_date,
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_funding_repayments_funding on funding_repayments(funding_id);

create trigger trg_funding_repayments_updated_at
  before update on funding_repayments
  for each row execute function private.set_updated_at();

-- Data-integrity guard: a repayment can never push total repaid past the
-- original funding amount. This is separate from (and doesn't relax) the
-- rule that repayments are never auto-derived from sales/inventory.
create or replace function public.prevent_funding_overpayment()
returns trigger
language plpgsql
as $$
declare
  v_funding_amount numeric;
  v_total_repaid numeric;
begin
  select amount into v_funding_amount from business_funding where id = new.funding_id;
  select coalesce(sum(amount), 0) into v_total_repaid
    from funding_repayments
    where funding_id = new.funding_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_total_repaid + new.amount > v_funding_amount then
    raise exception 'This repayment would exceed the remaining balance for this funding record.';
  end if;
  return new;
end;
$$;

create trigger trg_prevent_funding_overpayment
  before insert or update on funding_repayments
  for each row execute function prevent_funding_overpayment();

create or replace function private.business_funding_family_id(p_funding_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select family_id from business_funding where id = p_funding_id
$$;

-- ================= RLS =================

alter table business_funding enable row level security;
create policy business_funding_select on business_funding for select
  using (private.is_store_member(family_id));
create policy business_funding_insert on business_funding for insert
  with check (private.can_manage_store_capital(family_id) and created_by = private.current_profile_id());
create policy business_funding_update on business_funding for update
  using (private.can_manage_store_capital(family_id)) with check (private.can_manage_store_capital(family_id));

alter table funding_repayments enable row level security;
create policy funding_repayments_select on funding_repayments for select
  using (private.is_store_member(private.business_funding_family_id(funding_id)));
create policy funding_repayments_insert on funding_repayments for insert
  with check (private.can_manage_store_capital(private.business_funding_family_id(funding_id)) and created_by = private.current_profile_id());
create policy funding_repayments_delete on funding_repayments for delete
  using (private.can_manage_store_capital(private.business_funding_family_id(funding_id)));

-- ================= Derived views (never stored) =================

create or replace view business_funding_summary
with (security_invoker = true) as
select
  f.id as funding_id,
  f.family_id,
  f.amount as original_amount,
  coalesce(sum(r.amount), 0) as total_repaid,
  f.amount - coalesce(sum(r.amount), 0) as remaining_amount,
  case when coalesce(sum(r.amount), 0) >= f.amount then 'fully_repaid' else 'active' end as computed_status
from business_funding f
left join funding_repayments r on r.funding_id = f.id
group by f.id;

create or replace view business_funding_dashboard
with (security_invoker = true) as
select
  family_id,
  coalesce(sum(original_amount), 0) as total_capital_provided,
  coalesce(sum(total_repaid), 0) as total_repaid,
  coalesce(sum(remaining_amount), 0) as total_remaining,
  count(*) filter (where remaining_amount > 0) as active_funding_count,
  count(*) filter (where remaining_amount <= 0) as fully_repaid_count
from business_funding_summary
group by family_id;
