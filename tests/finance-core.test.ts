import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, endOfMonth, isISODate, todayInTimeZone } from "@/lib/finance/dates";
import { FxConverter, MoneyContext } from "@/lib/finance/fx";
import { centsToDecimalString, monthlyInterest, mulCents, toCents } from "@/lib/finance/money";
import { monthlyEquivalent, nextOccurrenceOnOrAfter, occurrencesBetween } from "@/lib/finance/recurrence";
import { csvCell, dedupeHash, parseCsv, parseDateString, parseMoney, toCsv } from "@/lib/finance/csv";
import type { FxRate } from "@/lib/finance/types";

describe("money", () => {
  it("parses decimal strings to exact cents", () => {
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("0.1")).toBe(10);
    expect(toCents(0.1 + 0.2)).toBe(30); // float noise is rounded away
    expect(toCents("-15.005")).toBe(-1501); // half away from zero
    expect(toCents("5500")).toBe(550000);
  });
  it("formats back to numeric(14,2) strings", () => {
    expect(centsToDecimalString(123456)).toBe("1234.56");
    expect(centsToDecimalString(-5)).toBe("-0.05");
  });
  it("rounds rate multiplications once", () => {
    expect(mulCents(10000, "5.4321")).toBe(54321);
    expect(mulCents(333, "0.5")).toBe(167);
    expect(monthlyInterest(1200000, "6")).toBe(6000); // 12,000.00 × 6%/12 = 60.00
    expect(monthlyInterest(-100, "6")).toBe(0);
  });
});

describe("dates", () => {
  it("handles month ends and leap years", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-11-16", "2026-11-19")).toBe(3);
    expect(isISODate("2026-02-30")).toBe(false);
  });
  it("resolves today in the user's time zone", () => {
    const instant = new Date("2026-11-17T02:30:00Z");
    expect(todayInTimeZone("America/New_York", instant)).toBe("2026-11-16");
    expect(todayInTimeZone("America/Sao_Paulo", instant)).toBe("2026-11-16");
    expect(todayInTimeZone("Asia/Tokyo", instant)).toBe("2026-11-17");
  });
});

describe("recurrence", () => {
  it("generates monthly occurrences anchored on the 31st without drift", () => {
    const list = occurrencesBetween({ start: "2026-01-31", frequency: "monthly" }, "2026-01-01", "2026-05-31");
    expect(list).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
  });
  it("supports weekly, biweekly, semiannual and custom", () => {
    expect(occurrencesBetween({ start: "2026-11-02", frequency: "weekly" }, "2026-11-10", "2026-11-30")).toEqual([
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
    expect(occurrencesBetween({ start: "2026-11-02", frequency: "biweekly" }, "2026-11-01", "2026-12-01")).toEqual([
      "2026-11-02",
      "2026-11-16",
      "2026-11-30",
    ]);
    expect(occurrencesBetween({ start: "2026-02-15", frequency: "semiannual" }, "2026-01-01", "2027-12-31")).toEqual([
      "2026-02-15",
      "2026-08-15",
      "2027-02-15",
      "2027-08-15",
    ]);
    expect(
      occurrencesBetween({ start: "2026-11-01", frequency: "custom", interval: 10, unit: "day" }, "2026-11-01", "2026-11-25"),
    ).toEqual(["2026-11-01", "2026-11-11", "2026-11-21"]);
  });
  it("respects end dates and one-off rules", () => {
    expect(occurrencesBetween({ start: "2026-01-01", frequency: "monthly", end: "2026-03-15" }, "2026-01-01", "2026-12-31")).toHaveLength(3);
    expect(occurrencesBetween({ start: "2026-05-05", frequency: "once" }, "2026-01-01", "2026-12-31")).toEqual(["2026-05-05"]);
    expect(nextOccurrenceOnOrAfter({ start: "2026-01-10", frequency: "monthly" }, "2026-11-16")).toBe("2026-12-10");
  });
  it("normalises to monthly equivalents", () => {
    expect(monthlyEquivalent(120000, { frequency: "yearly" })).toBe(10000);
    expect(monthlyEquivalent(60000, { frequency: "semiannual" })).toBe(10000);
    expect(monthlyEquivalent(12000, { frequency: "weekly" })).toBe(52000);
    expect(monthlyEquivalent(50000, { frequency: "once" })).toBe(0);
  });
});

describe("fx", () => {
  const rates: FxRate[] = [
    { base: "USD", quote: "BRL", rate: "5.00000000", rateDate: "2026-11-01", source: "frankfurter", isManual: false, fetchedAt: "2026-11-01T10:00:00Z" },
    { base: "USD", quote: "BRL", rate: "5.50000000", rateDate: "2026-11-15", source: "frankfurter", isManual: false, fetchedAt: "2026-11-15T10:00:00Z" },
  ];
  it("converts explicitly with the latest or the dated rate", () => {
    const fx = new FxConverter(rates);
    expect(fx.convert(10000, "USD", "BRL")).toBe(55000);
    expect(fx.convert(10000, "USD", "BRL", "2026-11-10")).toBe(50000);
    expect(fx.convert(55000, "BRL", "USD")).toBe(10000); // inverse pair
  });
  it("lets a newer manual rate win and never invents a missing rate", () => {
    const manual: FxRate = { base: "USD", quote: "BRL", rate: "6", rateDate: "2026-11-16", source: "manual", isManual: true, fetchedAt: "2026-11-16T12:00:00Z" };
    expect(new FxConverter([...rates, manual]).latest("USD", "BRL")?.isManual).toBe(true);
    const ctx = new MoneyContext("USD", []);
    expect(ctx.toBase(10000, "BRL")).toBe(0);
    expect(ctx.hasMissing).toBe(true);
    expect(ctx.missingCurrencies).toEqual(["BRL"]);
  });
});

describe("csv", () => {
  it("parses quoted fields and detects ; delimiters", () => {
    expect(parseCsv('a,b\n"1,5","x ""y"""\n')).toEqual([["a", "b"], ["1,5", 'x "y"']]);
    expect(parseCsv("data;valor\n2026-01-01;10,50")).toEqual([["data", "valor"], ["2026-01-01", "10,50"]]);
  });
  it("parses US and BR money formats", () => {
    expect(parseMoney("1,234.56")).toBe(123456);
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("R$ 10,5")).toBe(1050);
    expect(parseMoney("$1,500")).toBe(150000);
    expect(parseMoney("(25.00)")).toBe(-2500);
    expect(parseMoney("abc")).toBeNull();
  });
  it("parses dates in the chosen format", () => {
    expect(parseDateString("16/11/2026", "dmy")).toBe("2026-11-16");
    expect(parseDateString("11/16/2026", "mdy")).toBe("2026-11-16");
    expect(parseDateString("2026-11-16", "dmy")).toBe("2026-11-16");
    expect(parseDateString("31/02/2026", "dmy")).toBeNull();
  });
  it("neutralises formula injection on export", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(toCsv(["a"], [["x,y"]])).toBe('a\r\n"x,y"\r\n');
  });
  it("produces stable de-duplication keys", () => {
    expect(dedupeHash(["2026-01-01", 100, " Coffee "])).toBe(dedupeHash(["2026-01-01", 100, "coffee"]));
    expect(dedupeHash(["2026-01-01", 100, "coffee"])).not.toBe(dedupeHash(["2026-01-02", 100, "coffee"]));
  });
});
