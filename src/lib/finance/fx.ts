import { Dec as D, mulCents } from "./money";
import type { Cents, Currency, FxRate, ISODate } from "./types";

export interface ResolvedRate {
  /** Units of `to` per 1 unit of `from`. */
  rate: string;
  rateDate: ISODate;
  source: string;
  isManual: boolean;
  fetchedAt: string;
  inverted: boolean;
}

/**
 * Converts between currencies using only rates that exist in the database
 * (fetched from the configured provider or typed manually). It never invents a
 * rate: when none is available the conversion returns null and the caller must
 * flag the missing data.
 */
export class FxConverter {
  private readonly rates: FxRate[];

  constructor(rates: FxRate[]) {
    // Newest first: by rate date, then by when it was fetched/entered.
    this.rates = [...rates].sort((a, b) =>
      a.rateDate === b.rateDate ? (a.fetchedAt < b.fetchedAt ? 1 : -1) : a.rateDate < b.rateDate ? 1 : -1,
    );
  }

  /** Most recently updated rate for a pair (manual or fetched, whichever is newer). */
  latest(from: Currency, to: Currency): ResolvedRate | null {
    if (from === to) return identity();
    let best: { r: FxRate; inverted: boolean } | null = null;
    for (const r of this.rates) {
      const direct = r.base === from && r.quote === to;
      const inverse = r.base === to && r.quote === from;
      if (!direct && !inverse) continue;
      if (!best || r.fetchedAt > best.r.fetchedAt) best = { r, inverted: inverse };
    }
    return best ? resolve(best.r, best.inverted) : null;
  }

  /** Rate effective on a date: latest rate dated on/before it, else the closest after it. */
  onDate(from: Currency, to: Currency, date: ISODate): ResolvedRate | null {
    if (from === to) return identity();
    let before: { r: FxRate; inverted: boolean } | null = null;
    let after: { r: FxRate; inverted: boolean } | null = null;
    for (const r of this.rates) {
      const direct = r.base === from && r.quote === to;
      const inverse = r.base === to && r.quote === from;
      if (!direct && !inverse) continue;
      if (r.rateDate <= date) {
        if (!before || r.rateDate > before.r.rateDate || (r.rateDate === before.r.rateDate && r.fetchedAt > before.r.fetchedAt))
          before = { r, inverted: inverse };
      } else if (!after || r.rateDate < after.r.rateDate) {
        after = { r, inverted: inverse };
      }
    }
    const pick = before ?? after;
    return pick ? resolve(pick.r, pick.inverted) : null;
  }

  convert(cents: Cents, from: Currency, to: Currency, date?: ISODate): Cents | null {
    if (from === to) return cents;
    const rate = date ? this.onDate(from, to, date) : this.latest(from, to);
    if (!rate) return null;
    return mulCents(cents, rate.rate);
  }

  hasPair(a: Currency, b: Currency): boolean {
    return a === b || this.latest(a, b) !== null;
  }
}

function identity(): ResolvedRate {
  return { rate: "1", rateDate: "1970-01-01", source: "identity", isManual: false, fetchedAt: "", inverted: false };
}

function resolve(r: FxRate, inverted: boolean): ResolvedRate {
  const rate = inverted ? new D(1).div(r.rate).toSignificantDigits(12).toString() : new D(r.rate).toString();
  return { rate, rateDate: r.rateDate, source: r.source, isManual: r.isManual, fetchedAt: r.fetchedAt, inverted };
}

/**
 * Converts amounts to the base currency and remembers which conversions were
 * impossible, so every total can say whether it is complete.
 */
export class MoneyContext {
  readonly base: Currency;
  readonly fx: FxConverter;
  private missing = new Set<Currency>();

  constructor(base: Currency, rates: FxRate[]) {
    this.base = base;
    this.fx = new FxConverter(rates);
  }

  /** Converts to base currency (latest rate, or rate on `date` if given). Missing rate → 0 and flagged. */
  toBase(cents: Cents, currency: Currency, date?: ISODate): Cents {
    if (currency === this.base) return cents;
    const v = this.fx.convert(cents, currency, this.base, date);
    if (v === null) {
      this.missing.add(currency);
      return 0;
    }
    return v;
  }

  fromBase(cents: Cents, currency: Currency): Cents | null {
    return this.fx.convert(cents, this.base, currency);
  }

  get missingCurrencies(): Currency[] {
    return [...this.missing];
  }

  get hasMissing(): boolean {
    return this.missing.size > 0;
  }
}
