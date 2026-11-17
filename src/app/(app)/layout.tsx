import { redirect } from "next/navigation";
import { AppProvider, type ClientContext } from "@/components/app-context";
import { AppShell } from "@/components/layout/app-shell";
import { buildClientContext, shellData } from "@/server/view";
import { getAppData } from "@/server/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const data = await getAppData();
  if (!data.snapshot.profile.onboardingCompleted) redirect("/onboarding");
  const ctx: ClientContext = buildClientContext(data);
  const shell = shellData(data);
  return (
    <AppProvider value={ctx}>
      <AppShell notifications={shell.notifications} openBills={shell.openBills} debts={shell.debts}>
        {children}
      </AppShell>
    </AppProvider>
  );
}
