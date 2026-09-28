-- 016: Inventory Management Studio schema.
--
-- inventory_report_items.values is a jsonb {field_key: value} bag keyed by
-- inventory_fields.field_key — the standard pragmatic way to support
-- user-defined fields per system without a full EAV table, while keeping
-- report entry a single bulk insert per report.

create table inventory_systems (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references profiles(id)
);

create index idx_inventory_systems_family on inventory_systems(family_id) where archived_at is null;

create trigger trg_inventory_systems_updated_at
  before update on inventory_systems
  for each row execute function private.set_updated_at();

create table inventory_categories (
  id uuid primary key default gen_random_uuid(),
  inventory_system_id uuid not null references inventory_systems(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (inventory_system_id, name)
);

-- field_role marks which field plays the "purchased" vs "ending inventory" role
-- for the built-in Estimated Units Sold / Low Stock calculations, without
-- hardcoding field names/keys — the calculation view (017) joins on this.
create table inventory_fields (
  id uuid primary key default gen_random_uuid(),
  inventory_system_id uuid not null references inventory_systems(id) on delete cascade,
  field_key text not null,
  field_name text not null,
  display_label text not null,
  field_type text not null check (field_type in ('product', 'quantity', 'money', 'text', 'date', 'yes_no', 'dropdown', 'category', 'unit')),
  field_role text check (field_role in ('quantity_purchased', 'ending_inventory')),
  is_required boolean not null default false,
  unit text,
  dropdown_options jsonb,
  default_value text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_system_id, field_key)
);

create trigger trg_inventory_fields_updated_at
  before update on inventory_fields
  for each row execute function private.set_updated_at();

create table inventory_products (
  id uuid primary key default gen_random_uuid(),
  inventory_system_id uuid not null references inventory_systems(id) on delete cascade,
  category_id uuid references inventory_categories(id),
  name text not null,
  unit text,
  low_stock_threshold numeric(14,2),
  sort_order integer not null default 0,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references profiles(id)
);

create unique index idx_inventory_products_unique_name on inventory_products(inventory_system_id, name) where archived_at is null;
create index idx_inventory_products_system on inventory_products(inventory_system_id) where archived_at is null;

create trigger trg_inventory_products_updated_at
  before update on inventory_products
  for each row execute function private.set_updated_at();

create table inventory_reports (
  id uuid primary key default gen_random_uuid(),
  inventory_system_id uuid not null references inventory_systems(id) on delete cascade,
  report_date date not null,
  notes text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_system_id, report_date)
);

create index idx_inventory_reports_system on inventory_reports(inventory_system_id, report_date desc);

create trigger trg_inventory_reports_updated_at
  before update on inventory_reports
  for each row execute function private.set_updated_at();

create table inventory_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references inventory_reports(id) on delete cascade,
  product_id uuid not null references inventory_products(id),
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, product_id)
);

create index idx_inventory_report_items_report on inventory_report_items(report_id);
create index idx_inventory_report_items_product on inventory_report_items(product_id);

create trigger trg_inventory_report_items_updated_at
  before update on inventory_report_items
  for each row execute function private.set_updated_at();

-- Family-id lookups for RLS on child tables, mirroring project_family_id().
create or replace function private.inventory_system_family_id(p_system_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select family_id from inventory_systems where id = p_system_id
$$;

create or replace function private.inventory_report_family_id(p_report_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select s.family_id from inventory_reports r join inventory_systems s on s.id = r.inventory_system_id where r.id = p_report_id
$$;

-- ================= RLS =================

alter table inventory_systems enable row level security;
create policy inventory_systems_select on inventory_systems for select
  using (private.is_store_member(family_id));
create policy inventory_systems_insert on inventory_systems for insert
  with check (private.can_manage_store_inventory(family_id) and created_by = private.current_profile_id());
create policy inventory_systems_update on inventory_systems for update
  using (private.can_manage_store_inventory(family_id)) with check (private.can_manage_store_inventory(family_id));

alter table inventory_categories enable row level security;
create policy inventory_categories_select on inventory_categories for select
  using (private.is_store_member(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_categories_insert on inventory_categories for insert
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_categories_update on inventory_categories for update
  using (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)))
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_categories_delete on inventory_categories for delete
  using (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));

alter table inventory_fields enable row level security;
create policy inventory_fields_select on inventory_fields for select
  using (private.is_store_member(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_fields_insert on inventory_fields for insert
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_fields_update on inventory_fields for update
  using (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)))
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));

alter table inventory_products enable row level security;
create policy inventory_products_select on inventory_products for select
  using (private.is_store_member(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_products_insert on inventory_products for insert
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)) and created_by = private.current_profile_id());
create policy inventory_products_update on inventory_products for update
  using (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)))
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));

alter table inventory_reports enable row level security;
create policy inventory_reports_select on inventory_reports for select
  using (private.is_store_member(private.inventory_system_family_id(inventory_system_id)));
create policy inventory_reports_insert on inventory_reports for insert
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)) and created_by = private.current_profile_id());
create policy inventory_reports_update on inventory_reports for update
  using (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)))
  with check (private.can_manage_store_inventory(private.inventory_system_family_id(inventory_system_id)));

alter table inventory_report_items enable row level security;
create policy inventory_report_items_select on inventory_report_items for select
  using (private.is_store_member(private.inventory_report_family_id(report_id)));
create policy inventory_report_items_insert on inventory_report_items for insert
  with check (private.can_manage_store_inventory(private.inventory_report_family_id(report_id)));
create policy inventory_report_items_update on inventory_report_items for update
  using (private.can_manage_store_inventory(private.inventory_report_family_id(report_id)))
  with check (private.can_manage_store_inventory(private.inventory_report_family_id(report_id)));
