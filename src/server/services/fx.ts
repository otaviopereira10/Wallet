import "server-only";
import { addDays } from "@/lib/finance/dates";
import { withUser } from "../db";
import { env } from "../env";

/**
 * Exchange rates from a configurable external provider.
 * - frankfurter (default): European Central Bank reference rates, free, no key.
 * - awesomeapi: Brazilian provider with intraday USD-BRL quotes.
 * Rates are stored per user with date, time and source. When the provider is
 * unavailable the last known rate stays in use and the user can type a manual
 * rate. Rates are never invented.
 */
interface FetchedRate {
  rateDate: string;
  rate: string;
}

const TIMEOUT_MS = 4000;
const STALE_MS = 12 * 60 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000;
const lastAttempt = new Map<string, number>();

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`Provedor de câmbio respondeu ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function validRate(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  return n.toFixed(8);
}

export async function fetchUsdBrl(history?: { from: string; to: string }): Promise<{ source: string; rates: FetchedRate[] }> {
  if (env.fxProvider === "awesomeapi") {
    const base = env.fxApiBase ?? "https://economia.awesomeapi.com.br/json";
    const data = (await getJson(`${base}/last/USD-BRL`)) as { USDBRL?: { bid?: string; create_date?: string } };
    const rate = validRate(data.USDBRL?.bid);
    if (!rate) throw new Error("Resposta inválida do provedor de câmbio");
    return { source: "awesomeapi", rates: [{ rateDate: (data.USDBRL?.create_date ?? new Date().toISOString()).slice(0, 10), rate }] };
  }
  const base = env.fxApiBase ?? "https://api.frankfurter.dev/v1";
  if (history) {
    const data = (await getJson(`${base}/${history.from}..${history.to}?base=USD&symbols=BRL`)) as {
      rates?: Record<string, { BRL?: number }>;
    };
    const rates: FetchedRate[] = [];
    for (const [date, r] of Object.entries(data.rates ?? {})) {
      const rate = validRate(r.BRL);
      if (rate && /^\d{4}-\d{2}-\d{2}$/.test(date)) rates.push({ rateDate: date, rate });
    }
    return { source: "frankfurter", rates };
  }
  const data = (await getJson(`${base}/latest?base=USD&symbols=BRL`)) as { date?: string; rates?: { BRL?: number } };
  const rate = validRate(data.rates?.BRL);
  if (!rate || !data.date) throw new Error("Resposta inválida do provedor de câmbio");
  return { source: "frankfurter", rates: [{ rateDate: data.date, rate }] };
}

export async function storeRates(userId: string, source: string, rates: FetchedRate[]): Promise<number> {
  if (!rates.length) return 0;
  return withUser(userId, async (db) => {
    for (const r of rates) {
      await db.query(
        `insert into fx_rates (base, quote, rate, rate_date, source, is_manual, fetched_at)
         values ('USD', 'BRL', $1, $2, $3, false, now())
         on conflict (user_id, base, quote, rate_date, source) do update set rate = excluded.rate, fetched_at = excluded.fetched_at`,
        [r.rate, r.rateDate, source],
      );
    }
    return rates.length;
  });
}

/** Fetches the latest USD→BRL rate (and 120 days of history the first time). */
export async function refreshRates(userId: string, today: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  lastAttempt.set(userId, Date.now());
  try {
    const hasHistory = await withUser(userId, async (db) =>
      (await db.query<{ n: string }>("select count(*)::text as n from fx_rates where not is_manual"))[0].n,
    );
    let count = 0;
    if (Number(hasHistory) < 5 && env.fxProvider === "frankfurter") {
      const hist = await fetchUsdBrl({ from: addDays(today, -120), to: today });
      count += await storeRates(userId, hist.source, hist.rates);
    }
    const latest = await fetchUsdBrl();
    count += await storeRates(userId, latest.source, latest.rates);
    return { ok: true, count };
  } catch (err) {
    const message = err instanceof Error && err.name === "AbortError" ? "Tempo esgotado ao consultar a cotação" : "Não foi possível atualizar a cotação agora";
    console.warn("[fx] refresh failed:", err instanceof Error ? err.message : "unknown");
    return { ok: false, error: `${message}. A última cotação conhecida continua em uso; você pode informar uma taxa manual.` };
  }
}

/** Refreshes in the background of a page load when the stored rate is stale. */
export async function refreshIfStale(userId: string, latestFetchedAt: string | null, today: string): Promise<boolean> {
  const last = lastAttempt.get(userId) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) return false;
  const fetched = latestFetchedAt ? Date.parse(latestFetchedAt.replace(" ", "T")) : 0;
  if (Number.isFinite(fetched) && Date.now() - fetched < STALE_MS) return false;
  const r = await refreshRates(userId, today);
  return r.ok;
}
