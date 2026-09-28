-- 010: Row Level Security — enabled on every table, with explicit policies.
-- No table uses `using (true)`. Ownership is always derived from
-- current_profile_id() (server-side, tied to auth.uid()), never from a
-- client-supplied column value.

-- ---------- Extra helper functions ----------

create or replace function public.shares_family_with(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_memberships fm1
    join family_memberships fm2 on fm1.family_id = fm2.family_id
    where fm1.profile_id = p_profile_id
      and fm2.profile_id = current_profile_id()
      and fm1.status = 'active' and fm2.status = 'active'
  )
$$;

create or replace function public.project_family_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from projects where id = p_project_id
$$;

create or replace function public.can_view_attachment_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result boolean := false;
begin
  if p_entity_type = 'transaction' then
    select (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_member(family_id))
      into v_result
    from transactions where id = p_entity_id;
  elsif p_entity_type in ('project', 'project_expense') then
    select is_family_member(p.family_id) into v_result
    from projects p
    where p.id = case when p_entity_type = 'project' then p_entity_id
                       else (select project_id from project_expenses where id = p_entity_id) end;
  elsif p_entity_type = 'contribution' then
    select is_family_member(p.family_id) into v_result
    from project_contributions pc join projects p on p.id = pc.project_id
    where pc.id = p_entity_id;
  elsif p_entity_type = 'debt' then
    select (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_member(family_id))
      into v_result
    from debts where id = p_entity_id;
  elsif p_entity_type = 'goal' then
    select (scope = 'private' and owner_profile_id = current_profile_id())
        or (scope = 'family' and is_family_member(family_id))
      into v_result
    from goals where id = p_entity_id;
  end if;
  return coalesce(v_result, false);
end;
$$;

-- ---------- Field-lock trigger (prevents reassigning ownership columns) ----------

create or replace function public.prevent_field_change()
returns trigger
language plpgsql
as $$
declare
  col text;
begin
  foreach col in array TG_ARGV loop
    if (to_jsonb(new)->>col) is distinct from (to_jsonb(old)->>col) then
      raise exception 'Cannot change protected field "%" on %', col, TG_TABLE_NAME;
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_lock_txn_fields before update on transactions
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id', 'created_by');
create trigger trg_lock_account_fields before update on financial_accounts
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_contribution_fields before update on project_contributions
  for each row execute function prevent_field_change('project_id', 'profile_id');
create trigger trg_lock_goal_fields before update on goals
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_debt_fields before update on debts
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_project_fields before update on projects
  for each row execute function prevent_field_change('family_id');
create trigger trg_lock_budget_fields before update on budgets
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');
create trigger trg_lock_recurring_fields before update on recurring_transactions
  for each row execute function prevent_field_change('scope', 'family_id', 'owner_profile_id');

-- ================= families =================
alter table families enable row level security;

create policy families_select on families for select
  using (is_family_member(id));
create policy families_update on families for update
  using (is_family_admin(id)) with check (is_family_admin(id));

-- ================= profiles =================
alter table profiles enable row level security;

create policy profiles_select on profiles for select
  using (auth_user_id = auth.uid() or shares_family_with(id));
create policy profiles_update on profiles for update
  using (
    auth_user_id = auth.uid()
    or exists (select 1 from family_memberships fm where fm.profile_id = profiles.id and is_family_admin(fm.family_id))
  )
  with check (
    auth_user_id = auth.uid()
    or exists (select 1 from family_memberships fm where fm.profile_id = profiles.id and is_family_admin(fm.family_id))
  );

-- ================= family_memberships =================
alter table family_memberships enable row level security;

create policy family_memberships_select on family_memberships for select
  using (is_family_member(family_id));
create policy family_memberships_update on family_memberships for update
  using (is_family_owner(family_id)) with check (is_family_owner(family_id));
create policy family_memberships_delete on family_memberships for delete
  using (is_family_owner(family_id));

-- ================= categories =================
alter table categories enable row level security;

create policy categories_select on categories for select
  using (family_id is null or is_family_member(family_id));
create policy categories_insert on categories for insert
  with check (is_family_admin(family_id) and created_by = current_profile_id());
create policy categories_update on categories for update
  using (is_family_admin(family_id)) with check (is_family_admin(family_id));
