-- Projects: archive (hide but keep, restorable any time) and trash (soft delete,
-- permanently removed after 15 days). `deleted_at`/`deleted_by` already existed.

alter table public.projects
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id);

-- Permanent removal. Contributions, expenses, members and activity cascade with
-- the project. Ledger rows (transactions), goals and budgets that merely point at
-- the project are kept — only their link is cleared — so account balances and
-- history never change when a project is purged.
create or replace function private.purge_trashed_projects()
returns void
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.projects
  where deleted_at is not null and deleted_at < now() - interval '15 days';

  if cardinality(v_ids) = 0 then
    return;
  end if;

  update public.transactions set project_id = null where project_id = any(v_ids);
  update public.goals set project_id = null where project_id = any(v_ids);
  update public.budgets set project_id = null where project_id = any(v_ids);
  delete from public.projects where id = any(v_ids);
end;
$$;

revoke all on function private.purge_trashed_projects() from public, anon, authenticated;

select cron.schedule('purge-trashed-projects', '0 3 * * *', 'select private.purge_trashed_projects();');
