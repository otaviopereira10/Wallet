-- =============================================================================
-- Isabelle Wallet — initial schema
-- Runs unchanged on Supabase (PostgreSQL 15+) and on the embedded local
-- database (PGlite). Every user-owned table carries user_id and is protected by
-- Row Level Security: a row is visible/editable only when user_id = auth.uid().
-- Money is stored as numeric(14,2) (exact decimal). Dates without time use the
-- `date` type; the application resolves "today" in the user's time zone.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile & preferences (1 row per user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  base_currency text not null default 'USD' check (base_currency in ('USD', 'BRL')),
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'en-US')),
  timezone text not null default 'America/New_York' check (char_length(timezone) between 1 and 64),
  theme text not null default 'light' check (theme in ('light', 'dark', 'system')),
  emergency_buffer numeric(14, 2) not null default 0 check (emergency_buffer >= 0),
  alert_days_ahead integer not null default 3 check (alert_days_ahead between 0 and 30),
  ai_enabled boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Money accounts (checking, savings, cash, cards...)
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('checking', 'savings', 'cash', 'credit_card', 'investment', 'other')),
  currency text not null check (currency in ('USD', 'BRL')),
  opening_balance numeric(14, 2) not null default 0,
  opening_date date not null,
  include_in_available boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index accounts_user_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- Income sources (one-off or recurring rules). Receipts are transactions.
-- ---------------------------------------------------------------------------
create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'BRL')),
  category text not null check (category in ('scholarship', 'salary', 'side_work', 'family', 'transfer', 'other_income')),
  start_date date not null,
  frequency text not null check (frequency in ('once', 'weekly', 'biweekly', 'monthly', 'semiannual', 'yearly', 'custom')),
  custom_interval integer check (custom_interval between 1 and 365),
  custom_unit text check (custom_unit in ('day', 'week', 'month')),
  end_date date,
  account_id uuid,
  skipped_dates date[] not null default '{}',
  notes text check (char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id),
  check (frequency <> 'custom' or (custom_interval is not null and custom_unit is not null)),
  check (end_date is null or end_date >= start_date)
);
create index incomes_user_idx on public.incomes (user_id);

