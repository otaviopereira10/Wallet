import { ArrowDownLeft, CalendarClock, CircleCheck, GraduationCap, PiggyBank, Receipt, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_COLORS, DonutChart, IncomeExpenseChart, NetWorthChart } from "@/components/charts/charts";
import { GettingStarted } from "@/components/getting-started";
import { InsightList } from "@/components/insights";
import { InfoTip } from "@/components/ui/overlays";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/primitives";
import { categoryLabel } from "@/lib/constants";
import { isOpen } from "@/lib/finance/bills";
import { endOfMonth, startOfMonth } from "@/lib/finance/dates";
import { monthlySeries, netWorthSeries, spendingByCategory } from "@/lib/finance/ledger";
import { lastMonths } from "@/lib/finance/reports";
import { centsToInput, formatDate, formatMonth } from "@/lib/format";
import { getAppData } from "@/server/context";
import { QuickAddButton, UpcomingBills } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { snapshot: s, analysis: a } = await getAppData();
  const loc = s.profile.locale;
  const fmt = a.fmt;
  const months6 = monthlySeries(s.transactions, s.accounts, a.ctx, lastMonths(s.today, 6)).map((p) => ({
    label: formatMonth(p.month, loc),
    income: p.income / 100,
    expenses: p.expenses / 100,
    debt: p.debtPayments / 100,
  }));
  const nw = netWorthSeries(s.accounts, s.transactions, s.debts, s.debtEvents, a.ctx, lastMonths(s.today, 12), s.today).map((p) => ({
    label: formatMonth(p.month, loc),
    assets: p.assets / 100,
    debts: p.debts / 100,
    netWorth: p.netWorth / 100,
  }));
  const cats = Object.entries(
    spendingByCategory(s.transactions, s.accounts, a.ctx, startOfMonth(s.today), endOfMonth(s.today), { includePending: true }),
  )
    .filter(([, v]) => v > 0)
    .sort((x, y) => y[1] - x[1]);
  const catTotal = cats.reduce((x, [, v]) => x + v, 0);
  const upcoming = a.views
    .filter((v) => isOpen(v))
    .slice(0, 7)
    .map((v) => ({
      occurrenceId: v.occurrence.id,
      name: v.bill.name,
      dueDate: v.occurrence.dueDate,
      daysUntilDue: v.daysUntilDue,
      remaining: v.remaining,
      remainingInput: centsToInput(v.remaining),
      currency: v.bill.currency,
      priority: v.bill.priority,
      status: v.status,
      allowsPartial: v.bill.allowsPartial,
      accountId: v.bill.accountId,
    }));
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: s.profile.timezone }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const debtMain = a.debts[0];

  return (
    <>
      <PageHeader
        eyebrow={formatDate(s.today, loc, "long")}
        title={`${greet}${s.profile.displayName ? `, ${s.profile.displayName}` : ""}`}
        description="Where your money stands today, calculated from what you entered."
        actions={<QuickAddButton />}
      />

      <GettingStarted
        progress={{
          accounts: s.accounts.length > 0,
          income: s.incomes.length > 0 || s.transactions.some((t) => t.kind === "income"),
          bills: s.bills.length > 0,
          expense: s.transactions.some((t) => t.kind === "expense"),
          debt: s.debts.length > 0,
          goal: s.goals.length > 0,
        }}
      />

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Available now"
          value={fmt(a.spendableBalance)}
          icon={<Wallet />}
          tone="pink"
          sub={a.totalBalance !== a.spendableBalance ? `All accounts: ${fmt(a.totalBalance)}` : "Real money in your everyday accounts"}
          info={<InfoTip>The real balance of your everyday accounts. Only money already paid or received is counted.</InfoTip>}
        />
        <StatCard
          label="Safe to spend this month"
          value={fmt(a.safeMonth.amount)}
          icon={<ShieldCheck />}
          tone={a.safeMonth.amount > 0 ? "success" : "danger"}
          sub={`After ${fmt(a.safeMonth.obligations)} of bills and ${fmt(a.safeMonth.buffer)} safety cushion`}
          info={
            <InfoTip>
              Available now − bills, pending expenses, subscriptions and planned payments until the end of the month − your safety cushion. Money you have not received yet is not counted.
            </InfoTip>
          }
        />
        <StatCard label="Received this month" value={fmt(a.month.income)} icon={<ArrowDownLeft />} tone="success" sub={`Last month: ${fmt(a.prevMonth.income)}`} />
        <StatCard
          label="Spent this month"
          value={fmt(a.month.netExpenses)}
          icon={<Receipt />}
          tone="warning"
          sub={`${a.month.debtPayments ? `+ ${fmt(a.month.debtPayments)} paid on debt · ` : ""}Last month: ${fmt(a.prevMonth.netExpenses)}`}
        />
        <StatCard
          label="Bills left this month"
          value={fmt(a.buckets.monthTotal)}
          icon={<CalendarClock />}
          tone={a.buckets.overdue.length ? "danger" : "neutral"}
          sub={a.buckets.overdue.length ? `${a.buckets.overdue.length} overdue: ${fmt(a.buckets.overdueTotal)}` : "Total still to pay this month"}
        />
        <StatCard label="Bills paid" value={fmt(a.buckets.paidThisMonth)} icon={<CircleCheck />} tone="success" sub="Bill payments this month" />
        <StatCard
          label="University debt"
          value={debtMain ? fmt(a.debtTotal) : "—"}
          icon={<GraduationCap />}
          tone="plum"
          sub={
            debtMain?.nextIncrement ? (
              `Next semester charge on ${formatDate(debtMain.nextIncrement, loc)}`
            ) : debtMain ? (
              "No more semester charges"
            ) : (
              <Link href="/debt" className="text-pink-600 hover:underline">
                Set up your debt
              </Link>
            )
          }
        />
        <StatCard label="Total saved" value={fmt(a.savingsTotal)} icon={<PiggyBank />} tone="pink" sub={`${a.goals.length} active goal(s)`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Your money summary</CardTitle>
              <CardDescription>Things worth knowing, calculated from your records.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <InsightList items={a.insights} limit={7} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Upcoming bills</CardTitle>
              <CardDescription>Overdue bills come first.</CardDescription>
            </div>
            <Link href="/bills" className="text-xs font-semibold text-pink-600 hover:underline">
              See all
            </Link>
          </CardHeader>
          <CardContent className="pt-2">
            <UpcomingBills items={upcoming} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Income vs. expenses</CardTitle>
              <CardDescription>Last 6 months (transfers between your accounts are not counted).</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{s.transactions.length ? <IncomeExpenseChart data={months6} /> : <EmptyChart />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Net worth and debt over time</CardTitle>
              <CardDescription>Money in accounts minus debts, at the end of each month.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{s.accounts.length || s.debts.length ? <NetWorthChart data={nw} /> : <EmptyChart />}</CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>This month by category</CardTitle>
            <CardDescription>Includes pending expenses; refunds are subtracted.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {cats.length ? (
            <div className="grid items-center gap-6 md:grid-cols-[260px_1fr]">
              <DonutChart data={cats.map(([k, v]) => ({ name: categoryLabel(k), value: v / 100 }))} centerLabel="Total" centerValue={fmt(catTotal)} />
              <ul className="grid gap-2 sm:grid-cols-2">
                {cats.map(([k, v], i) => (
                  <li key={k} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                      {categoryLabel(k)}
                    </span>
                    <span className="tabular font-semibold">
                      {fmt(v)} <span className="font-normal text-muted">· {Math.round((v / catTotal) * 100)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyChart text="No expenses recorded this month." />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function EmptyChart({ text = "Charts appear as soon as you record some money in or out." }: { text?: string }) {
  return <div className="grid h-48 place-items-center rounded-2xl bg-surface-2/50 px-4 text-center text-sm text-muted">{text}</div>;
}
