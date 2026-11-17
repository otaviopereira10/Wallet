import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { collectFlowEvents } from "@/lib/finance/cashflow";
import { addDays } from "@/lib/finance/dates";
import { getAppData } from "@/server/context";
import { CashFlowClient } from "./cash-flow-client";

export const metadata: Metadata = { title: "Cash Flow Forecast" };

const HORIZONS = [30, 60, 90, 180];

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ days?: string; goals?: string }> }) {
  const params = await searchParams;
  const days = HORIZONS.includes(Number(params.days)) ? Number(params.days) : 60;
  const includeGoals = params.goals !== "0";
  const { snapshot: s, analysis: a } = await getAppData();
  const to = addDays(s.today, days);
  const events = collectFlowEvents(s, a.ctx, { to, includeGoals, views: a.views });
  return (
    <>
      <PageHeader
        eyebrow="Planejamento"
        title="Cash Flow Forecast"
        description="Veja seu dinheiro antes de gastá-lo. O ponto de partida é o saldo real de hoje; tudo depois é previsão."
      />
      <CashFlowClient
        today={s.today}
        to={to}
        days={days}
        horizons={HORIZONS}
        includeGoals={includeGoals}
        start={a.spendableBalance}
        buffer={s.profile.emergencyBuffer}
        events={events}
        variableMonthly={a.capacity.variableSpending}
        missingFx={a.ctx.missingCurrencies}
        unconfirmedCount={a.unconfirmed.length}
      />
    </>
  );
}
