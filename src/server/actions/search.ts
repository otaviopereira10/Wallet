"use server";

import { z } from "zod";
import { categoryLabel } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";
import { requireUserForAction } from "../auth/session";
import { loadSnapshot } from "../services/snapshot";

export interface SearchHit {
  id: string;
  group: string;
  title: string;
  subtitle: string;
  href: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function globalSearch(raw: unknown): Promise<SearchHit[]> {
  const parsed = z.string().trim().min(2).max(80).safeParse(raw);
  if (!parsed.success) return [];
  const user = await requireUserForAction();
  const s = await loadSnapshot(user.id);
  const q = norm(parsed.data);
  const has = (...fields: Array<string | null | undefined>) => fields.some((f) => f && norm(f).includes(q));
  const loc = s.profile.locale;
  const hits: SearchHit[] = [];
  for (const t of s.transactions) {
    if (hits.length >= 25) break;
    if (has(t.description, t.notes, categoryLabel(t.category))) {
      hits.push({
        id: t.id,
        group: "Movimentações",
        title: t.description,
        subtitle: `${formatDate(t.date, loc)} · ${formatMoney(t.amount, t.currency, loc)} · ${categoryLabel(t.category)}`,
        href: t.kind === "income" ? `/income?q=${encodeURIComponent(t.description)}` : `/expenses?q=${encodeURIComponent(t.description)}`,
      });
    }
  }
  for (const b of s.bills) if (has(b.name, b.notes)) hits.push({ id: b.id, group: "Contas", title: b.name, subtitle: formatMoney(b.amount, b.currency, loc), href: "/bills" });
  for (const i of s.incomes) if (has(i.name, i.notes)) hits.push({ id: i.id, group: "Receitas", title: i.name, subtitle: formatMoney(i.amount, i.currency, loc), href: "/income" });
  for (const sub of s.subscriptions) if (has(sub.name, sub.notes)) hits.push({ id: sub.id, group: "Assinaturas", title: sub.name, subtitle: formatMoney(sub.amount, sub.currency, loc), href: "/subscriptions" });
  for (const g of s.goals) if (has(g.name, g.notes)) hits.push({ id: g.id, group: "Metas", title: g.name, subtitle: formatMoney(g.targetAmount, g.currency, loc), href: "/goals" });
  for (const d of s.debts) if (has(d.name, d.notes)) hits.push({ id: d.id, group: "Dívidas", title: d.name, subtitle: "University Debt Manager", href: "/debt" });
  for (const a of s.accounts) if (has(a.name)) hits.push({ id: a.id, group: "Contas bancárias", title: a.name, subtitle: a.currency, href: "/accounts" });
  return hits.slice(0, 40);
}
