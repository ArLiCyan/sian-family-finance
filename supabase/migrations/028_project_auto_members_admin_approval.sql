-- 1. Every family member is automatically a participant in every project.
-- 2. Admins/owners can confirm contributions, including their own.
-- 3. Contributions can name a contributor who isn't a site member.

alter table public.project_contributions add column if not exists contributor_name text;

-- Admins may verify their own contribution; everyone else still may not.
create or replace function private.prevent_self_verification()
returns trigger
language plpgsql
set search_path to 'private', 'public'
as $$
begin
  if new.verified_by is not null and new.verified_by = new.profile_id
     and not private.is_family_admin(private.project_family_id(new.project_id)) then
    raise exception 'A member cannot verify their own contribution.';
  end if;
  return new;
end;
$$;

-- Automatic adds are silent: no "You were added to the project" notification or
-- activity line for every member on every project.
create or replace function private.notify_project_member_added()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
declare
  v_project_name text;
begin
  if coalesce(current_setting('app.auto_add_members', true), '') = '1' then
    return new;
  end if;
  select name into v_project_name from projects where id = new.project_id;
  insert into notifications (profile_id, type, title, message, entity_type, entity_id)
  values (new.profile_id, 'project_member_added', 'Added to project',
    format('You were added to the project "%s".', v_project_name), 'project', new.project_id);
  return new;
end;
$$;

create or replace function private.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
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
    v_name := coalesce(new.contributor_name, v_name);
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
    if coalesce(current_setting('app.auto_add_members', true), '') = '1' then
      return new;
    end if;
    select display_name into v_name from profiles where id = new.profile_id;
    insert into project_updates (project_id, profile_id, message, update_type)
    values (new.project_id, new.profile_id, format('%s was added to the project.', v_name), 'member_added');
    return new;
  end if;

  return new;
end;
$$;

-- New project -> add every active family member (the creator's owner row is
-- still inserted by the app, so the creator is skipped here).
create or replace function private.add_all_members_to_new_project()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
begin
  perform set_config('app.auto_add_members', '1', true);
  insert into project_members (project_id, profile_id, role)
  select new.id, fm.profile_id, 'participant'
  from family_memberships fm
  where fm.family_id = new.family_id and fm.status = 'active' and fm.profile_id <> new.owner_profile_id
  on conflict (project_id, profile_id) do nothing;
  perform set_config('app.auto_add_members', '', true);
  return new;
end;
$$;

drop trigger if exists trg_projects_add_members on public.projects;
create trigger trg_projects_add_members after insert on public.projects
  for each row execute function private.add_all_members_to_new_project();

-- New (or re-activated) family member -> add to every existing project.
create or replace function private.add_new_member_to_all_projects()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
begin
  if new.status = 'active' then
    perform set_config('app.auto_add_members', '1', true);
    insert into project_members (project_id, profile_id, role)
    select p.id, new.profile_id, 'participant'
    from projects p
    where p.family_id = new.family_id
    on conflict (project_id, profile_id) do nothing;
    perform set_config('app.auto_add_members', '', true);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_membership_add_to_projects on public.family_memberships;
create trigger trg_membership_add_to_projects after insert or update of status on public.family_memberships
  for each row execute function private.add_new_member_to_all_projects();

-- Backfill: every project's owner becomes its Owner participant, everyone else a participant.
select set_config('app.auto_add_members', '1', true);

insert into public.project_members (project_id, profile_id, role, can_approve_contributions, can_manage_expenses)
select p.id, p.owner_profile_id, 'owner', true, true
from public.projects p
on conflict (project_id, profile_id) do nothing;

insert into public.project_members (project_id, profile_id, role)
select p.id, fm.profile_id, 'participant'
from public.projects p
join public.family_memberships fm on fm.family_id = p.family_id and fm.status = 'active'
on conflict (project_id, profile_id) do nothing;

select set_config('app.auto_add_members', '', true);
