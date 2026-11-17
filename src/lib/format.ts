import type { Cents, Currency, ISODate } from "./finance/types";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  cents: Cents | null | undefined,
  currency: Currency,
  locale: string = "pt-BR",
  opts: { signed?: boolean; compact?: boolean } = {},
): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  const key = `${locale}|${currency}|${opts.compact ? "c" : ""}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(opts.compact ? { notation: "compact", maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    });
    moneyFormatters.set(key, fmt);
  }
  const text = fmt.format(cents / 100);
  if (opts.signed && cents > 0) return `+${text}`;
  return text;
}

export function formatNumber(value: number, locale = "pt-BR", digits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null | undefined, locale = "pt-BR", digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)}%`;
}

/** Formats an ISO calendar date without any time-zone shift. */
export function formatDate(iso: ISODate | null | undefined, locale = "pt-BR", style: "short" | "medium" | "long" = "medium"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "2-digit", month: "2-digit", timeZone: "UTC" }
      : style === "medium"
        ? { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }
        : { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatMonth(key: string, locale = "pt-BR", style: "short" | "long" = "short"): string {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: style === "short" ? "short" : "long",
    year: style === "short" ? "2-digit" : "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(iso: string | null | undefined, locale = "pt-BR", timeZone?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
}

export function relativeDays(days: number): string {
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days === -1) return "ontem";
  if (days > 1) return `em ${days} dias`;
  return `há ${-days} dias`;
}

export function monthsToText(months: number | null): string {
  if (months === null) return "—";
  if (months <= 0) return "menos de 1 mês";
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} ano${y > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} ${m > 1 ? "meses" : "mês"}`);
  return parts.join(" e ");
}

/** Converts a cents value to an input string in "1234.56" format. */
export function centsToInput(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
