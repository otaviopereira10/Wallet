import type { Metadata } from "next";
import { AppProvider } from "@/components/app-context";
import { getAppData } from "@/server/context";
import { buildClientContext } from "@/server/view";
import { centsToInput } from "@/lib/format";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Configuração inicial" };

export default async function OnboardingPage() {
  const data = await getAppData();
  const s = data.snapshot;
  return (
    <AppProvider value={buildClientContext(data)}>
      <OnboardingWizard
        profile={{
          displayName: s.profile.displayName ?? "",
          baseCurrency: s.profile.baseCurrency,
          locale: s.profile.locale,
          timezone: s.profile.timezone,
          theme: s.profile.theme,
          emergencyBuffer: centsToInput(s.profile.emergencyBuffer),
          alertDaysAhead: s.profile.alertDaysAhead,
          aiEnabled: s.profile.aiEnabled,
        }}
        created={{
          accounts: s.accounts.map((a) => `${a.name} (${a.currency})`),
          incomes: s.incomes.map((i) => i.name),
          recurring: [...s.subscriptions.map((x) => x.name), ...s.transactions.filter((t) => t.recurrence !== "none").map((t) => t.description)],
          bills: s.bills.map((b) => b.name),
          debts: s.debts.map((d) => d.name),
          goals: s.goals.map((g) => g.name),
        }}
      />
    </AppProvider>
  );
}
