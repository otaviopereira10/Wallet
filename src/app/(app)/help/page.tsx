import type { Metadata } from "next";
import Link from "next/link";
import { NAV } from "@/components/layout/nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Help" };

/** Longer, plain-English explanation of each page (the short hint lives in nav.ts). */
const PAGE_DETAILS: Record<string, string> = {
  "/dashboard": "Your home screen: how much you have, what is safe to spend, upcoming bills, and alerts that need your attention.",
  "/intelligence": "Type a question like “Can I buy something for $150?” and get an answer calculated from your own numbers.",
  "/accounts": "Your checking, savings, cash and cards with their balances. Move money between them with a transfer.",
  "/income": "Salary, scholarship, family help, side jobs. Mark the ones that repeat so the app can plan ahead.",
  "/expenses": "Everything you spend. Mark something as “pending” if you have not paid it yet — it won’t lower your balance until you do.",
  "/bills": "Things you must pay by a date (rent, phone, tuition). The Payment Planner tells you which to pay first if money is short.",
  "/subscriptions": "Services that charge you regularly. See the yearly cost and flag the ones you barely use.",
  "/debt": "Your student loan: what you owe, the semester charges, and a simulator showing when it will be paid off.",
  "/budget": "Set a monthly limit per category (food, transport…) and see how much is left.",
  "/cash-flow": "A day-by-day forecast of your balance, so you see a shortfall before it happens.",
  "/goals": "Save for an emergency fund or anything else. The app suggests how much to put in each goal.",
  "/calendar": "Every money event on a calendar: income, due dates, payments, semester charges.",
  "/reports": "Totals for a month, quarter, semester or year. Download as CSV or PDF.",
  "/data": "Import a bank statement (CSV), download your data, or make and restore a full backup.",
  "/settings": "Your name, main currency, time zone, safety cushion, exchange rate, password and theme.",
};

const GLOSSARY: Array<[string, string]> = [
  ["Available now", "The real money in your everyday accounts right now. Only things already paid or received count."],
  ["Safe to spend", "Available now, minus the bills, subscriptions and planned payments still due this month, minus your safety cushion. Money you haven’t received yet is not counted."],
  ["Safety cushion", "An amount you always want to keep untouched for surprises. You set it in Settings."],
  ["Pending vs. paid", "A pending expense is planned but not paid yet, so it doesn’t lower your balance. Mark it as paid when the money leaves your account."],
  ["Bill vs. expense", "A bill is something you must pay by a due date. When you record a bill payment, the app creates the matching expense for you — don’t add it again."],
  ["Repeating", "Income or expenses that happen on a schedule (every month, every 2 weeks…). They are used for forecasts."],
  ["Transfer", "Moving money between your own accounts. It is not income or spending, so it never changes your totals."],
  ["Refund", "Money given back for a purchase. It reduces your spending in that category."],
  ["Semester charge", "The amount your school adds to your loan every period (5,500 by default — you can change it). The app adds it on the date you set."],
  ["Net worth", "Everything you have minus everything you owe."],
  ["Savings rate", "The share of your income you did not spend in a period."],
  ["Cash flow", "How your balance moves over time as money comes in and goes out."],
  ["Exchange rate", "Used to convert between USD and BRL. It updates from a public source, or you can type one in Settings."],
];

const RULES = [
  "Money is stored as exact cents, so totals never drift because of rounding.",
  "Only money you actually received or paid changes your balance. Pending items show up in forecasts, not in “Available now”.",
  "Transfers between your own accounts are never counted as income or spending.",
  "Amounts in the other currency are converted with the latest saved exchange rate. Without a rate, they are left out of totals and you are told so.",
  "Forecasts use your repeating income, bills, subscriptions and planned payments. They are estimates, not guarantees.",
  "If information is missing, the app says what is missing instead of guessing.",
];

const FAQ: Array<[string, string]> = [
  ["Why is my balance different from my bank?", "The app only knows what you entered. Check the account’s starting balance and any expenses still marked as pending. You can edit the account (its balance and the date of that balance) on the Accounts page."],
  ["I paid a bill — do I also add an expense?", "No. Press “Pay” next to the bill on Bills & Payments; the expense is created for you."],
  ["I can’t pay all my bills this month. What now?", "Open Bills & Payments → Payment Planner. It ranks bills by urgency, late fees and priority, and shows what can wait."],
  ["Does the app move money or pay anything?", "Never. It only organizes, calculates and recommends. Every payment is made by you, outside the app."],
  ["Who can see my data?", "Only you. Every row in the database is locked to your account."],
  ["How do I keep a copy of everything?", "Go to Import & Backup → Download full backup. You can restore it later in the same place."],
];

const START = [
  { href: "/accounts", title: "Add your accounts", text: "with today’s balance" },
  { href: "/income", title: "Add your income", text: "and mark what repeats" },
  { href: "/bills", title: "Add your bills", text: "with due dates" },
  { href: "/expenses", title: "Record spending", text: "with the pink + button" },
];

export default function HelpPage() {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <>
      <PageHeader eyebrow="App" title="Help" description="How Isabelle Wallet works, in plain English." />

      <Card className="mb-6">
        <CardHeader>
          <div>
            <CardTitle>Start here</CardTitle>
            <CardDescription>Four steps and the whole app works for you. Everything can be changed later.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {START.map((s, i) => (
              <li key={s.href}>
                <Link href={s.href} className="flex h-full gap-3 rounded-2xl border border-border p-4 transition hover:border-pink-300 hover:bg-pink-50/50">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pink-500 text-sm font-semibold text-on-primary">{i + 1}</span>
                  <span>
                    <span className="block text-sm font-semibold">{s.title}</span>
                    <span className="block text-xs text-muted">{s.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>What each page does</CardTitle>
              <CardDescription>The same pages you see in the menu.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {groups
              .filter((g) => g !== "App" || NAV.some((n) => n.group === g && PAGE_DETAILS[n.href]))
              .map((g) => (
                <div key={g}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{g}</p>
                  <ul className="space-y-1">
                    {NAV.filter((n) => n.group === g && PAGE_DETAILS[n.href]).map((n) => (
                      <li key={n.href}>
                        <Link href={n.href} className="flex gap-3 rounded-xl p-2 transition hover:bg-surface-2">
                          <n.icon className="mt-0.5 size-4 shrink-0 text-pink-500" />
                          <span>
                            <span className="block text-sm font-semibold">{n.label}</span>
                            <span className="block text-sm text-muted">{PAGE_DETAILS[n.href]}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card id="glossary">
            <CardHeader>
              <div>
                <CardTitle>Words used in the app</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                {GLOSSARY.map(([term, text]) => (
                  <div key={term}>
                    <dt className="text-sm font-semibold">{term}</dt>
                    <dd className="text-sm text-muted">{text}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>How the numbers are calculated</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
                {RULES.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div>
            <CardTitle>Common questions</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-xl bg-surface-2/60 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold">{q}</summary>
              <p className="mt-1.5 text-sm text-muted">{a}</p>
            </details>
          ))}
          <p className="pt-2 text-xs text-muted">
            Tip: press <kbd className="rounded border border-border px-1">Ctrl</kbd> + <kbd className="rounded border border-border px-1">K</kbd> (or{" "}
            <kbd className="rounded border border-border px-1">⌘</kbd> + <kbd className="rounded border border-border px-1">K</kbd>) to search pages and your entries.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
