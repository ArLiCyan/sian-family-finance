-- 024: Add estimated revenue (units sold x price) to the inventory
-- calculation view, and rename "Ending Inventory" to plainer "Remaining
-- Stocks" wording for the seeded Sari-Sari Store Inventory system only
-- (scoped by field id, not by role, since a family-created system may use
-- the same field_role with its own different label/meaning).

update inventory_fields set display_label = 'Remaining Stocks / Bilin na Stock'
where inventory_system_id = (select id from inventory_systems where name = 'Sari-Sari Store Inventory' limit 1)
  and field_role = 'ending_inventory';

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
  ) as is_low_stock,
  p.price,
  case
    when ef.field_key is not null and qf.field_key is not null and prev.id is not null and p.price is not null then
      (
        coalesce((prev.values ->> ef.field_key)::numeric, 0)
        + coalesce((ri.values ->> qf.field_key)::numeric, 0)
        - coalesce((ri.values ->> ef.field_key)::numeric, 0)
      ) * p.price
    else null
  end as estimated_revenue
from inventory_report_items ri
join inventory_reports r on r.id = ri.report_id and r.deleted_at is null
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
    and r2.deleted_at is null
  order by r2.report_date desc
  limit 1
) prev on true;
