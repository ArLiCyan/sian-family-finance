# SIAN Family Finance

A private, dual-mode financial management system for the SIAN Family — built with React, Vite, Tailwind CSS, and Supabase (Postgres + Auth + Storage + Row Level Security).

Every family member gets:
- **SIAN Family Finance** — shared family income, expenses, accounts, projects, contributions, goals, debts, budgets, and reports.
- **My Private Finances** — a completely separate, private financial life (own accounts, income, expenses, goals, debts, budgets) that no other family member — not even the Family Owner — can see, enforced at the database level.

See [DATABASE.md](./DATABASE.md) for the schema, relationships, and privacy/RLS model in detail.

## Tech Stack

- **Frontend:** React 18 + Vite, Tailwind CSS, React Router, Recharts, Lucide icons
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Row Level Security)
- **Language:** JavaScript (JSX)

No custom auth, no ORM, no state-management library beyond React context — kept deliberately minimal for a single-family app.

## Project Structure

```
src/
  components/    ui/ (Button, Card, Modal, Badge, ...), financial/ (TransactionForm, ProgressBar, ...), layout/ (Sidebar, Topbar, ...)
  contexts/      AuthContext, FinanceModeContext (Family/Private switch), ThemeContext
  lib/           supabase.js client, api.js data helpers, format.js currency/date helpers
  pages/         one folder per feature (Dashboard, Transactions, Projects, Goals, Debts, Budgets, Reports, Admin, Settings, ...)
supabase/
  migrations/    001–016, applied in order, fully documents the schema/RLS/triggers
```

## Getting Started

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + publishable/anon key
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Environment Variables

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

Never put the Supabase **service_role** key in this app — the frontend only ever uses the public anon/publishable key, and all access control is enforced by Postgres Row Level Security, not by trusting the client.

## Supabase Setup (for a fresh project)

