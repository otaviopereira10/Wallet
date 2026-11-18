# Isabelle Wallet

A private, personal money manager — pink design, dark mode, works on phone and desktop,
and every number is calculated precisely from the data you enter.

> Isabelle Wallet **organizes, calculates and recommends**. It never makes payments or
> moves real money.

**Deploying?** Follow [docs/DEPLOY.md](docs/DEPLOY.md) — a step-by-step guide to put the app
on Vercel with Supabase.

## What's inside

| Page | What it does |
|---|---|
| **Dashboard** | Money available now, what is safe to spend this month, money in/out this month, upcoming bills, debt, savings, charts, and a "Getting started" checklist for new users |
| **Ask Isabelle** | Ask questions in plain English ("Can I buy something for $150?") — answers come from your own numbers, with the situation, what to do, impact and risks. Optional AI explanation |
| **Accounts** | Checking, savings, cash and cards in USD or BRL; transfers between them (never counted as income or spending) |
| **Income** | One-time and repeating income (weekly, every 2 weeks, monthly, semester, yearly, custom), "mark as received", 6-month projection |
| **Expenses** | Search, filters, pending/paid, repeating expenses, refunds, month-to-month comparison, unusual increases |
| **Bills & Payments** | Due today / in 7 days / in 30 days / overdue, partial payments, late fees, and the **Payment Planner** that tells you what to pay first when money is short |
| **University Debt** | Semester charge added on schedule (5,500 by default, configurable), optional interest, full history, payment simulator, Conservative/Balanced/Aggressive strategies, 6-month to 5-year projection, alert when your payment is too low |
| **Monthly Budget** | Limits per category, on track / close / over, end-of-month projection |
| **Cash Flow** | Day/week/month forecast of your balance, real vs. expected, "what if" simulations |
| **Savings Goals** | Goals with progress, estimated finish date and how much to put in each |
| **Subscriptions** | Monthly/yearly cost, next charges, "want to cancel", usage tracking |
| **Calendar** | Every money event by day, color-coded |
| **Reports** | Monthly, quarterly, semester, yearly or custom — download CSV or PDF |
| **Import & Backup** | CSV import with preview, invalid-row and duplicate detection; full JSON backup and restore |
| **Settings** | Profile, main currency, time zone, theme, safety cushion, reminders, exchange rate (automatic and manual), password, delete all data |
| **Help** | Plain-English guide: what each page does, glossary, how numbers are calculated, FAQ |

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/FINANCIAL_RULES.md](docs/FINANCIAL_RULES.md)

## Tech

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · Radix UI ·
Recharts · Lucide · React Hook Form + Zod · date-fns · decimal.js · Supabase (Auth + Postgres + RLS) ·
PGlite (embedded Postgres for local use) · jsPDF · Vitest · official Anthropic SDK (optional AI).

## Run it on your computer (no cloud account needed)

Requires **Node.js 20.9+**.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000, click **Create account** and follow the setup steps.

In local mode the data lives in `.data/pglite` (a real, embedded PostgreSQL database) and the
first account created becomes the owner — new sign-ups are blocked by default. To start over,
stop the server and delete the `.data` folder.

## Use Supabase (needed for Vercel)

1. Create a project at https://supabase.com.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — *Project Settings → API*.
   - `DATABASE_URL` — *Project Settings → Database → Connection string → Transaction pooler* (port 6543), with your database password. **This is a secret.**
   - `DATA_BACKEND=supabase`
3. Create the tables and security policies:

   ```bash
   npm run db:migrate
   ```

   (Alternative: paste each file in `supabase/migrations/` into the Supabase *SQL Editor*, in order.)
4. In *Authentication → URL Configuration*, set **Site URL** to the app's address and add
   `https://YOUR-DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback`) to *Redirect URLs*.
5. Run `npm run dev`, create your account and confirm it from the email.
6. After creating your account, turn off new sign-ups: *Authentication → Sign In / Providers → Allow new users to sign up* (off) and/or `ALLOW_SIGNUP=false`.

How the security works: the server connects to Postgres and, in **every transaction**, switches
to the `authenticated` role with the signed-in user's ID. Row Level Security policies make sure
each query only sees that user's rows — even if there were a bug in the app code.

## Exchange rate (USD ↔ BRL)

Works without any key: by default it uses **Frankfurter** (European Central Bank reference rates).
The rate refreshes automatically every 12 hours when you open the app, or with **Update** in
*Settings → Exchange rate*, where you can also enter a **manual rate**. If the provider is down,
the last known rate keeps being used, with its date and time. To use AwesomeAPI instead:
`FX_PROVIDER=awesomeapi`.

## AI (optional)

Ask Isabelle works without AI: every answer comes from the app's own calculations. To add a
plain-language explanation on top:

1. Create a key at https://console.anthropic.com and set `AI_API_KEY` (server only).
2. Optional: `AI_MODEL` (default `claude-opus-5-5`).
3. Turn it on in *Settings → Use AI in Ask Isabelle answers*.

When on, only a summary of the numbers needed for your question is sent, at the moment you ask.
The model receives the calculated answer as the source of truth and is told not to invent values.

## Tests

```bash
npm test
```

The tests cover money and rounding, dates and time zones, recurrences, exchange rates, CSV,
balances (transfers, pending items, refunds, debt payments), bills and partial payments, the
Payment Planner, semester charges, interest, the debt simulator and strategies, cash flow,
budget, goals, subscriptions, the assistant (English and Portuguese questions), reports,
**user isolation through RLS on a real PostgreSQL database**, idempotent syncing and backup/restore.

```bash
npm run typecheck
```

## Security and privacy

- Routes are protected in `proxy.ts` **and** the session is checked again in every page, action and API route.
- RLS enabled and forced on every table; `anon` has no access; composite foreign keys stop cross-user references.
- Passwords are never stored in plain text (Supabase Auth, or scrypt in local mode); lockout after repeated failures.
- Zod validation in the browser **and** on the server; text is sanitized; exported CSV is protected against formula injection.
- Secrets live only in server environment variables; no private key in the frontend.
- Headers: CSP, `X-Frame-Options: DENY`, `noindex`, `Referrer-Policy`, `Permissions-Policy`.
- Logs never include financial values (Next's Server Function logging is turned off too).

## Project structure

```
src/
  app/            pages (App Router), API routes and auth
  components/     UI (primitives, forms, charts, layout)
  lib/finance/    pure financial engine (tested)
  lib/            validation, formatting, constants
  server/         auth, database, services, Server Actions
supabase/migrations/   schema + RLS (used by Supabase and by local mode)
scripts/migrate.ts     applies migrations to DATABASE_URL
tests/                 Vitest
docs/                  deploy guide, architecture and financial rules
```
