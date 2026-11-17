import { NextResponse, type NextRequest } from "next/server";
import { CATEGORY_LABELS, PAYMENT_METHOD_LABELS, TX_KIND_LABELS } from "@/lib/constants";
import { toCsv } from "@/lib/finance/csv";
import { isISODate } from "@/lib/finance/dates";
import { debtHistory } from "@/lib/finance/debt";
import { centsToDecimalString } from "@/lib/finance/money";
import { getCurrentUser } from "@/server/auth/session";
import { withUser } from "@/server/db";
import { exportBackup } from "@/server/services/backup";
import { loadSnapshotWith } from "@/server/services/snapshot";

export const dynamic = "force-dynamic";

const TYPES = ["transactions", "bills", "incomes", "debt", "goals", "subscriptions", "backup"] as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type") as (typeof TYPES)[number] | null;
  if (!type || !TYPES.includes(type)) return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if ((from && !isISODate(from)) || (to && !isISODate(to))) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = (name: string, mime: string) => ({
    "Content-Type": mime,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store",
  });

  if (type === "backup") {
    const data = await withUser(user.id, exportBackup);
    return new NextResponse(JSON.stringify(data, null, 2), { headers: headers(`isabelle-wallet-backup-${stamp}.json`, "application/json; charset=utf-8") });
  }

  const s = await withUser(user.id, loadSnapshotWith);
  const accounts = new Map(s.accounts.map((a) => [a.id, a.name]));
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const money = (c: number | null) => (c === null ? "" : centsToDecimalString(c));
  let csv: string;
  switch (type) {
    case "transactions":
      csv = toCsv(
        ["data", "tipo", "status", "descricao", "categoria", "valor", "moeda", "conta", "valor_na_conta", "conta_destino", "valor_destino", "forma_pagamento", "recorrencia", "observacoes"],
        s.transactions
          .filter((t) => inRange(t.date))
          .map((t) => [
            t.date,
            TX_KIND_LABELS[t.kind],
            t.status === "paid" ? "pago" : "pendente",
            t.description,
            t.category ? (CATEGORY_LABELS[t.category] ?? t.category) : "",
            money(t.amount),
            t.currency,
            t.accountId ? (accounts.get(t.accountId) ?? "") : "",
            money(t.accountAmount),
            t.toAccountId ? (accounts.get(t.toAccountId) ?? "") : "",
            money(t.toAmount),
            t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : "",
            t.recurrence,
            t.notes ?? "",
          ]),
      );
      break;
    case "bills": {
      const bills = new Map(s.bills.map((b) => [b.id, b]));
      csv = toCsv(
        ["conta", "vencimento", "valor_devido", "pago", "moeda", "prioridade", "categoria", "dispensada"],
        s.occurrences
          .filter((o) => inRange(o.dueDate))
          .map((o) => {
            const b = bills.get(o.billId)!;
            const paid = s.billPayments.filter((p) => p.occurrenceId === o.id).reduce((x, p) => x + p.amount, 0);
            return [b.name, o.dueDate, money(o.amountDue), money(paid), b.currency, b.priority, CATEGORY_LABELS[b.category] ?? b.category, o.waived ? "sim" : "não"];
          }),
      );
      break;
    }
    case "incomes":
      csv = toCsv(
        ["nome", "valor", "moeda", "categoria", "inicio", "frequencia", "fim", "ativa"],
        s.incomes.map((i) => [i.name, money(i.amount), i.currency, CATEGORY_LABELS[i.category] ?? i.category, i.startDate, i.frequency, i.endDate ?? "", i.active ? "sim" : "não"]),
      );
      break;
    case "debt":
      csv = toCsv(
        ["divida", "data", "tipo", "valor", "saldo_anterior", "saldo_apos", "automatico", "anulado", "observacao"],
        s.debts.flatMap((d) =>
          debtHistory(d, s.debtEvents)
            .filter((r) => inRange(r.date))
            .map((r) => [d.name, r.date, r.type, money(r.delta), money(r.balanceBefore), money(r.balanceAfter), r.automatic ? "sim" : "não", r.voided ? "sim" : "não", r.note ?? ""]),
        ),
      );
      break;
    case "goals":
      csv = toCsv(
        ["meta", "data", "valor", "observacao"],
        s.contributions.filter((c) => inRange(c.date)).map((c) => [s.goals.find((g) => g.id === c.goalId)?.name ?? "", c.date, money(c.amount), c.note ?? ""]),
      );
      break;
    case "subscriptions":
      csv = toCsv(
        ["nome", "valor", "moeda", "ciclo", "proxima_cobranca", "status", "ultimo_uso"],
        s.subscriptions.map((x) => [x.name, money(x.amount), x.currency, x.billingCycle, x.nextChargeDate, x.status, x.lastUsedOn ?? ""]),
      );
      break;
  }
  return new NextResponse("﻿" + csv, { headers: headers(`isabelle-wallet-${type}-${stamp}.csv`, "text/csv; charset=utf-8") });
}