1. Create a new Supabase project (a dedicated project — do not reuse another app's project).
2. Run every file in `supabase/migrations/` **in numeric order** (001 → 016) via the SQL Editor, or via the Supabase MCP/CLI `apply_migration`. Each file is idempotent-safe to inspect but not designed to be re-run twice.
3. Confirm in Table Editor that all ~23 tables exist with RLS **enabled** (green lock icon).
4. Confirm two Storage buckets exist: `receipts` (private) and `avatars` (public).
5. Copy the Project URL and anon/publishable key into `.env`.
6. (Optional but recommended) In Auth settings, keep "Confirm email" enabled — this app relies on Supabase's own email confirmation flow rather than a custom one.

The **first person to sign up** automatically becomes the Family Owner of "SIAN Family"; everyone after that joins as a Family Member (a trigger, `handle_new_auth_user`, does this automatically — see DATABASE.md).

## Authentication

Fully delegated to Supabase Auth:
- Sign Up / Log In / Log Out
- Forgot Password → email reset link → Reset Password page
- Change Password (Settings page)
- Session persistence + protected routes (`ProtectedRoute` component)

No passwords are ever stored or handled by this app's own code.

## Row Level Security — the short version

- Every financially sensitive table has RLS **enabled**, with explicit policies (never `USING (true)`).
- Ownership/membership checks are done through `SECURITY DEFINER` helper functions living in a **non-exposed `private` Postgres schema** (so they can't be called directly over the REST API, only used inside policies/triggers).
- A record's visibility always comes from `scope` (`private` vs `family`) plus either `owner_profile_id` or `family_id` — **never** a client-supplied user id.
- Ownership columns (`scope`, `family_id`, `owner_profile_id`, `created_by`, etc.) are locked from being changed after insert via `BEFORE UPDATE` triggers, independent of RLS.
- A member can never verify (confirm/reject) their own project contribution — enforced by a database trigger, not just hidden in the UI.

Full detail in [DATABASE.md](./DATABASE.md).

## Development Notes

- Money is always `NUMERIC(14,2)` in Postgres — never floating point.
- Account balances are **never stored** — they're derived from the `account_balances` view (starting balance + all transaction effects), so they can't drift from the ledger.
- Recurring transactions are generated lazily and safely via the `generate_due_recurring_transactions()` RPC (called on every dashboard load) — idempotent, no duplicate-generation risk.
- Soft deletes (`deleted_at`) are used for transactions, projects, project expenses, and announcements instead of hard deletes.
- An audit trail (`audit_logs`) is populated automatically via triggers on transactions, projects, contributions, expenses, goals, debts, and family membership changes — visible to Family Admins/Owner under **Admin → Audit Log**.

## Deployment

This is a static Vite SPA — it has no server component of its own, since Supabase is the entire backend. Any static host works (Vercel, Netlify, Cloudflare Pages). Steps below are for Vercel, since a `vercel.json` (SPA rewrite rule) is already included.

1. **Push to a Git provider** (GitHub/GitLab/Bitbucket) — Vercel's dashboard flow expects this for auto-deploys on push. (You can also deploy without Git using `npx vercel` from this folder, which uploads the local directory directly.)
2. **Import the project in Vercel** (New Project → import the repo). Framework preset auto-detects as Vite: build command `npm run build`, output directory `dist`. No changes needed.
3. **Set environment variables** in the Vercel project's Settings → Environment Variables (for Production, and Preview if you want preview deployments to work too):
   ```
   VITE_SUPABASE_URL=https://epbpxffrkhednzekmirc.supabase.co
   VITE_SUPABASE_ANON_KEY=<the same anon/publishable key from your .env>
   ```
   Never enter the Supabase **service_role** key here — this app never needs it.
4. **Deploy.** Vercel gives you a `*.vercel.app` URL immediately; add a custom domain later from the same project's Domains tab if you want one (e.g. `finance.yourfamily.com`), then update its DNS as Vercel instructs.
5. **Update Supabase Auth URLs** — in the Supabase Dashboard → Authentication → URL Configuration, set:
   - **Site URL** to your production URL (e.g. `https://sian-family-finance.vercel.app`)
   - **Redirect URLs**: add the same URL (and `http://localhost:5173` too, so local dev keeps working)

   This matters because password-reset and email-confirmation links are built from this — without it, they'll point at `localhost` for real users. (The app's own reset-password redirect already builds itself from `window.location.origin`, so no code change is needed — this is purely a Supabase dashboard setting.)
6. **Smoke-test the live URL**: sign up a real account, confirm the email arrives (check spam), log in, confirm the dashboard loads, and check the mobile layout on an actual phone.

### Before real family rollout — a few things worth deciding first

- **Test data**: the connected Supabase project currently has one real signup (Arwin, Family Owner), a "Family GCash" account, a "Garage Construction" project, and a pending ₱5,000 contribution — all created during development testing. Decide whether to keep this as real data or clear it out (Table Editor, or ask me to write a cleanup script) before other family members join.
- **Email sending limits**: Supabase's free tier has a low outgoing-email cap (I hit it while testing). Fine for a handful of family members signing up over time; if several people need to sign up the same day, either space it out or configure a custom SMTP provider under Authentication → Settings → SMTP Settings.
- **Two-real-user privacy verification**: I verified the RLS policy logic thoroughly by design/code review and Supabase's own security advisor found no gaps, but I wasn't able to complete a live test with two separate real accounts in this session (explained earlier). Worth doing once a second family member signs up: confirm they can't see the first user's private transactions/accounts.

## Known Limitations / Next Steps

This is a real, working, end-to-end application, but given the scope of the original spec, the following are intentionally lighter-touch or deferred:

- PDF report export is not implemented (CSV export is).
- Recurring transactions have a management UI for creation via SQL/RPC only in this pass — a dedicated "Recurring" list/edit page would be a good next addition.
- Granular per-record private-data sharing (section "Optional Sharing System" in the spec) is architected for (scope model) but not built — currently it's simply Private vs Family.
- No automated test suite (manual end-to-end testing was performed against the live Supabase project instead).
- Multi-currency UI is not built (schema supports a `currency` column per account, but the app is PHP-only for now).
