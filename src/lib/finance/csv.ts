import { isISODate } from "./dates";
import { toCents } from "./money";
import type { Cents, ISODate } from "./types";

/** RFC 4180-style CSV parser with auto-detected delimiter (, ; or tab). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t"].reduce(
    (best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best),
    ",",
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1;
}

/** Escapes a value for CSV and neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

/**
 * Parses a money string in either "1,234.56" or "1.234,56" style, with optional
 * currency symbols and parentheses/minus for negatives. Returns cents.
 */
export function parseMoney(input: string): Cents | null {
  let s = input.trim().replace(/\s|R\$|US\$|\$|USD|BRL/gi, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // The last separator is the decimal one: 1,234.56 or 1.234,56
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  try {
    const cents = toCents(s);
    return negative ? -cents : cents;
  } catch {
    return null;
  }
}

export type DateFormat = "ymd" | "dmy" | "mdy";

export function parseDateString(input: string, format: DateFormat): ISODate | null {
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10);
    return isISODate(iso) ? iso : null;
  }
  const m = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(s);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (format === "dmy") [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if (format === "mdy") [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 100) y += 2000;
  const iso = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isISODate(iso) ? iso : null;
}

/** Deterministic 64-bit FNV-1a hash (hex) used as a de-duplication key — not for security. */
export function dedupeHash(parts: Array<string | number | null | undefined>): string {
  const text = parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
