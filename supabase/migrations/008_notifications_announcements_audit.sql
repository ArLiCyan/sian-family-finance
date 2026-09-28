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
