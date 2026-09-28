-- 022: Soft-delete (Trash) for inventory reports, matching the existing
-- debts Trash pattern exactly — 30-day retention, restorable, then a daily
-- cron job permanently purges anything past that window.

alter table inventory_reports add column if not exists deleted_at timestamptz;
alter table inventory_reports add column if not exists deleted_by uuid references profiles(id);

create index if not exists idx_inventory_reports_not_deleted on inventory_reports(inventory_system_id) where deleted_at is null;

select cron.schedule(
  'purge-trashed-inventory-reports',
  '0 3 * * *',
  $$ delete from public.inventory_reports where deleted_at is not null and deleted_at < now() - interval '30 days'; $$
);
