"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";
import type { Currency } from "@/lib/finance/types";
import { formatDate, formatMoney } from "@/lib/format";

export interface ClientAccount {
  id: string;
  name: string;
  currency: Currency;
  type: string;
  archived: boolean;
}

export interface ClientContext {
  baseCurrency: Currency;
  locale: "pt-BR" | "en-US";
  today: string;
  accounts: ClientAccount[];
  displayName: string | null;
  email: string;
  aiEnabled: boolean;
  aiAvailable: boolean;
  theme: "light" | "dark" | "system";
  backend: "local" | "supabase";
  usdBrl: { rate: string; rateDate: string; source: string; isManual: boolean } | null;
}

const Ctx = React.createContext<ClientContext | null>(null);

export function AppProvider({ value, children }: { value: ClientContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): ClientContext {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useApp fora do AppProvider");
  return v;
}

export function useFormat() {
  const { baseCurrency, locale } = useApp();
  return React.useMemo(
    () => ({
      money: (cents: number | null | undefined, currency: Currency = baseCurrency, opts?: { signed?: boolean; compact?: boolean }) =>
        formatMoney(cents, currency, locale, opts),
      date: (iso: string | null | undefined, style: "short" | "medium" | "long" = "medium") => formatDate(iso, locale, style),
      base: baseCurrency,
      locale,
    }),
    [baseCurrency, locale],
  );
}

/** Runs a Server Action with pending state, toasts and router refresh. */
export function useServerAction() {
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();
  const run = React.useCallback(
    (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn: () => Promise<ActionResult<any>>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opts: { success?: string; onSuccess?: (data: any) => void; onError?: (r: Extract<ActionResult, { ok: false }>) => void; silent?: boolean } = {},
    ) =>
      new Promise<boolean>((resolve) => {
        startTransition(async () => {
          try {
            const r = await fn();
            if (r.ok) {
              if (!opts.silent) toast.success(opts.success ?? r.message ?? "Salvo com sucesso");
              opts.onSuccess?.(r.data);
              router.refresh();
              resolve(true);
            } else {
              toast.error(r.error);
              opts.onError?.(r);
              resolve(false);
            }
          } catch {
            toast.error("Falha de conexão. Verifique sua internet e tente novamente.");
            resolve(false);
          }
        });
      }),
    [router],
  );
  return { pending, run };
}
