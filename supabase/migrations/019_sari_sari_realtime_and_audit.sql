-- 019: Realtime + audit logging for the Sari-Sari Store subsystem, matching
-- the existing coverage on projects/project_contributions/project_expenses.

alter publication supabase_realtime add table inventory_systems;
alter publication supabase_realtime add table inventory_products;
alter publication supabase_realtime add table inventory_reports;
alter publication supabase_realtime add table inventory_report_items;
alter publication supabase_realtime add table business_funding;
alter publication supabase_realtime add table funding_repayments;

create trigger trg_audit_inventory_systems
  after insert or update or delete on inventory_systems
  for each row execute function private.log_audit_event();
create trigger trg_audit_inventory_products
  after insert or update or delete on inventory_products
  for each row execute function private.log_audit_event();
create trigger trg_audit_inventory_reports
  after insert or update or delete on inventory_reports
  for each row execute function private.log_audit_event();
create trigger trg_audit_business_funding
  after insert or update or delete on business_funding
  for each row execute function private.log_audit_event();
create trigger trg_audit_funding_repayments
  after insert or update or delete on funding_repayments
  for each row execute function private.log_audit_event();
