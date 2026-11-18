"use client";

import { Download, FileDown, FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useFormat } from "@/components/app-context";
import { CATEGORY_COLORS, DonutChart, HorizontalBars, IncomeExpenseChart, MultiLineChart, NetWorthChart, SERIES } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, ProgressBar, Select, StatCard } from "@/components/ui/primitives";
import type { ReportPeriod } from "@/lib/finance/reports";
import type { PeriodFlows } from "@/lib/finance/ledger";

interface ReportView {
  flows: PeriodFlows;
  savingsRate: number | null;
  transactionCount: number;
  byCategory: Array<{ category: string; label: string; amount: number; share: number }>;
  incomeByCategory: Array<{ category: string; label: string; amount: number }>;
  monthly: Array<{ month: string; label: string; income: number; expenses: number; debtPayments: number; net: number }>;
  netWorth: Array<{ label: string; assets: number; debts: number; netWorth: number }>;
  debt: Array<{ label: string; balance: number }>;
  budgetVsActual: Array<{ category: string; label: string; planned: number; actual: number }>;
  goals: Array<{ name: string; target: number; saved: number; savedInPeriod: number }>;
}

const PERIOD_LABEL: Record<ReportPeriod, string> = { month: "Monthly", quarter: "Quarterly", semester: "Semester (6 months)", year: "Yearly", custom: "Custom dates" };

