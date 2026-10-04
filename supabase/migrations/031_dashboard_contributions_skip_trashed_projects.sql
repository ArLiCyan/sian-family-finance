-- The family dashboard's Contributions card adds up every project's confirmed
-- contributions, but skips projects that are in the Trash. Restoring a project
-- from the Trash adds its contributions back; purging it removes them for good.

create or replace function public.get_family_dashboard_summary(p_family_id uuid, p_start date, p_end date)
 returns jsonb
 language sql
 stable
 set search_path to 'public', 'private'
as $function$
  select jsonb_build_object(
    'total_income', coalesce((select sum(amount) from transactions
      where scope = 'family' and family_id = p_family_id and type = 'income'
        and date between p_start and p_end and deleted_at is null), 0),
    'total_expenses', coalesce((select sum(amount) from transactions
      where scope = 'family' and family_id = p_family_id and type = 'expense'
        and date between p_start and p_end and deleted_at is null), 0),
    'total_contributions', coalesce((select sum(coalesce(pc.confirmed_amount, pc.amount))
      from project_contributions pc join projects p on p.id = pc.project_id
      where p.family_id = p_family_id and p.deleted_at is null
        and pc.status in ('confirmed', 'partially_confirmed')
        and pc.date between p_start and p_end), 0),
    'active_projects', (select count(*) from projects where family_id = p_family_id and status = 'active' and deleted_at is null),
    'outstanding_debts', coalesce((select sum(db.remaining_amount) from debts d join debt_balances db on db.debt_id = d.id
      where d.family_id = p_family_id and d.scope = 'family' and d.status in ('active', 'partially_paid', 'overdue')), 0),
    'active_goals', (select count(*) from goals where family_id = p_family_id and scope = 'family' and status = 'active'),
    'total_savings', coalesce((select sum(gp.current_amount) from goals g join goal_progress gp on gp.goal_id = g.id
      where g.family_id = p_family_id and g.scope = 'family' and g.status in ('active', 'completed')), 0)
  )
$function$;
