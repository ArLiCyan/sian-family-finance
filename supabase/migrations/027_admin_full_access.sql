-- Family admins can use every function on every family page. These are the
-- places where the rules were still stricter than "owner or admin".
-- Deliberately unchanged: private (My) finances stay visible only to their
-- owner, and nobody but the Family Owner can grant or take the Owner role.

-- Family that an attachment's parent record belongs to (null for private records).
create or replace function private.attachment_family_id(p_entity_type text, p_entity_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'private', 'public'
as $$
declare
  v_family uuid;
begin
  if p_entity_type = 'transaction' then
    select family_id into v_family from transactions where id = p_entity_id and scope = 'family';
  elsif p_entity_type = 'project' then
    select family_id into v_family from projects where id = p_entity_id;
  elsif p_entity_type = 'project_expense' then
    select p.family_id into v_family from project_expenses e join projects p on p.id = e.project_id where e.id = p_entity_id;
  elsif p_entity_type = 'contribution' then
    select p.family_id into v_family from project_contributions c join projects p on p.id = c.project_id where c.id = p_entity_id;
  elsif p_entity_type = 'debt' then
    select family_id into v_family from debts where id = p_entity_id and scope = 'family';
  elsif p_entity_type = 'goal' then
    select family_id into v_family from goals where id = p_entity_id and scope = 'family';
  end if;
  return v_family;
end;
$$;

-- Admins can remove any family attachment, not just their own uploads.
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete
  using (
    uploaded_by = private.current_profile_id()
    or private.is_family_admin(private.attachment_family_id(entity_type, entity_id))
  );

-- Admins can post project activity notes on projects they are not a member of.
drop policy if exists project_updates_insert on public.project_updates;
create policy project_updates_insert on public.project_updates for insert
  with check (
    (private.is_project_member(project_id) or private.can_manage_project(project_id))
    and profile_id = private.current_profile_id()
  );

-- Admins can switch other members between Admin and Member. Only the Owner can
-- touch an Owner row or hand out the Owner role.
drop policy if exists family_memberships_update on public.family_memberships;
create policy family_memberships_update on public.family_memberships for update
  using (
    private.is_family_owner(family_id)
    or (private.is_family_admin(family_id) and role <> 'owner')
  )
  with check (
    private.is_family_owner(family_id)
    or (private.is_family_admin(family_id) and role <> 'owner')
  );