export function ReportsClient({
  period,
  refDate,
  from,
  to,
  report,
  displayName,
}: {
  period: ReportPeriod;
  refDate: string;
  from: string;
  to: string;
  report: ReportView;
  displayName: string | null;
}) {
  const f = useFormat();
  const router = useRouter();
  const [kind, setKind] = React.useState<ReportPeriod>(period);
  const [ref, setRef] = React.useState(refDate);
  const [cFrom, setCFrom] = React.useState(from);
  const [cTo, setCTo] = React.useState(to);
  const [exporting, setExporting] = React.useState(false);
  const r = report;
  const apply = () => {
    const q = new URLSearchParams({ period: kind });
    if (kind === "custom") {
      q.set("from", cFrom);
      q.set("to", cTo);
    } else q.set("ref", ref);
    router.push(`/reports?${q.toString()}`);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const { autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pink: [number, number, number] = [201, 107, 152];
      const m = (c: number) => f.money(c);
      doc.setFillColor(252, 238, 244);
      doc.rect(0, 0, 595, 90, "F");
      doc.setTextColor(48, 38, 48);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Isabelle Wallet", 40, 45);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`${PERIOD_LABEL[period]} report · ${f.date(from)} to ${f.date(to)}${displayName ? ` · ${displayName}` : ""}`, 40, 66);
      doc.setFontSize(8);
      doc.setTextColor(136, 129, 138);
      doc.text(`Created ${new Date().toLocaleString(f.locale)} · amounts in ${f.base}`, 40, 80);
      const opts = { headStyles: { fillColor: pink }, styles: { fontSize: 9 }, margin: { left: 40, right: 40 } };
      autoTable(doc, {
        ...opts,
        startY: 110,
        head: [["Summary", "Amount"]],
        body: [
          ["Income", m(r.flows.income)],
          ["Expenses (after refunds)", m(r.flows.netExpenses)],
          ["Debt payments", m(r.flows.debtPayments)],
          ["Total money out", m(r.flows.outflows)],
          ["Net (in − out)", m(r.flows.net)],
          ["Savings rate", r.savingsRate === null ? "—" : `${r.savingsRate}%`],
          ["Unpaid expenses in the period", m(r.flows.expensesPending)],
        ],
      });
      const next = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
      if (r.monthly.length)
        autoTable(doc, { ...opts, startY: next(), head: [["Month", "Income", "Expenses", "Debt", "Net"]], body: r.monthly.map((x) => [x.label, m(x.income), m(x.expenses), m(x.debtPayments), m(x.net)]) });
      if (r.byCategory.length)
        autoTable(doc, { ...opts, startY: next(), head: [["Spending by category", "Amount", "%"]], body: r.byCategory.map((c) => [c.label, m(c.amount), `${c.share}%`]) });
      if (r.incomeByCategory.length) autoTable(doc, { ...opts, startY: next(), head: [["Income by category", "Amount"]], body: r.incomeByCategory.map((c) => [c.label, m(c.amount)]) });
      if (r.budgetVsActual.length)
        autoTable(doc, { ...opts, startY: next(), head: [["Budget", "Planned", "Actual"]], body: r.budgetVsActual.map((b) => [b.label, m(b.planned), m(b.actual)]) });
      if (r.debt.length) autoTable(doc, { ...opts, startY: next(), head: [["Debt over time", "Balance at month end"]], body: r.debt.map((d) => [d.label, m(d.balance)]) });
      if (r.goals.length)
        autoTable(doc, { ...opts, startY: next(), head: [["Goal", "Target", "Saved", "In this period"]], body: r.goals.map((g) => [g.name, m(g.target), m(g.saved), m(g.savedInPeriod)]) });
      doc.setFontSize(8);
      doc.setTextColor(136, 129, 138);
      doc.text("Transfers between your own accounts are not counted as income or expenses. Amounts converted with the exchange rate saved in the app.", 40, 820);
      doc.save(`isabelle-wallet-report-${from}-to-${to}.pdf`);
      toast.success("PDF created");
    } catch {
      toast.error("Could not create the PDF.");
    } finally {
      setExporting(false);
    }
  };

  const csv = (type: string, withPeriod = true) => `/api/export?type=${type}${withPeriod ? `&from=${from}&to=${to}` : ""}`;

  return (
    <>
      <Card className="mb-6">
        <CardContent className="grid items-end gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-[180px_1fr_1fr_auto_auto]">
          <Field label="Report type" htmlFor="rp-kind">
            <Select id="rp-kind" value={kind} onChange={(e) => setKind(e.target.value as ReportPeriod)}>
              {(Object.keys(PERIOD_LABEL) as ReportPeriod[]).map((k) => (
                <option key={k} value={k}>
                  {PERIOD_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {kind === "custom" ? (
            <>
              <Field label="From" htmlFor="rp-from">
                <Input id="rp-from" type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
              </Field>
              <Field label="To" htmlFor="rp-to">
                <Input id="rp-to" type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} />
              </Field>
            </>
          ) : (
            <Field label="Pick any day inside the period" htmlFor="rp-ref" className="lg:col-span-2">
              <Input id="rp-ref" type="date" value={ref} onChange={(e) => setRef(e.target.value)} />
            </Field>
          )}
          <Button onClick={apply}>Show report</Button>
          <Button variant="outline" onClick={exportPdf} loading={exporting}>
            <FileDown /> PDF
          </Button>
        </CardContent>
      </Card>

      <p className="mb-4 text-sm text-muted">
        {PERIOD_LABEL[period]} · <strong className="text-ink">{f.date(from)}</strong> to <strong className="text-ink">{f.date(to)}</strong> · {r.transactionCount} transaction(s)
      </p>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Income" value={f.money(r.flows.income)} tone="success" />
        <StatCard label="Expenses" value={f.money(r.flows.netExpenses)} sub={r.flows.refunds ? `Refunds: ${f.money(r.flows.refunds)}` : undefined} tone="warning" />
        <StatCard label="Debt payments" value={f.money(r.flows.debtPayments)} tone="plum" />
        <StatCard
          label="Net (in − out)"
          value={f.money(r.flows.net, undefined, { signed: true })}
          tone={r.flows.net >= 0 ? "success" : "danger"}
          sub={r.savingsRate !== null ? `Savings rate: ${r.savingsRate}%` : "No income in this period"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Income vs. expenses by month</CardTitle>
              <CardDescription>Transfers between your own accounts are left out.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart data={r.monthly.map((x) => ({ label: x.label, income: x.income / 100, expenses: x.expenses / 100, debt: x.debtPayments / 100 }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {r.byCategory.length ? (
              <div className="grid items-center gap-4 sm:grid-cols-[200px_1fr]">
                <DonutChart data={r.byCategory.map((c) => ({ name: c.label, value: c.amount / 100 }))} height={200} />
                <ul className="space-y-1.5 text-sm">
                  {r.byCategory.map((c, i) => (
                    <li key={c.category} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                        {c.label}
                      </span>
                      <span className="tabular">
                        {f.money(c.amount)} <span className="text-muted">({c.share}%)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted">No expenses in this period.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Net worth over time</CardTitle>
              <CardDescription>What you have, what you owe, and the difference (net worth) at the end of each month.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {r.netWorth.length ? (
              <NetWorthChart data={r.netWorth.map((x) => ({ label: x.label, assets: x.assets / 100, debts: x.debts / 100, netWorth: x.netWorth / 100 }))} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">This period is in the future — no history yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>University debt over time</CardTitle>
          </CardHeader>
          <CardContent>
            {r.debt.some((d) => d.balance) ? (
              <MultiLineChart data={r.debt.map((d) => ({ label: d.label, balance: d.balance / 100 }))} series={[{ key: "balance", name: "Debt balance", color: SERIES.debt }]} height={260} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">No debt in this period.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Budget: planned vs. actual</CardTitle>
              <CardDescription>Planned = monthly limit × number of months in the period.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {r.budgetVsActual.length ? (
              <HorizontalBars data={r.budgetVsActual.map((b) => ({ label: b.label, planned: b.planned / 100, actual: b.actual / 100 }))} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">No budget set.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Goal progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {r.goals.length ? (
              r.goals.map((g) => {
                const pct = g.target ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
                return (
                  <div key={g.name}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium">{g.name}</span>
                      <span className="tabular text-muted">
                        {f.money(g.saved)} / {f.money(g.target)} · +{f.money(g.savedInPeriod)} in this period
                      </span>
                    </div>
                    <ProgressBar value={pct} label={`${g.name} ${pct}%`} />
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-muted">No goals.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Download your data</CardTitle>
            <CardDescription>CSV files (open in Excel, Numbers and Google Sheets).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            ["transactions", "Transactions in this period", true],
            ["bills", "Bills due in this period", true],
            ["debt", "Debt history", true],
            ["goals", "Goal contributions", true],
            ["incomes", "Income sources", false],
            ["subscriptions", "Subscriptions", false],
          ].map(([type, label, period]) => (
            <Button key={String(type)} asChild variant="outline" size="sm">
              <a href={csv(String(type), Boolean(period))} download>
                <FileSpreadsheet /> {String(label)}
              </a>
            </Button>
          ))}
          <Button variant="secondary" size="sm" onClick={exportPdf} loading={exporting}>
            <Download /> PDF report
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
