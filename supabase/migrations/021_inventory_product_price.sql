-- 021: Optional selling price on inventory products, per user request.
-- Purely informational (reference price) — does not feed any inventory
-- valuation/financial calculation, matching the original "no valuation
-- unless explicitly requested" scoping. Nothing else changes.

alter table inventory_products add column if not exists price numeric(14,2) check (price is null or price >= 0);
