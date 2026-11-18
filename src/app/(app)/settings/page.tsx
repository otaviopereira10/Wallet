import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/primitives";
import { FxConverter } from "@/lib/finance/fx";
import { centsToInput } from "@/lib/format";
import { getAppData } from "@/server/context";
import { env } from "@/server/env";
import { aiAvailable } from "@/server/services/ai";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { snapshot: s, user } = await getAppData();
  const fx = new FxConverter(s.fxRates);
  const latest = fx.latest("USD", "BRL");
  const history = s.fxRates
    .filter((r) => !r.isManual && r.base === "USD" && r.quote === "BRL")
    .sort((a, b) => (a.rateDate < b.rateDate ? 1 : -1))
    .slice(0, 30)
    .map((r) => ({ date: r.rateDate, rate: r.rate, source: r.source }));
  const manual = s.fxRates
    .filter((r) => r.isManual)
    .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))
    .slice(0, 10)
    .map((r) => ({ date: r.rateDate, rate: r.rate, base: r.base, quote: r.quote, fetchedAt: r.fetchedAt }));
  return (
    <>
      <PageHeader eyebrow="App" title="Settings" description="Your profile, preferences, exchange rate, security and data." />
      <SettingsClient
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
        fx={{ latest, history, manual, provider: env.fxProvider }}
        system={{ backend: env.backend, email: user.email, aiConfigured: aiAvailable(), aiModel: env.aiModel ?? "claude-opus-5-5" }}
      />
    </>
  );
}
