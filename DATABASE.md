# Database

PostgreSQL schema for SIAN Family Finance, managed via `supabase/migrations/001`–`016`. All tables live in the `public` schema; RLS-helper and trigger functions live in a `private` schema that is not exposed over the PostgREST API.

## Core identity & family

| Table | Purpose |
|---|---|
| `families` | Single row for "SIAN Family" today; the schema supports more than one for future extensibility. |
| `profiles` | One row per authenticated user (`auth_user_id` → `auth.users`). Created automatically by the `handle_new_auth_user` trigger on signup. |
| `family_memberships` | Join table: `profile_id` × `family_id` with a `role` (`owner` / `admin` / `member`) and `status`. |

The **first person ever to sign up** becomes `owner`; everyone after joins as `member`. Only the owner can promote members to `admin` or change roles (`family_memberships_update` policy).

## The scope model (Family vs Private)

Nearly every financial table carries a `scope` enum (`private` | `family`) plus a `CHECK` constraint:

```sql
(scope = 'private' and owner_profile_id is not null and family_id is null)
or
(scope = 'family' and family_id is not null)
```

This is the entire privacy boundary. A `private` row is visible only to its `owner_profile_id`; a `family` row is visible to any active member of that `family_id`. RLS policies enforce this on every read/write — the frontend's Family/Private mode switch is just a UI convenience that decides which `scope` new records get created with, never a security boundary itself.

## Financial tables

| Table | Notes |
|---|---|
| `categories` | Income/expense categories, `scope` of `family` / `private` / `both`, manageable in Admin. |
| `financial_accounts` | Cash, GCash, Bank, Maya, Savings, E-wallet, Other. **Balances are never stored** — see `account_balances` view below. |
| `transactions` | The central ledger. `type` covers income, expense, transfer, contribution, withdrawal, deposit, refund, debt_payment, loan_received, loan_given, adjustment. Soft-deleted via `deleted_at`. |
| `attachments` | Generic polymorphic table (`entity_type` + `entity_id`) for receipts/photos across transactions, projects, expenses, contributions, debts, goals. |

### Account balances (derived, not stored)

```
account_ledger    → signed per-transaction effect on a given account
account_balances  → starting_balance + SUM(account_ledger.delta), grouped by account
```

Both are views with `security_invoker = true` so they always respect the querying user's RLS — a private account's balance is invisible to everyone except its owner even through the view.

## Projects (family collaboration)

| Table | Notes |
|---|---|
| `projects` | Family-wide visible; `status` planning → active → on_hold/completed/cancelled. |
| `project_members` | Participants + `can_approve_contributions` / `can_manage_expenses` flags. |
| `project_contribution_requirements` | Expected amount per member. |
| `project_contributions` | Status: pending → submitted → confirmed/partially_confirmed/rejected/refunded. `verified_by`/`verified_at`/`verification_note` for auditability. |
| `project_expenses` | Soft-deletable. |
| `project_updates` | The project activity feed — populated **automatically** by triggers (see below), plus manual notes. |

**Contribution verification is defense-in-depth:**
1. RLS only lets someone confirm/reject a contribution if they `can_manage_project(...)` (project owner/manager or family admin/owner).
2. A `BEFORE INSERT OR UPDATE` trigger (`prevent_self_verification`) unconditionally blocks `verified_by = profile_id` — nobody can verify their own contribution, even an admin, even if the frontend were bypassed.

`project_financial_summary` and `project_member_contribution_status` are views that compute budget/expected/confirmed/pending/unfunded/remaining/funding %/spending % live from the ledger — never stored, never able to drift.

### Personal money → family contribution flow

A contribution can optionally reference a private `account_id`. When it does, the app also inserts a **private** transaction (`type = 'contribution'`, `scope = 'private'`) linked via `contribution_id`, so the contributor's own private balance decreases — while the family only ever sees the contribution amount and status, never the contributor's account balance. This mirrors the spec's "private money → family contribution → family project" flow without double-counting: the contribution is not separately recorded as family income anywhere.

## Goals, Debts, Budgets, Recurring

- `goals` + `goal_contributions` — covers both "financial goals" and "savings" from the spec as one concept (a goal with deposits), scoped private or family. `goal_progress` view computes current amount and % live.
- `debts` + `debt_payments` — `direction` (`borrowed`/`lent`), remaining balance derived via `debt_balances` view; `status` auto-recalculated by a trigger on every payment insert/update/delete.
- `budgets` + `budget_categories` — category spending limits with configurable warning/critical thresholds (default 75% / 90%).
- `recurring_transactions` — generates due transactions via `generate_due_recurring_transactions()`, an idempotent RPC safe to call on every login (it advances `next_run_date` past "today" before returning, so it can never double-generate).

## Notifications, Announcements, Audit

- `notifications` — per-profile, RLS-scoped to the recipient only. Populated by triggers on contribution events, project membership, project expenses, and announcements. Added to the `supabase_realtime` publication so the notification bell updates live.
- `announcements` — family-wide, admin/owner authored, soft-deletable.
- `audit_logs` — generic trigger (`log_audit_event`) attached to `transactions`, `projects`, `project_contributions`, `project_expenses`, `goals`, `debts`, and `family_memberships`, capturing actor, action, before/after state as JSON. Visible only to Family Admins/Owner.

## Storage

Two buckets:
- `receipts` (private) — path convention `private/<profile_id>/...` or `family/<family_id>/...`, enforced by storage RLS policies mirroring the same scope model.
- `avatars` (public-read) — path `<profile_id>/...`, only the owning profile can write.

## RLS strategy summary

- **No table uses `USING (true)`.**
- All ownership checks resolve through `private.current_profile_id()` (`select id from profiles where auth_user_id = auth.uid()`) — never a client-supplied id.
- Helper predicates (`is_family_member`, `is_family_admin`, `is_family_owner`, `can_manage_project`, `shares_family_with`, etc.) are `SECURITY DEFINER` functions in the `private` schema, so they can safely read tables like `family_memberships` (which themselves have RLS) without recursion, while remaining inaccessible as direct `/rest/v1/rpc/...` calls.
- Ownership columns are additionally locked post-insert via `BEFORE UPDATE` triggers (`prevent_field_change`) on transactions, accounts, contributions, goals, debts, projects, budgets, and recurring transactions — so even a crafted `PATCH` request cannot reassign a private record to a different owner or move a record between scopes.
- Verified against the exact attack scenarios from the spec: a second user cannot read, update, or delete another user's private transactions/accounts/receipts; cannot self-verify their own contribution; cannot escalate their own family role; cannot see another member's private balance through a contribution record.
