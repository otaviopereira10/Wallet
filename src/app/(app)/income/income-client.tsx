"use client";

import { ArrowDownLeft, CalendarCheck, CheckCircle2, Pause, Pencil, Play, Plus, Search, Trash2, XCircle } from "lucide-react";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { IncomeSourceForm, ReceiveIncomeForm, type IncomeSourceInitial } from "@/components/forms/entity-forms";
import { IncomeTxForm, type IncomeTxInitial } from "@/components/forms/transaction-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal, TabPanel, Tabs } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input, StatCard } from "@/components/ui/primitives";
import { categoryLabel } from "@/lib/constants";
import type { Currency } from "@/lib/finance/types";
import { deleteIncome, setIncomeActive, skipIncomeOccurrence } from "@/server/actions/incomes";
import { deleteTransaction } from "@/server/actions/transactions";
import type { TxRow } from "@/server/view";

interface SourceView extends Omit<IncomeSourceInitial, "amount"> {
  id: string;
  name: string;
  amount: number;
  amountInput: string;
  currency: Currency;
  categoryLabel: string;
  frequencyLabel: string;
  startDate: string;
  active: boolean;
  next: string | null;
  monthly: number;
  received: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function IncomeClient({
  sources,
  pendingConfirm,
  projection,
  upcoming,
  receipts,
  initialQuery,
  monthIncome,
  monthlyExpected,
}: {
  sources: SourceView[];
  pendingConfirm: Array<{ incomeId: string; name: string; date: string; amount: number; amountInput: string; currency: Currency; accountId: string | null }>;
  projection: Array<{ month: string; label: string; inflow: number; outflow: number; net: number; balance: number }>;
  upcoming: Array<{ id: string; label: string; date: string; amount: number }>;
  receipts: TxRow[];
  initialQuery: string;
  monthIncome: number;
  monthlyExpected: number | null;
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [creating, setCreating] = React.useState(false);
  const [oneOff, setOneOff] = React.useState(false);
  const [editing, setEditing] = React.useState<IncomeSourceInitial | null>(null);
  const [editingTx, setEditingTx] = React.useState<IncomeTxInitial | null>(null);
  const [receiving, setReceiving] = React.useState<(typeof pendingConfirm)[number] | null>(null);
  const [deleting, setDeleting] = React.useState<SourceView | null>(null);
  const [deletingTx, setDeletingTx] = React.useState<TxRow | null>(null);
  const [query, setQuery] = React.useState(initialQuery);
  const filtered = receipts.filter((r) => !query || norm(`${r.description} ${categoryLabel(r.category)}`).includes(norm(query)));

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Recebido neste mês" value={f.money(monthIncome)} tone="success" icon={<ArrowDownLeft />} />
        <StatCard
          label="Renda mensal recorrente"
          value={monthlyExpected === null ? "—" : f.money(monthlyExpected)}
          sub="Média mensal das fontes recorrentes ativas"
          info={<InfoTip>Semanal × 52/12, quinzenal × 26/12, semestral ÷ 6, anual ÷ 12. Receitas únicas não entram.</InfoTip>}
        />
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nova fonte de renda
          </Button>
          <Button variant="outline" onClick={() => setOneOff(true)}>
            <CheckCircle2 /> Registrar valor recebido
          </Button>
        </div>
      </div>

      {pendingConfirm.length > 0 && (
        <Card className="mb-6 border-info/40">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarCheck className="size-4 text-info" /> Aguardando confirmação
              </CardTitle>
              <CardDescription>Recebimentos previstos que já passaram. Eles só entram no saldo depois de confirmados.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {pendingConfirm.map((p) => (
                <li key={`${p.incomeId}-${p.date}`} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted">Previsto para {f.date(p.date)}</p>
                  </div>
                  <span className="tabular font-semibold">{f.money(p.amount, p.currency)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setReceiving(p)}>
                      Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => skipIncomeOccurrence({ incomeId: p.incomeId, occurrence: p.date }))}>
                      Não recebi
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Tabs
        defaultValue="sources"
        tabs={[
          { value: "sources", label: "Fontes de renda", count: sources.length },
          { value: "projection", label: "Projeção" },
          { value: "history", label: "Recebimentos", count: receipts.length },
        ]}
      >
        <TabPanel value="sources">
          {!sources.length ? (
            <EmptyState
              icon={<ArrowDownLeft />}
              title="Nenhuma fonte de renda"
              description="Cadastre sua bolsa, salário, trabalhos extras ou ajuda familiar — com a frequência certa."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Cadastrar receita
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sources.map((s) => (
                <Card key={s.id} className={`p-5 ${s.active ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                        <Badge tone="success">{s.categoryLabel}</Badge>
                        <Badge>{s.frequencyLabel}</Badge>
                        {!s.active && <Badge tone="warning">Pausada</Badge>}
                      </p>
                    </div>
                    <ActionMenu
                      items={[
                        { label: "Editar", icon: <Pencil />, onSelect: () => setEditing({ ...s, amount: s.amountInput }) },
                        {
                          label: s.active ? "Pausar" : "Reativar",
                          icon: s.active ? <Pause /> : <Play />,
                          onSelect: () => run(() => setIncomeActive({ id: s.id, active: !s.active })),
                        },
                        { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: () => setDeleting(s) },
                      ]}
                    />
                  </div>
                  <p className="tabular mt-3 text-xl font-semibold">{f.money(s.amount, s.currency)}</p>
                  <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
                    <span>{s.next ? `Próximo: ${f.date(s.next)}` : "Sem próximos recebimentos"}</span>
                    {s.monthly > 0 && <span>≈ {f.money(s.monthly)}/mês</span>}
                    <span>{s.received} recebimento(s) confirmados</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabPanel>

        <TabPanel value="projection">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Dinheiro previsto nos próximos meses</CardTitle>
                <CardDescription>
                  Parte do saldo disponível de hoje e soma receitas recorrentes previstas, menos contas, assinaturas, despesas recorrentes e pagamentos
                  planejados. Gastos variáveis do dia a dia não estão incluídos.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">Mês</th>
                    <th className="pb-2 text-right font-medium">Receitas previstas</th>
                    <th className="pb-2 text-right font-medium">Saídas programadas</th>
                    <th className="pb-2 text-right font-medium">Resultado</th>
                    <th className="pb-2 text-right font-medium">Saldo projetado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projection.map((p) => (
                    <tr key={p.month}>
                      <td className="py-2.5 first-letter:uppercase">{p.label}</td>
                      <td className="tabular py-2.5 text-right text-success">{f.money(p.inflow)}</td>
                      <td className="tabular py-2.5 text-right">{f.money(p.outflow)}</td>
                      <td className={`tabular py-2.5 text-right font-medium ${p.net < 0 ? "text-danger" : ""}`}>{f.money(p.net, undefined, { signed: true })}</td>
                      <td className={`tabular py-2.5 text-right font-semibold ${p.balance < 0 ? "text-danger" : ""}`}>{f.money(p.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted">Projeção, não garantia: depende de as receitas caírem nas datas previstas.</p>
            </CardContent>
          </Card>
          {upcoming.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Próximos recebimentos previstos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {upcoming.map((u) => (
                    <li key={u.id} className="flex justify-between py-2 text-sm">
                      <span>
                        {f.date(u.date)} · {u.label}
                      </span>
                      <span className="tabular font-medium text-success">{f.money(u.amount)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabPanel>

        <TabPanel value="history">
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-10" placeholder="Pesquisar recebimentos…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Pesquisar recebimentos" />
          </div>
          {filtered.length ? (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {filtered.slice(0, 200).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.description}</p>
                      <p className="text-xs text-muted">
                        {f.date(r.date)} · {categoryLabel(r.category)} · {r.accountName}
                      </p>
                    </div>
                    <span className="tabular text-sm font-semibold text-success">+{f.money(r.amount, r.currency)}</span>
                    <ActionMenu
                      items={[
                        r.source !== "income" && {
                          label: "Editar",
                          icon: <Pencil />,
                          onSelect: () =>
                            setEditingTx({ id: r.id, description: r.description, amount: r.amountInput, currency: r.currency, category: r.category ?? "other_income", date: r.date, accountId: r.accountId, notes: r.notes }),
                        },
                        { label: r.source === "income" ? "Desfazer confirmação" : "Excluir", icon: r.source === "income" ? <XCircle /> : <Trash2 />, danger: true, onSelect: () => setDeletingTx(r) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <p className="text-sm text-muted">Nenhum recebimento registrado.</p>
          )}
        </TabPanel>
      </Tabs>

      <Modal open={creating} onOpenChange={setCreating} title="Nova fonte de renda">
        <IncomeSourceForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={oneOff} onOpenChange={setOneOff} title="Registrar valor recebido">
        <IncomeTxForm onDone={() => setOneOff(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar fonte de renda">
        {editing && <IncomeSourceForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!editingTx} onOpenChange={(o) => !o && setEditingTx(null)} title="Editar recebimento">
        {editingTx && <IncomeTxForm initial={editingTx} onDone={() => setEditingTx(null)} />}
      </Modal>
      <Modal open={!!receiving} onOpenChange={(o) => !o && setReceiving(null)} title={`Confirmar: ${receiving?.name ?? ""}`} description={receiving ? `Previsto para ${f.date(receiving.date)}` : undefined}>
        {receiving && (
          <ReceiveIncomeForm
            incomeId={receiving.incomeId}
            occurrence={receiving.date}
            amount={receiving.amountInput}
            currency={receiving.currency}
            accountId={receiving.accountId}
            onDone={() => setReceiving(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir “${deleting?.name}”?`}
        description="A fonte de renda deixa de aparecer nas projeções. Os recebimentos já confirmados continuam no histórico e no saldo."
        onConfirm={() => (deleting ? run(() => deleteIncome({ id: deleting.id })) : undefined)}
      />
      <ConfirmDialog
        open={!!deletingTx}
        onOpenChange={(o) => !o && setDeletingTx(null)}
        title={deletingTx?.source === "income" ? "Desfazer confirmação?" : "Excluir recebimento?"}
        description="O valor sairá do saldo real da conta."
        onConfirm={() => (deletingTx ? run(() => deleteTransaction({ id: deletingTx.id })) : undefined)}
      />
    </>
  );
}
