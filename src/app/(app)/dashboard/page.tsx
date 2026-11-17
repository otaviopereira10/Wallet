import { ArrowDownLeft, CalendarClock, CircleCheck, GraduationCap, PiggyBank, Receipt, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_COLORS, DonutChart, IncomeExpenseChart, NetWorthChart } from "@/components/charts/charts";
import { InsightList } from "@/components/insights";
import { InfoTip } from "@/components/ui/overlays";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, StatCard } from "@/components/ui/primitives";
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
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const debtMain = a.debts[0];

  return (
    <>
      <PageHeader
        eyebrow={formatDate(s.today, loc, "long")}
        title={`${greet}${s.profile.displayName ? `, ${s.profile.displayName}` : ""}`}
        description="Sua situação financeira de hoje, calculada a partir dos seus dados."
        actions={<QuickAddButton />}
      />

      {!s.accounts.length && (
        <EmptyState
          className="mb-6"
          icon={<Wallet />}
          title="Comece cadastrando uma conta com o saldo atual"
          description="O saldo disponível e todas as projeções partem do dinheiro que você tem hoje."
          action={
            <Link href="/accounts" className="font-semibold text-pink-600 hover:underline">
              Cadastrar conta →
            </Link>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Saldo disponível"
          value={fmt(a.spendableBalance)}
          icon={<Wallet />}
          tone="pink"
          sub={a.totalBalance !== a.spendableBalance ? `Total em contas: ${fmt(a.totalBalance)}` : "Saldo real das contas do dia a dia"}
          info={<InfoTip>Soma dos saldos reais das contas marcadas como “dinheiro disponível”. Só inclui movimentações pagas/recebidas.</InfoTip>}
        />
        <StatCard
          label="Ainda posso gastar no mês"
          value={fmt(a.safeMonth.amount)}
          icon={<ShieldCheck />}
          tone={a.safeMonth.amount > 0 ? "success" : "danger"}
          sub={`Após ${fmt(a.safeMonth.obligations)} em obrigações e ${fmt(a.safeMonth.buffer)} de reserva`}
          info={
            <InfoTip>
              Saldo disponível − contas, despesas pendentes, assinaturas e pagamentos planejados até o fim do mês − reserva mínima. Receitas futuras não entram.
            </InfoTip>
          }
        />
        <StatCard label="Recebido no mês" value={fmt(a.month.income)} icon={<ArrowDownLeft />} tone="success" sub={`Mês anterior: ${fmt(a.prevMonth.income)}`} />
        <StatCard
          label="Despesas do mês"
          value={fmt(a.month.netExpenses)}
          icon={<Receipt />}
          tone="warning"
          sub={`${a.month.debtPayments ? `+ ${fmt(a.month.debtPayments)} pagos na dívida · ` : ""}Mês anterior: ${fmt(a.prevMonth.netExpenses)}`}
        />
        <StatCard
          label="Contas pendentes"
          value={fmt(a.buckets.monthTotal)}
          icon={<CalendarClock />}
          tone={a.buckets.overdue.length ? "danger" : "neutral"}
          sub={a.buckets.overdue.length ? `${a.buckets.overdue.length} atrasada(s): ${fmt(a.buckets.overdueTotal)}` : "Total para quitar as contas do mês"}
        />
        <StatCard label="Já pago em contas" value={fmt(a.buckets.paidThisMonth)} icon={<CircleCheck />} tone="success" sub="Pagamentos de contas neste mês" />
        <StatCard
          label="Dívida universitária"
          value={debtMain ? fmt(a.debtTotal) : "—"}
          icon={<GraduationCap />}
          tone="plum"
          sub={
            debtMain?.nextIncrement ? (
              `Próximo acréscimo em ${formatDate(debtMain.nextIncrement, loc)}`
            ) : debtMain ? (
              "Sem acréscimos futuros"
            ) : (
              <Link href="/debt" className="text-pink-600 hover:underline">
                Configurar dívida
              </Link>
            )
          }
        />
        <StatCard label="Economia acumulada" value={fmt(a.savingsTotal)} icon={<PiggyBank />} tone="pink" sub={`${a.goals.length} meta(s) ativa(s)`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Seu resumo financeiro</CardTitle>
              <CardDescription>Observações calculadas a partir dos seus registros.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <InsightList items={a.insights} limit={7} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Próximas contas a vencer</CardTitle>
              <CardDescription>Atrasadas aparecem primeiro.</CardDescription>
            </div>
            <Link href="/bills" className="text-xs font-semibold text-pink-600 hover:underline">
              Ver todas
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
              <CardTitle>Receitas × despesas</CardTitle>
              <CardDescription>Últimos 6 meses (transferências não entram).</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{s.transactions.length ? <IncomeExpenseChart data={months6} /> : <EmptyChart />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Evolução do patrimônio e das dívidas</CardTitle>
              <CardDescription>Saldo das contas − dívidas, no fim de cada mês.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>{s.accounts.length || s.debts.length ? <NetWorthChart data={nw} /> : <EmptyChart />}</CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Gastos do mês por categoria</CardTitle>
            <CardDescription>Inclui despesas pendentes; reembolsos são descontados.</CardDescription>
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
            <EmptyChart text="Nenhuma despesa registrada neste mês." />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function EmptyChart({ text = "Os gráficos aparecem assim que houver movimentações registradas." }: { text?: string }) {
  return <div className="grid h-48 place-items-center rounded-2xl bg-surface-2/50 px-4 text-center text-sm text-muted">{text}</div>;
}
