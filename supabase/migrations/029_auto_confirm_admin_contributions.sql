-- Contributions made by an owner/admin never wait for approval. Enforced in the
-- database so it also covers a browser tab still running an older version of the app.
-- Contributions from plain members stay pending until an admin/owner confirms them.

create or replace function private.auto_confirm_admin_contribution()
returns trigger
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
declare
  v_family uuid := private.project_family_id(new.project_id);
  v_actor uuid := private.current_profile_id();
begin
  if new.status = 'pending' and v_actor is not null and private.is_family_admin(v_family) then
    new.status := 'confirmed';
    new.confirmed_amount := coalesce(new.confirmed_amount, new.amount);
    new.verified_by := coalesce(new.verified_by, v_actor);
    new.verified_at := coalesce(new.verified_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_confirm_admin_contribution on public.project_contributions;
create trigger trg_auto_confirm_admin_contribution before insert on public.project_contributions
  for each row execute function private.auto_confirm_admin_contribution();

-- Confirm admin/owner contributions that are already sitting in "pending".
alter table public.project_contributions disable trigger trg_prevent_self_verification;

update public.project_contributions c
set status = 'confirmed',
    confirmed_amount = coalesce(c.confirmed_amount, c.amount),
    verified_by = c.profile_id,
    verified_at = now(),
    verification_note = 'Auto-approved (admin)'
from public.projects p
join public.family_memberships fm on fm.family_id = p.family_id and fm.status = 'active' and fm.role in ('owner', 'admin')
where c.project_id = p.id and fm.profile_id = c.profile_id and c.status = 'pending';

alter table public.project_contributions enable trigger trg_prevent_self_verification;
