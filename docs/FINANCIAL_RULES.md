# Isabelle Wallet financial rules

This document explains **how every number is calculated**. All rules live in the pure
financial engine in `src/lib/finance/` (no database or network access) and are covered by
tests in `tests/`.

## 1. How values are stored

| Item | Rule |
|---|---|
| Money in the database | `numeric(14,2)` — exact decimal |
| Money in the code | integers in **cents** (`Cents`), so sums and differences are exact |
| Rates (interest, exchange) | `decimal.js`, rounding **half away from zero**, once, to cents |
| Dates | `date` without time (`"YYYY-MM-DD"`), arithmetic in UTC; "today" is resolved in the **user's time zone** |
| Currencies | USD and BRL. Amounts in different currencies are **never** added without an explicit conversion |

## 2. Real balance vs. projected balance

- **Real balance** of an account = starting balance + **paid/received** transactions from the starting-balance date on.
- Transactions dated **before** the starting balance are history (already included in it) and do not change the balance again.
- **A pending expense is not a payment**: it does not lower the real balance until it is marked as paid.
- **Future income is not available money**: it only counts once the receipt is confirmed.
- **Projected balance** (Cash Flow) starts from today's real balance and adds/subtracts expected events, always labelled as a forecast.

## 3. Transaction types

| Type | Effect on the account | Counts as income? | Counts as spending? |
|---|---|---|---|
| `income` | + | yes | — |
| `expense` (paid) | − | — | yes |
| `expense` (pending) | none | — | commitment (budget) |
| `refund` | + | — | reduces spending in its category |
| `transfer` | − from, + to | **no** | **no** |
| `debt_payment` | − | — | money out (separate from "expenses") **and** reduces the debt |

- A debt payment creates **one** transaction (money out) and **one** linked debt event — each ledger counts the operation exactly once. Deleting the transaction deletes the event.
- Paying a bill creates a paid expense linked to that due date.
- Transfers between currencies store the amount that left (source currency) and the amount that arrived (destination currency).
- Duplicate prevention: one receipt per income occurrence (`unique`), unique import hash, unique bill occurrences per date, unique automatic semester charges per date.

## 4. Exchange rate

- Rates come from the configured provider (default: Frankfurter / European Central Bank) and are saved with date, time and source.
- Rate in use = the most recently updated one (automatic or manual).
- Historical transactions use the rate for their date (or the closest one); current balances use the latest rate.
- Without a rate, the amount is left **out** of totals and the app says so — it never uses an invented rate.
- When recording into an account in the other currency, the converted amount and the rate used are saved.

## 5. Recurrence

- Frequencies: one-time, weekly, every 2 weeks, monthly, quarterly, every semester, yearly and custom (every N days/weeks/months).
- Monthly steps are calculated from the original date (Jan 31 → Feb 28 → Mar 31), so dates never "drift".
- Monthly equivalent: weekly × 52/12, every 2 weeks × 26/12, semester ÷ 6, yearly ÷ 12.

## 6. Bills & Payments

- Each repeating bill creates due dates ("occurrences") up to 62 days ahead; each occurrence has its own status.
- Status: **paid** (payments ≥ amount), **partly paid**, **not paid**, **overdue** (past due and not fully paid), **skipped**.
- A partial payment is only accepted if the bill allows it, and never above what is left.
- Estimated cost of paying late = fixed late fee + amount × yearly interest × days / 365.

### Payment Planner

Order: (1) priority essential → important → optional; (2) overdue first; (3) closest due date;
(4) highest cost of paying late; (5) smallest amount.
Allocation: minimums first (or the full amount when partial payments are not allowed), then the
rest. Essential bills may use the safety cushion (with a warning); important and optional bills
may not. An optional bill **never** goes before an essential one. Ties within the same priority
are explained on screen. Nothing is actually paid.

## 7. University Debt

```
balance = starting balance + semester charges + interest (if any) ± adjustments − payments
```

- The semester charge (default 5,500, configurable) is **a new amount added to the debt**, separate from interest.
- Charges are added automatically on: anchor date + k × interval (months), only after the start date and until the end date (if set). Each one appears in the history with date and amount; voiding an automatic entry does not recreate it.
- Interest (optional): added on the last day of each month on that day's balance (first month prorated by days).
- **Simulator**: month by month, respecting the real date of each charge and each payment (on the configured day, starting from the next date after today). It never uses "balance ÷ payment".
- **Paid off** is only declared when the balance reaches zero **and** there are no future charges.
- **Minimum to stop it growing** = charge ÷ months in the interval + 1 month of interest on the current balance. The app warns when the planned payment is lower.
- **Strategies**: Conservative / Balanced / Aggressive = 25% / 50% / 80% of the estimated monthly surplus (rounded down to 10). Recommendation: emergency fund < 1 month of essential expenses → Conservative; 1–3 months → Balanced; ≥ 3 → Aggressive; if the recommended one does not cover the charges, it moves up to the first one that does.

## 8. Monthly surplus (capacity)

- Monthly income = monthly equivalent of active repeating income.
- Repeating obligations = repeating bills + subscriptions + repeating expenses (monthly equivalent).
- Everyday spending = average of the last 3 complete months (excluding bills, subscriptions and repeating items); with no history, the budget total is used and the app says so.
- Surplus = income − obligations − everyday spending. Always shown with its assumptions and missing data.

## 9. How much can I spend

- **This month** ("Safe to spend"): available balance − obligations until the end of the month (bills, pending expenses, repeating items, subscriptions, planned debt payment, planned goal contributions) − safety cushion. Future income is not counted.
- **Until the next paycheck**: the same calculation, up to the day before the next expected income.
- **Room including expected income**: lowest projected balance in the coming days − safety cushion.

## 10. Budget

- Category spending = paid + pending expenses − refunds in the month.
- State: < 80% on track; 80–100% close to the limit; > 100% over.
- Month projection = spending so far + daily pace of **everyday** spending × days left.

## 11. Goals

- Saved = sum of contributions (withdrawals are negative).
- Estimate = months needed at the planned monthly amount; needed per month = remaining ÷ months until the target date.
- Suggested amount per goal = monthly surplus − planned debt payment, split by priority (3:2:1) without giving a goal more than it still needs.

## 12. Subscriptions

- Monthly/yearly cost estimated from the billing cycle; reminder before the next charge based on your preference.
- "Rarely used" only appears when a **last used date** was entered (> 30 days ago). Without it, the app shows "No usage info".
