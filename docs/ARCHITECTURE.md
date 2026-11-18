# Isabelle Wallet architecture

## Overview

```
Browser (React 19 client components)
   │  forms (React Hook Form + Zod)          charts (Recharts)
   ▼
Next.js 16 (App Router) — server
   ├─ src/proxy.ts ............ route protection, Supabase session refresh, "setup required" guard
   ├─ src/app/(app)/**/page.tsx  Server Components: load data and calculate
   ├─ src/server/actions/*.ts .. Server Actions: auth → Zod validation → database (RLS)
   ├─ src/app/api/export ....... CSV and backup downloads (authenticated route)
   ├─ src/server/services ...... snapshot/sync, exchange rate, AI, backup
   ├─ src/server/auth .......... Supabase Auth or local auth (scrypt + JWT)
   └─ src/server/db ............ connection + per-user transaction with RLS
   ▼
PostgreSQL (Supabase in production · embedded PGlite in local mode)
   └─ same migrations, same Row Level Security policies
```

### Layers

| Layer | Folder | Responsibility |
|---|---|---|
| Interface | `src/app`, `src/components` | Pages, forms, charts, navigation, Help page |
| Financial rules | `src/lib/finance` | Pure functions (no I/O): balances, recurrence, bills, planner, debt, cash flow, budget, goals, reports, assistant |
| Validation | `src/lib/validation.ts` | Zod schemas shared by forms and Server Actions |
| Services | `src/server/services` | Load/sync data, external exchange rate, AI, backup |
| Database | `src/server/db`, `supabase/migrations` | Connection, migrations, transactions with the `authenticated` role |
| Authentication | `src/server/auth`, `src/proxy.ts` | Session, sign-in, sign-up, password change |
| Configuration | `src/lib/supabase-env.ts`, `src/server/env.ts` | Reads environment variables (including the names the Vercel ↔ Supabase integration creates) and reports what is missing |
| External integrations | `services/fx.ts`, `services/ai.ts` | Exchange-rate provider and AI API — always server-side |

### How a page loads

1. `proxy.ts` checks the configuration (missing variables → `/setup-required`) and that there is a valid session (otherwise → `/login`).
2. `getAppData()` (cached per request) verifies the session again, opens **one transaction as the user** (`set local role authenticated` + `request.jwt.claims`), syncs scheduled items (upcoming bill due dates, semester charges, interest) and loads everything.
3. `analyze(snapshot)` calculates balances, insights, notifications etc. on the server.
4. The page sends only serializable data to the browser (no secrets).

### How an action runs

`Server Action` → `requireUserForAction()` → `schema.safeParse()` → `withUser(userId, …)` (RLS) → `refresh()` → friendly message. Database errors become generic messages; logs never contain financial values.

## Database

Every table has `user_id` (default `auth.uid()`), RLS **enabled and forced**, and a single
"owner only" policy. The `anon` role has no access. Composite foreign keys `(id, user_id)` stop
a row from pointing at another user's data.

| Table | Contents | Relations |
|---|---|---|
| `profiles` | main currency, number format, time zone, theme, safety cushion, reminders, AI | 1:1 `auth.users` |
| `accounts` | accounts (checking, savings, cash, card…) with starting balance | — |
| `incomes` | income sources (recurrence rules), skipped dates | → `accounts` |
| `transactions` | ledger: income, expenses (paid/pending), refunds, transfers, debt payments | → `accounts` (from/to), `incomes`, `subscriptions`, `debts`, `transactions` (refund) |
| `bills` | bills (amount, minimum, priority, late fee, interest, partial) | → `accounts` |
| `bill_occurrences` | each due date of a bill | → `bills` |
| `bill_payments` | payments for a due date | → `bill_occurrences`, `transactions` |
| `subscriptions` | subscriptions, billing cycle, next charge, usage | → `accounts` |
| `debts` | university debt: starting balance, semester charge, interval, end date, interest, plan | — |
| `debt_events` | history: semester charges, interest, payments, adjustments | → `debts`, `transactions` |
| `goals` | savings goals | — |
| `goal_contributions` | contributions/withdrawals | → `goals` |
| `budgets` | monthly limit per category | — |
| `fx_rates` | exchange rates (source, date, time, manual) | — |

Important database constraints: only expenses can be pending; paid transactions need an
account; transfers need two different accounts; one receipt per income occurrence; unique
import hash; one automatic semester charge/interest entry per date.

Migrations live in `supabase/migrations/` and are tracked in `app_meta.migrations`, so each
runs once. On Vercel they run automatically before every build (`npm run vercel-build`).

## Local mode vs. Supabase

| | Local (default with no configuration) | Supabase (production / Vercel) |
|---|---|---|
| Database | PGlite (PostgreSQL in WebAssembly) in `.data/pglite` | Supabase Postgres via `DATABASE_URL` (transaction pooler) |
| Auth | email + password, scrypt, HS256 JWT in an httpOnly cookie; lockout after 5 failed attempts | Supabase Auth (cookies via `@supabase/ssr`) |
| RLS | same policies; `auth.uid()` emulated by reading `request.jwt.claims` | native |
| Migrations | applied automatically on start-up | `npm run db:migrate`, or automatically on each Vercel deploy |
| Where it runs | your computer or a single server with a persistent disk | Vercel or any Node host |

## Future bank integrations

The import already separates **read → normalize → server validation → duplicate detection →
save in one transaction**, with `import_hash` for idempotency. A future bank connector could
produce the same normalized rows and reuse `commitImport` — always optional and only with the
user's explicit permission. The app never makes payments.
