-- 014: Link project expenses into the family transactions ledger.
-- Previously project_expenses lived entirely in its own silo, so project
-- spending never showed up in the Dashboard's Expenses total, the Income vs
-- Expenses chart, or Recent Transactions. Every new project expense now also
-- creates a matching family-scope transaction (app-side, mirroring how
-- contributions already optionally link to a transaction via account_id).

alter table project_expenses add column if not exists transaction_id uuid references transactions(id);
