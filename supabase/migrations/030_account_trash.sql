-- Accounts: soft delete with a 15-day grace period before permanent removal.

alter table public.financial_accounts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

-- Permanent removal. Plain Cash In / Cash Out entries only mean something inside
-- their account, so they go with it. Every other record that points at the
-- account (income, expenses, transfers, contributions, recurring rules) is kept
-- and just loses its account link, so reports and project totals don't change.
create or replace function private.purge_trashed_accounts()
returns void
language plpgsql
security definer
set search_path to 'private', 'public'
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_ids
  from public.financial_accounts
  where deleted_at is not null and deleted_at < now() - interval '15 days';

  if cardinality(v_ids) = 0 then
    return;
  end if;

  delete from public.transactions where account_id = any(v_ids) and type in ('deposit', 'withdrawal');
  update public.transactions set account_id = null where account_id = any(v_ids);
  update public.transactions set to_account_id = null where to_account_id = any(v_ids);
  update public.project_contributions set account_id = null where account_id = any(v_ids);
  update public.recurring_transactions set account_id = null where account_id = any(v_ids);
  update public.recurring_transactions set to_account_id = null where to_account_id = any(v_ids);
  delete from public.financial_accounts where id = any(v_ids);
end;
$$;

revoke all on function private.purge_trashed_accounts() from public, anon, authenticated;

select cron.schedule('purge-trashed-accounts', '0 3 * * *', 'select private.purge_trashed_accounts();');
