-- 012: Seed data — the SIAN Family record and a default category set.
-- Safe to run once; guarded so it won't duplicate on re-run.
-- No fake family members are created here: real members are provisioned
-- automatically (via handle_new_auth_user) the moment they sign up.

insert into families (name, currency, timezone, date_format)
select 'SIAN Family', 'PHP', 'Asia/Manila', 'MMMM d, yyyy'
where not exists (select 1 from families);

do $$
declare
  v_family_id uuid;
begin
  select id into v_family_id from families order by created_at asc limit 1;

  if not exists (select 1 from categories where family_id = v_family_id) then
    insert into categories (family_id, name, type, icon, scope) values
      (v_family_id, 'Salary', 'income', 'banknote', 'both'),
      (v_family_id, 'Freelance', 'income', 'laptop', 'both'),
      (v_family_id, 'Business', 'income', 'briefcase', 'both'),
      (v_family_id, 'Allowance', 'income', 'hand-coins', 'both'),
      (v_family_id, 'Gifts', 'income', 'gift', 'both'),
      (v_family_id, 'Side Income', 'income', 'coins', 'both'),
      (v_family_id, 'Family Income', 'income', 'users', 'family'),
      (v_family_id, 'Other Income', 'income', 'circle-dot', 'both'),

      (v_family_id, 'Food', 'expense', 'utensils', 'both'),
      (v_family_id, 'Groceries', 'expense', 'shopping-cart', 'both'),
      (v_family_id, 'Utilities', 'expense', 'zap', 'both'),
      (v_family_id, 'Electricity', 'expense', 'plug-zap', 'both'),
      (v_family_id, 'Water', 'expense', 'droplet', 'both'),
      (v_family_id, 'Internet', 'expense', 'wifi', 'both'),
      (v_family_id, 'Transportation', 'expense', 'car', 'both'),
      (v_family_id, 'Fuel', 'expense', 'fuel', 'both'),
      (v_family_id, 'Medical', 'expense', 'heart-pulse', 'both'),
      (v_family_id, 'Education', 'expense', 'graduation-cap', 'both'),
      (v_family_id, 'House Maintenance', 'expense', 'hammer', 'family'),
      (v_family_id, 'Repairs', 'expense', 'wrench', 'both'),
      (v_family_id, 'Shopping', 'expense', 'shopping-bag', 'both'),
      (v_family_id, 'Entertainment', 'expense', 'clapperboard', 'both'),
      (v_family_id, 'Pets', 'expense', 'paw-print', 'both'),
      (v_family_id, 'Clothing', 'expense', 'shirt', 'both'),
      (v_family_id, 'Government', 'expense', 'landmark', 'both'),
      (v_family_id, 'Insurance', 'expense', 'shield', 'both'),
      (v_family_id, 'Subscriptions', 'expense', 'repeat', 'both'),
      (v_family_id, 'Family', 'expense', 'users', 'family'),
      (v_family_id, 'Personal', 'expense', 'user', 'private'),
      (v_family_id, 'Other Expense', 'expense', 'circle-dot', 'both');
  end if;
end $$;
