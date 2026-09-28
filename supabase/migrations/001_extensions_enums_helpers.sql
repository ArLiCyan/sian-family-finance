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
