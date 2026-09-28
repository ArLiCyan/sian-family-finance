-- 020: Seed the first inventory system — Sari-Sari Store Inventory — migrated
-- from the family's existing spreadsheet. Product names preserved exactly.

do $$
declare
  v_family_id uuid;
  v_owner_id uuid;
  v_system_id uuid;
begin
  select id into v_family_id from families limit 1;
  select fm.profile_id into v_owner_id from family_memberships fm where fm.family_id = v_family_id and fm.role = 'owner' limit 1;

  insert into inventory_systems (family_id, name, description, created_by)
  values (v_family_id, 'Sari-Sari Store Inventory', 'Weekly stock tracker for the sari-sari store, migrated from the existing spreadsheet.', v_owner_id)
  returning id into v_system_id;

  insert into inventory_fields (inventory_system_id, field_key, field_name, display_label, field_type, field_role, is_required, unit, sort_order)
  values
    (v_system_id, 'quantity_purchased', 'Added Stock', 'Purchases / Dugang na Stock', 'quantity', 'quantity_purchased', false, 'pcs', 1),
    (v_system_id, 'ending_inventory', 'Ending Stock', 'Ending Inventory / Bilin na Stock', 'quantity', 'ending_inventory', true, 'pcs', 2);

  insert into inventory_products (inventory_system_id, name, unit, created_by, sort_order)
  select v_system_id, product_name, 'pcs', v_owner_id, row_number() over ()
  from unnest(array[
    'ROYAL 12oz','COKE 12oz','SPRITE 12oz','MT DEW 12oz','COKE SAKTO','ROYAL SAKTO','SPRITE SAKTO',
    'COKE LITRO','MT DEW LITRO','HEALTH TEA','STING','C2','MINERAL WATER','RED HORSE 500ml','PILSEN',
    'SAN MIGUEL','LONG NECK DARK','LAPAD DARK','LAPAD LIGHT','CAMEL','CHESTER','MIGHTY','MARLBORO RED',
    'MARLBORO BLUE','MARLBORO LIGHT','CURLS - SP ₱10.00','CURLS - SP ₱12.00','CURLS - SP ₱30.00',
    'CURLS - SP ₱40.00','COFFEE DOUBLE','COFFEE SINGLE','MILO','OIL - SP ₱25.00','OIL - SP ₱50.00',
    'SUGAR Small','SUGAR Big','ZONROX','COLGATE','SHAMPOO','CONDITIONER','TIDE POWDER','TIDE BAR',
    'HABON HAMOT','BISCUIT','SARDINES','CORNED BEEF','TUNA','KATOL','ZEST O','YAKULT'
  ]) as product_name;
end $$;