create policy categories_delete on categories for delete
  using (is_family_admin(family_id));

-- ================= financial_accounts =================
alter table financial_accounts enable row level security;

create policy accounts_select on financial_accounts for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy accounts_insert on financial_accounts for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy accounts_update on financial_accounts for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy accounts_delete on financial_accounts for delete
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= transactions =================
alter table transactions enable row level security;

create policy transactions_select on transactions for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy transactions_insert on transactions for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy transactions_update on transactions for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and (created_by = current_profile_id() or is_family_admin(family_id)))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and (created_by = current_profile_id() or is_family_admin(family_id)))
  );
-- No delete policy: financial records are soft-deleted via UPDATE (deleted_at).

-- ================= attachments =================
alter table attachments enable row level security;

create policy attachments_select on attachments for select
  using (can_view_attachment_entity(entity_type, entity_id));
create policy attachments_insert on attachments for insert
  with check (uploaded_by = current_profile_id() and can_view_attachment_entity(entity_type, entity_id));
create policy attachments_delete on attachments for delete
  using (uploaded_by = current_profile_id());

-- ================= projects =================
alter table projects enable row level security;

create policy projects_select on projects for select
  using (is_family_member(family_id));
create policy projects_insert on projects for insert
  with check (is_family_member(family_id) and created_by = current_profile_id() and owner_profile_id = current_profile_id());
create policy projects_update on projects for update
  using (can_manage_project(id)) with check (can_manage_project(id));
-- No delete policy: use status = 'cancelled' / deleted_at via UPDATE.

-- ================= project_members =================
alter table project_members enable row level security;

create policy project_members_select on project_members for select
  using (is_family_member(project_family_id(project_id)));
create policy project_members_insert on project_members for insert
  with check (can_manage_project(project_id));
create policy project_members_update on project_members for update
  using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy project_members_delete on project_members for delete
  using (can_manage_project(project_id));

-- ================= project_contribution_requirements =================
alter table project_contribution_requirements enable row level security;

create policy pcr_select on project_contribution_requirements for select
  using (is_family_member(project_family_id(project_id)));
create policy pcr_insert on project_contribution_requirements for insert
  with check (can_manage_project(project_id));
create policy pcr_update on project_contribution_requirements for update
  using (can_manage_project(project_id)) with check (can_manage_project(project_id));
create policy pcr_delete on project_contribution_requirements for delete
  using (can_manage_project(project_id));

-- ================= project_contributions =================
alter table project_contributions enable row level security;

create policy project_contributions_select on project_contributions for select
  using (is_family_member(project_family_id(project_id)));
create policy project_contributions_insert on project_contributions for insert
  with check (
    is_family_member(project_family_id(project_id))
    and (profile_id = current_profile_id() or can_manage_project(project_id))
  );
create policy project_contributions_update on project_contributions for update
  using ((profile_id = current_profile_id() and status = 'pending') or can_manage_project(project_id))
  with check ((profile_id = current_profile_id() and status = 'pending') or can_manage_project(project_id));
-- No delete policy: contributions are permanent; use status ('rejected'/'refunded').

-- ================= project_expenses =================
alter table project_expenses enable row level security;

create policy project_expenses_select on project_expenses for select
  using (is_family_member(project_family_id(project_id)));
create policy project_expenses_insert on project_expenses for insert
  with check (can_manage_project(project_id) and created_by = current_profile_id());
create policy project_expenses_update on project_expenses for update
  using (can_manage_project(project_id)) with check (can_manage_project(project_id));

-- ================= project_updates =================
alter table project_updates enable row level security;

create policy project_updates_select on project_updates for select
  using (is_family_member(project_family_id(project_id)));
create policy project_updates_insert on project_updates for insert
  with check (is_project_member(project_id) and profile_id = current_profile_id());

-- ================= goals =================
alter table goals enable row level security;

create policy goals_select on goals for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy goals_insert on goals for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy goals_update on goals for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= goal_contributions =================
alter table goal_contributions enable row level security;

create policy goal_contributions_select on goal_contributions for select
  using (exists (
    select 1 from goals g where g.id = goal_contributions.goal_id
    and ((g.scope = 'private' and g.owner_profile_id = current_profile_id())
      or (g.scope = 'family' and is_family_member(g.family_id)))
  ));
