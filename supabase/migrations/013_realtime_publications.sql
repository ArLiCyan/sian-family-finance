-- 013: Enable realtime on tables the UI needs to live-update without a
-- manual refresh (projects list, contributions, expenses). "notifications"
-- was already enabled in migration 008.

alter publication supabase_realtime add table projects;
alter publication supabase_realtime add table project_contributions;
alter publication supabase_realtime add table project_expenses;