-- ---------------------------------------------------------------------------
-- Debts (University Debt Manager)
-- ---------------------------------------------------------------------------
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  currency text not null check (currency in ('USD', 'BRL')),
  initial_balance numeric(14, 2) not null check (initial_balance >= 0),
  start_date date not null,
  increment_amount numeric(14, 2) not null default 0 check (increment_amount >= 0),
  increment_interval_months integer not null default 6 check (increment_interval_months between 1 and 24),
  increment_anchor_date date,
  increments_end_date date,
  interest_rate numeric(7, 4) not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  interest_since date,
  planned_monthly_payment numeric(14, 2) not null default 0 check (planned_monthly_payment >= 0),
  payment_day integer not null default 1 check (payment_day between 1 and 28),
  target_payoff_date date,
  notes text check (char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index debts_user_idx on public.debts (user_id);

-- ---------------------------------------------------------------------------
-- Bills & Payments
-- ---------------------------------------------------------------------------
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  minimum_amount numeric(14, 2) check (minimum_amount >= 0),
  currency text not null check (currency in ('USD', 'BRL')),
  category text not null,
  priority text not null check (priority in ('essential', 'important', 'optional')),
  recurrence text not null check (recurrence in ('once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  first_due_date date not null,
  end_date date,
  late_fee numeric(14, 2) not null default 0 check (late_fee >= 0),
  interest_rate numeric(7, 4) not null default 0 check (interest_rate >= 0 and interest_rate <= 1000),
  allows_partial boolean not null default false,
  account_id uuid,
  notes text check (char_length(notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id),
  check (minimum_amount is null or minimum_amount <= amount)
);
create index bills_user_idx on public.bills (user_id);

create table public.bill_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bill_id uuid not null,
  due_date date not null,
  amount_due numeric(14, 2) not null check (amount_due > 0),
  minimum_due numeric(14, 2) check (minimum_due >= 0),
  waived boolean not null default false,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (bill_id, due_date),
  foreign key (bill_id, user_id) references public.bills (id, user_id) on delete cascade
);
create index bill_occurrences_user_due_idx on public.bill_occurrences (user_id, due_date);

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'BRL')),
  billing_cycle text not null check (billing_cycle in ('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  next_charge_date date not null,
  category text not null default 'subscriptions',
  account_id uuid,
  status text not null default 'active' check (status in ('active', 'cancel_planned', 'cancelled')),
  last_used_on date,
  usage_note text check (char_length(usage_note) <= 300),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Ledger: every real (or pending) money movement
--   income       money in  (received)
--   expense      money out (status paid) or a commitment (status pending)
--   refund       money in that reverses part of a previous expense
--   transfer     between the user's own accounts — never income or expense
--   debt_payment money out that also reduces a debt balance
-- amount/currency      : value as entered by the user
-- account_amount       : value in the account's currency (explicit conversion)
-- to_amount            : (transfers) value credited in the destination currency
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense', 'refund', 'transfer', 'debt_payment')),
  status text not null default 'paid' check (status in ('paid', 'pending')),
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('USD', 'BRL')),
  account_id uuid,
  account_amount numeric(14, 2) check (account_amount > 0),
  fx_rate numeric(18, 8) check (fx_rate > 0),
  to_account_id uuid,
  to_amount numeric(14, 2) check (to_amount > 0),
  category text check (category in (
    'housing', 'food', 'groceries', 'transport', 'education', 'health', 'fitness',
    'entertainment', 'personal', 'subscriptions', 'travel', 'emergency', 'other',
    'scholarship', 'salary', 'side_work', 'family', 'transfer', 'other_income', 'debt'
  )),
  description text not null check (char_length(description) between 1 and 200),
  payment_method text check (payment_method in ('cash', 'debit_card', 'credit_card', 'pix', 'bank_transfer', 'zelle', 'check', 'other')),
  notes text check (char_length(notes) <= 1000),
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly')),
  series_id uuid,
  income_id uuid,
  income_occurrence date,
  subscription_id uuid,
  debt_id uuid,
  refund_of uuid,
  import_hash text check (char_length(import_hash) <= 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (income_id, user_id) references public.incomes (id, user_id) on delete set null (income_id),
  foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete set null (subscription_id),
  foreign key (debt_id, user_id) references public.debts (id, user_id) on delete set null (debt_id),
  foreign key (refund_of, user_id) references public.transactions (id, user_id) on delete set null (refund_of),
  -- only expenses can be pending; everything else is a completed movement
  check (kind = 'expense' or status = 'paid'),
  -- a completed movement must say which account it touched
  check (status = 'pending' or (account_id is not null and account_amount is not null)),
  check (kind <> 'transfer' or (to_account_id is not null and to_amount is not null and to_account_id <> account_id)),
  check (kind = 'transfer' or (to_account_id is null and to_amount is null)),
  check ((income_id is null) = (income_occurrence is null))
);
create index transactions_user_date_idx on public.transactions (user_id, date);
create index transactions_account_idx on public.transactions (account_id);
-- one receipt per income occurrence (prevents counting the same income twice)
create unique index transactions_income_occurrence_uniq
  on public.transactions (user_id, income_id, income_occurrence) where income_id is not null;
-- CSV import de-duplication
create unique index transactions_import_hash_uniq
  on public.transactions (user_id, import_hash) where import_hash is not null;

create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

create table public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  occurrence_id uuid not null,
  date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  transaction_id uuid,
  created_at timestamptz not null default now(),
  foreign key (occurrence_id, user_id) references public.bill_occurrences (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade
);
create index bill_payments_occurrence_idx on public.bill_payments (occurrence_id);

create table public.debt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  debt_id uuid not null,
  date date not null,
  type text not null check (type in ('increment', 'interest', 'payment', 'adjustment')),
  -- increment/interest/payment are positive; adjustment is signed
  amount numeric(14, 2) not null,
  automatic boolean not null default false,
  voided boolean not null default false,
  transaction_id uuid,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  foreign key (debt_id, user_id) references public.debts (id, user_id) on delete cascade,
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  check (type = 'adjustment' or amount > 0),
  check (amount <> 0)
);
create index debt_events_debt_date_idx on public.debt_events (debt_id, date);
-- scheduled increments / interest are posted at most once per date
create unique index debt_events_auto_uniq
  on public.debt_events (debt_id, type, date) where automatic;

-- ---------------------------------------------------------------------------
-- Savings goals
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('emergency', 'travel', 'electronics', 'purchase', 'college', 'debt_payoff', 'other')),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  currency text not null check (currency in ('USD', 'BRL')),
  deadline date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  monthly_contribution numeric(14, 2) not null default 0 check (monthly_contribution >= 0),
  notes text check (char_length(notes) <= 1000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index goals_user_idx on public.goals (user_id);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  date date not null,
  amount numeric(14, 2) not null check (amount <> 0),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);

-- ---------------------------------------------------------------------------
-- Monthly budget limits per category
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null check (currency in ('USD', 'BRL')),
  created_at timestamptz not null default now(),
  unique (user_id, category)
);

-- ---------------------------------------------------------------------------
-- Exchange rates (fetched from an external source or entered manually)
-- ---------------------------------------------------------------------------
create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  base text not null check (base in ('USD', 'BRL')),
  quote text not null check (quote in ('USD', 'BRL')),
  rate numeric(18, 8) not null check (rate > 0),
  rate_date date not null,
  source text not null check (char_length(source) between 1 and 40),
  is_manual boolean not null default false,
  fetched_at timestamptz not null default now(),
  check (base <> quote)
);
create unique index fx_rates_uniq on public.fx_rates (user_id, base, quote, rate_date, source);
create index fx_rates_user_idx on public.fx_rates (user_id, fetched_at desc);

-- =============================================================================
-- Row Level Security — private by default
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'accounts', 'incomes', 'debts', 'bills', 'bill_occurrences',
    'subscriptions', 'transactions', 'bill_payments', 'debt_events', 'goals',
    'goal_contributions', 'budgets', 'fx_rates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner', t
    );
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end
$$;
