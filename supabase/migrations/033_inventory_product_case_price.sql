-- Optional price for one whole case of a product (e.g. a case of softdrinks),
-- shown next to the per-piece price. Reference only, like `price`.

alter table public.inventory_products
  add column if not exists case_price numeric check (case_price is null or case_price >= 0);
