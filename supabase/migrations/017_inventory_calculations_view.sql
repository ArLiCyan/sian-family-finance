-- 017: Inventory calculations — previous ending inventory, estimated units
-- sold, and low-stock detection. All derived live via this view, never
-- stored, matching account_balances/debt_balances/project_financial_summary.
--
-- Estimated Units Sold = Previous Ending Inventory + Quantity Purchased - Current Ending Inventory
-- Safely null when no earlier report exists for that product in that system.

create or replace view inventory_report_calculations
with (security_invoker = true) as
select
  ri.id as report_item_id,
  ri.report_id,
  ri.product_id,
  r.inventory_system_id,
  r.report_date,
  (ri.values ->> qf.field_key)::numeric as quantity_purchased,
  (ri.values ->> ef.field_key)::numeric as ending_inventory,
  prev.report_date as previous_report_date,
  (prev.values ->> ef.field_key)::numeric as previous_ending_inventory,
  case
    when ef.field_key is not null and qf.field_key is not null and prev.id is not null then
      coalesce((prev.values ->> ef.field_key)::numeric, 0)
      + coalesce((ri.values ->> qf.field_key)::numeric, 0)
      - coalesce((ri.values ->> ef.field_key)::numeric, 0)
    else null
  end as estimated_units_sold,
  p.low_stock_threshold,
  coalesce(
    ef.field_key is not null
    and p.low_stock_threshold is not null
    and (ri.values ->> ef.field_key)::numeric <= p.low_stock_threshold,
    false
  ) as is_low_stock
from inventory_report_items ri
join inventory_reports r on r.id = ri.report_id
join inventory_products p on p.id = ri.product_id
left join inventory_fields qf on qf.inventory_system_id = r.inventory_system_id and qf.field_role = 'quantity_purchased' and qf.archived_at is null
left join inventory_fields ef on ef.inventory_system_id = r.inventory_system_id and ef.field_role = 'ending_inventory' and ef.archived_at is null
left join lateral (
  select ri2.id, ri2.values, r2.report_date
  from inventory_report_items ri2
  join inventory_reports r2 on r2.id = ri2.report_id
  where ri2.product_id = ri.product_id
    and r2.inventory_system_id = r.inventory_system_id
    and r2.report_date < r.report_date
  order by r2.report_date desc
  limit 1
) prev on true;
