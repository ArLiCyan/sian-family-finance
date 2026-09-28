-- 025: Second terminology pass, per explicit user spec — "Added Stock" (not
-- "Purchases"), "Remaining Stock" singular (not "Remaining Stocks"),
-- "Previous Remaining" (handled in UI code, not stored). Scoped to the
-- seeded Sari-Sari Store Inventory system only, same reasoning as 024.

update inventory_fields set display_label = 'Added Stock / Dugang na Stock'
where inventory_system_id = (select id from inventory_systems where name = 'Sari-Sari Store Inventory' limit 1)
  and field_role = 'quantity_purchased';

update inventory_fields set display_label = 'Remaining Stock / Bilin na Stock'
where inventory_system_id = (select id from inventory_systems where name = 'Sari-Sari Store Inventory' limit 1)
  and field_role = 'ending_inventory';
