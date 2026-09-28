-- 023: Fix a bug introduced when Trash was added for inventory reports —
-- the (inventory_system_id, report_date) uniqueness was a plain table
-- constraint, so a *trashed* report still permanently occupied its date and
-- blocked creating a new one for the same day. Replace it with a partial
-- unique index scoped to non-deleted rows, matching the same pattern already
-- used for inventory_products' name uniqueness.

alter table inventory_reports drop constraint if exists inventory_reports_inventory_system_id_report_date_key;

create unique index if not exists idx_inventory_reports_unique_active_date
  on inventory_reports(inventory_system_id, report_date)
  where deleted_at is null;
