"use client";

import { Archive, ArchiveRestore, ArrowLeftRight, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { AccountForm, type AccountInitial } from "@/components/forms/entity-forms";
import { TransferForm } from "@/components/forms/transaction-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard } from "@/components/ui/primitives";
import type { Currency } from "@/lib/finance/types";
import { deleteTransaction } from "@/server/actions/transactions";
import { deleteAccount, setAccountArchived } from "@/server/actions/settings";
import type { TxRow } from "@/server/view";

interface AccountView {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  currency: Currency;
  balance: number;
  baseBalance: number;
  openingBalance: string;
  openingCents: number;
  openingDate: string;
  includeInAvailable: boolean;
  archived: boolean;
  movements: number;
}

export function AccountsClient({
  accounts,
  transfers,
  totals,
}: {
  accounts: AccountView[];
  transfers: TxRow[];
  totals: { total: number; spendable: number; missingFx: string[] };
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [editing, setEditing] = React.useState<AccountInitial | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [transfer, setTransfer] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AccountView | null>(null);
  const [delTransfer, setDelTransfer] = React.useState<TxRow | null>(null);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Disponível para o dia a dia"
          value={f.money(totals.spendable)}
          tone="pink"
          icon={<Landmark />}
          info={<InfoTip>Soma das contas marcadas como “dinheiro disponível”, convertida para {f.base}.</InfoTip>}
        />
        <StatCard label="Total em todas as contas" value={f.money(totals.total)} sub="Inclui poupança e investimentos" />
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nova conta
          </Button>
          <Button variant="outline" onClick={() => setTransfer(true)} disabled={active.length < 2}>
            <ArrowLeftRight /> Transferir entre contas
          </Button>
        </div>
      </div>
      {totals.missingFx.length > 0 && (
        <p className="mb-4 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          Sem cotação para {totals.missingFx.join(", ")}: os totais acima não incluem essas contas. Atualize em Configurações → Câmbio.
        </p>
      )}

      {!accounts.length ? (
        <EmptyState
          icon={<Landmark />}
          title="Nenhuma conta cadastrada"
          description="Cadastre sua conta corrente, poupança ou dinheiro em espécie com o saldo de hoje."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Cadastrar conta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((a) => (
            <AccountCard key={a.id} a={a} onEdit={() => setEditing(a)} onDelete={() => setDeleting(a)} onArchive={() => run(() => setAccountArchived({ id: a.id, archived: true }))} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Arquivadas</h3>
          <div className="grid gap-3 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
            {archived.map((a) => (
              <AccountCard
                key={a.id}
                a={a}
                onEdit={() => setEditing(a)}
                onDelete={() => setDeleting(a)}
                onArchive={() => run(() => setAccountArchived({ id: a.id, archived: false }))}
              />
            ))}
          </div>
        </>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Transferências entre contas</CardTitle>
        </CardHeader>
        <CardContent>
          {transfers.length ? (
            <ul className="divide-y divide-border">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="grid size-9 place-items-center rounded-xl bg-info-bg text-info">
                    <ArrowLeftRight className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {t.accountName} → {t.toAccountName}
                    </p>
                    <p className="text-xs text-muted">
                      {f.date(t.date)} · {t.description}
                    </p>
                  </div>
                  <span className="tabular font-semibold">{f.money(t.amount, t.currency)}</span>
                  <ActionMenu items={[{ label: "Excluir", icon: <Trash2 />, danger: true, onSelect: () => setDelTransfer(t) }]} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nenhuma transferência. Elas movem dinheiro entre suas contas sem contar como receita ou despesa.</p>
          )}
        </CardContent>
      </Card>

      <Modal open={creating} onOpenChange={setCreating} title="Nova conta">
        <AccountForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar conta">
        {editing && <AccountForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={transfer} onOpenChange={setTransfer} title="Transferir entre contas">
        <TransferForm onDone={() => setTransfer(false)} />
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir “${deleting?.name}”?`}
        description={
          deleting?.movements
            ? "Esta conta tem movimentações e não pode ser excluída. Arquive-a para escondê-la sem perder o histórico."
            : "A conta será removida permanentemente."
        }
        onConfirm={() => (deleting ? run(() => deleteAccount({ id: deleting.id })) : undefined)}
      />
      <ConfirmDialog
        open={!!delTransfer}
        onOpenChange={(o) => !o && setDelTransfer(null)}
        title="Excluir transferência?"
        description="Os saldos das duas contas voltarão ao valor anterior."
        onConfirm={() => (delTransfer ? run(() => deleteTransaction({ id: delTransfer.id })) : undefined)}
      />
    </>
  );
}

function AccountCard({ a, onEdit, onDelete, onArchive }: { a: AccountView; onEdit: () => void; onDelete: () => void; onArchive: () => void }) {
  const f = useFormat();
  return (
    <Card className="rise-in p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{a.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {a.typeLabel} · {a.currency}
            {!a.includeInAvailable && <Badge tone="plum">fora do disponível</Badge>}
          </p>
        </div>
        <ActionMenu
          items={[
            { label: "Editar", icon: <Pencil />, onSelect: onEdit },
            { label: a.archived ? "Desarquivar" : "Arquivar", icon: a.archived ? <ArchiveRestore /> : <Archive />, onSelect: onArchive },
            { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
      <p className={`tabular mt-4 text-2xl font-semibold ${a.balance < 0 ? "text-danger" : "text-ink"}`}>{f.money(a.balance, a.currency)}</p>
      {a.currency !== f.base && <p className="tabular text-xs text-muted">≈ {f.money(a.baseBalance)} pela cotação atual</p>}
      <p className="mt-3 text-xs text-muted">
        Saldo inicial {f.money(a.openingCents, a.currency)} em {f.date(a.openingDate)} · {a.movements} movimentação(ões)
      </p>
    </Card>
  );
}
