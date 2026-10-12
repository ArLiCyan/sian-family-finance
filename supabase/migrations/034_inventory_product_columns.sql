-- Custom product columns: each inventory system can have extra columns on its
-- product list (e.g. "Price per Case", "Pieces per case", "Supplier") that the
-- store owner adds herself. The columns live in inventory_product_fields and each
-- product's values for them in inventory_products.custom_values, keyed by field id.
-- Columns are archived, never deleted, so values already typed are kept.

create table if not exists public.inventory_product_fields (
  id uuid primary key default gen_random_uuid(),
  inventory_system_id uuid not null references public.inventory_systems(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  field_type text not null default 'text' check (field_type in ('text', 'number', 'money')),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists inventory_product_fields_name_uniq
  on public.inventory_product_fields (inventory_system_id, lower(btrim(name)))
  where archived_at is null;

alter table public.inventory_products
  add column if not exists custom_values jsonb not null default '{}'::jsonb;

alter table public.inventory_product_fields enable row level security;

create policy inventory_product_fields_select on public.inventory_product_fields for select
  using (private.is_store_member(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_product_fields_insert on public.inventory_product_fields for insert
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_product_fields_update on public.inventory_product_fields for update
  using (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)))
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));

-- Start the main store with the column the aunt asked for.
insert into public.inventory_product_fields (inventory_system_id, name, field_type, sort_order)
select id, 'Price per Case', 'money', 1
from public.inventory_systems
where name = 'Sari-Sari Store Inventory'
on conflict do nothing;
