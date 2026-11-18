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
          label="Available for everyday use"
          value={f.money(totals.spendable)}
          tone="pink"
          icon={<Landmark />}
          info={<InfoTip>The total of accounts marked as “money I can spend”, converted to {f.base}.</InfoTip>}
        />
        <StatCard label="All accounts together" value={f.money(totals.total)} sub="Includes savings and investments" />
        <div className="flex flex-col justify-center gap-2 rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New account
          </Button>
          <Button variant="outline" onClick={() => setTransfer(true)} disabled={active.length < 2}>
            <ArrowLeftRight /> Move money between accounts
          </Button>
        </div>
      </div>
      {totals.missingFx.length > 0 && (
        <p className="mb-4 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning">
          No exchange rate for {totals.missingFx.join(", ")}: the totals above leave those accounts out. Update it in Settings → Exchange rate.
        </p>
      )}

      {!accounts.length ? (
        <EmptyState
          icon={<Landmark />}
          title="No accounts yet"
          description="Add your checking account, savings or cash with today's balance."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Add account
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
          <h3 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Archived</h3>
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
          <CardTitle>Transfers between accounts</CardTitle>
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
                  <ActionMenu items={[{ label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => setDelTransfer(t) }]} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No transfers yet. Transfers move money between your accounts without counting as income or expense.</p>
          )}
        </CardContent>
      </Card>

      <Modal open={creating} onOpenChange={setCreating} title="New account">
        <AccountForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit account">
        {editing && <AccountForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={transfer} onOpenChange={setTransfer} title="Move money between accounts">
        <TransferForm onDone={() => setTransfer(false)} />
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={
          deleting?.movements
            ? "This account has entries and cannot be deleted. Archive it to hide it without losing its history."
            : "The account will be removed permanently."
        }
        onConfirm={() => (deleting ? run(() => deleteAccount({ id: deleting.id })) : undefined)}
      />
      <ConfirmDialog
        open={!!delTransfer}
        onOpenChange={(o) => !o && setDelTransfer(null)}
        title="Delete this transfer?"
        description="Both account balances will go back to what they were before."
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
            {!a.includeInAvailable && <Badge tone="plum">not for spending</Badge>}
          </p>
        </div>
        <ActionMenu
          items={[
            { label: "Edit", icon: <Pencil />, onSelect: onEdit },
            { label: a.archived ? "Unarchive" : "Archive", icon: a.archived ? <ArchiveRestore /> : <Archive />, onSelect: onArchive },
            { label: "Delete", icon: <Trash2 />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
      <p className={`tabular mt-4 text-2xl font-semibold ${a.balance < 0 ? "text-danger" : "text-ink"}`}>{f.money(a.balance, a.currency)}</p>
      {a.currency !== f.base && <p className="tabular text-xs text-muted">≈ {f.money(a.baseBalance)} at today's rate</p>}
      <p className="mt-3 text-xs text-muted">
        Started with {f.money(a.openingCents, a.currency)} on {f.date(a.openingDate)} · {a.movements} entr{a.movements === 1 ? "y" : "ies"}
      </p>
    </Card>
  );
}