create policy goal_contributions_insert on goal_contributions for insert
  with check (
    profile_id = current_profile_id()
    and exists (
      select 1 from goals g where g.id = goal_contributions.goal_id
      and ((g.scope = 'private' and g.owner_profile_id = current_profile_id())
        or (g.scope = 'family' and is_family_member(g.family_id)))
    )
  );

-- ================= debts =================
alter table debts enable row level security;

create policy debts_select on debts for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy debts_insert on debts for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_member(family_id))
    )
  );
create policy debts_update on debts for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );

-- ================= debt_payments =================
alter table debt_payments enable row level security;

create policy debt_payments_select on debt_payments for select
  using (exists (
    select 1 from debts d where d.id = debt_payments.debt_id
    and ((d.scope = 'private' and d.owner_profile_id = current_profile_id())
      or (d.scope = 'family' and is_family_member(d.family_id)))
  ));
create policy debt_payments_insert on debt_payments for insert
  with check (
    created_by = current_profile_id()
    and exists (
      select 1 from debts d where d.id = debt_payments.debt_id
      and ((d.scope = 'private' and d.owner_profile_id = current_profile_id())
        or (d.scope = 'family' and is_family_admin(d.family_id)))
    )
  );
create policy debt_payments_delete on debt_payments for delete
  using (exists (
    select 1 from debts d where d.id = debt_payments.debt_id
    and ((d.scope = 'private' and d.owner_profile_id = current_profile_id())
      or (d.scope = 'family' and is_family_admin(d.family_id)))
  ));

-- ================= budgets =================
alter table budgets enable row level security;

create policy budgets_select on budgets for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy budgets_insert on budgets for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_admin(family_id))
    )
  );
create policy budgets_update on budgets for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_admin(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_admin(family_id))
  );
create policy budgets_delete on budgets for delete
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_admin(family_id))
  );

-- ================= budget_categories =================
alter table budget_categories enable row level security;

create policy budget_categories_select on budget_categories for select
  using (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_member(b.family_id)))
  ));
create policy budget_categories_insert on budget_categories for insert
  with check (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_admin(b.family_id)))
  ));
create policy budget_categories_update on budget_categories for update
  using (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_admin(b.family_id)))
  ));
create policy budget_categories_delete on budget_categories for delete
  using (exists (
    select 1 from budgets b where b.id = budget_categories.budget_id
    and ((b.scope = 'private' and b.owner_profile_id = current_profile_id())
      or (b.scope = 'family' and is_family_admin(b.family_id)))
  ));

-- ================= recurring_transactions =================
alter table recurring_transactions enable row level security;

create policy recurring_select on recurring_transactions for select
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_member(family_id))
  );
create policy recurring_insert on recurring_transactions for insert
  with check (
    created_by = current_profile_id()
    and (
      (scope = 'private' and owner_profile_id = current_profile_id())
      or (scope = 'family' and is_family_admin(family_id))
    )
  );
create policy recurring_update on recurring_transactions for update
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_admin(family_id))
  )
  with check (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_admin(family_id))
  );
create policy recurring_delete on recurring_transactions for delete
  using (
    (scope = 'private' and owner_profile_id = current_profile_id())
    or (scope = 'family' and is_family_admin(family_id))
  );

-- ================= notifications =================
alter table notifications enable row level security;

create policy notifications_select on notifications for select
  using (profile_id = current_profile_id());
create policy notifications_update on notifications for update
  using (profile_id = current_profile_id()) with check (profile_id = current_profile_id());
create policy notifications_delete on notifications for delete
  using (profile_id = current_profile_id());

-- ================= announcements =================
alter table announcements enable row level security;

create policy announcements_select on announcements for select
  using (is_family_member(family_id));
create policy announcements_insert on announcements for insert
  with check (is_family_member(family_id) and created_by = current_profile_id());
create policy announcements_update on announcements for update
  using (is_family_admin(family_id)) with check (is_family_admin(family_id));

-- ================= audit_logs =================
alter table audit_logs enable row level security;

create policy audit_logs_select on audit_logs for select
  using (family_id is not null and is_family_admin(family_id));
