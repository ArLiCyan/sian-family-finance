-- 015: Sari-Sari Store access control.
--
-- Mirrors the projects/project_members pattern: an explicit "authorized subset"
-- of family members (store_members), with a family-admin fallback so access is
-- never a dead end. Helper functions live in the `private` schema, matching
-- the live database (RLS helpers were moved there in an earlier ad-hoc
-- migration not captured in a numbered file — see DATABASE.md).

create table store_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  can_manage_inventory boolean not null default false,
  can_manage_capital boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (family_id, profile_id)
);

create index idx_store_members_family on store_members(family_id);

create or replace function private.is_store_member(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public, private
as $$
  select exists (
    select 1 from store_members sm
    where sm.family_id = p_family_id and sm.profile_id = private.current_profile_id()
  ) or private.is_family_admin(p_family_id)
$$;

create or replace function private.can_manage_store_inventory(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public, private
as $$
  select exists (
    select 1 from store_members sm
    where sm.family_id = p_family_id and sm.profile_id = private.current_profile_id()
      and (sm.role = 'owner' or sm.can_manage_inventory)
  ) or private.is_family_admin(p_family_id)
$$;

create or replace function private.can_manage_store_capital(p_family_id uuid)
returns boolean
language sql stable security definer set search_path = public, private
as $$
  select exists (
    select 1 from store_members sm
    where sm.family_id = p_family_id and sm.profile_id = private.current_profile_id()
      and (sm.role = 'owner' or sm.can_manage_capital)
  ) or private.is_family_admin(p_family_id)
$$;

alter table store_members enable row level security;

create policy store_members_select on store_members for select
  using (private.is_family_member(family_id));
create policy store_members_insert on store_members for insert
  with check (private.is_family_admin(family_id));
create policy store_members_update on store_members for update
  using (private.is_family_admin(family_id)) with check (private.is_family_admin(family_id));
create policy store_members_delete on store_members for delete
  using (private.is_family_admin(family_id));
