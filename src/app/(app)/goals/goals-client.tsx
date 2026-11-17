"use client";

import { Archive, ArchiveRestore, CheckCircle2, Lightbulb, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { useFormat, useServerAction } from "@/components/app-context";
import { ContributionForm, GoalForm, type GoalInitial } from "@/components/forms/entity-forms";
import { Button } from "@/components/ui/button";
import { ActionMenu, ConfirmDialog, InfoTip, Modal } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ProgressBar, StatCard } from "@/components/ui/primitives";
import type { Currency } from "@/lib/finance/types";
import { monthsToText } from "@/lib/format";
import { deleteContribution, deleteGoal, setGoalArchived } from "@/server/actions/goals";

export interface GoalView {
  id: string;
  name: string;
  kindLabel: string;
  priority: string;
  priorityLabel: string;
  currency: Currency;
  target: number;
  saved: number;
  remaining: number;
  percent: number;
  completed: boolean;
  monthly: number;
  monthsToTarget: number | null;
  estimatedDate: string | null;
  requiredMonthly: number | null;
  deadline: string | null;
  onTrack: boolean | null;
  contributedThisMonth: number;
  archived: boolean;
  recommended: number | null;
  contributions: Array<{ id: string; date: string; amount: number; note: string | null }>;
  initial: GoalInitial;
}

export function GoalsClient({
  goals,
  totalSaved,
  capacity,
  plannedGoals,
  assumptions,
  missing,
  emergencyMonths,
}: {
  goals: GoalView[];
  totalSaved: number;
  capacity: number | null;
  plannedGoals: number;
  assumptions: string[];
  missing: string[];
  emergencyMonths: number | null;
}) {
  const f = useFormat();
  const { run } = useServerAction();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<GoalInitial | null>(null);
  const [contributing, setContributing] = React.useState<GoalView | null>(null);
  const [deleting, setDeleting] = React.useState<GoalView | null>(null);
  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Economia acumulada" value={f.money(totalSaved)} icon={<PiggyBank />} tone="pink" />
        <StatCard label="Contribuição mensal planejada" value={f.money(plannedGoals)} />
        <StatCard
          label="Posso guardar por mês"
          value={capacity === null ? "—" : f.money(capacity)}
          tone="success"
          info={<InfoTip>Sobra mensal estimada (renda recorrente − obrigações recorrentes − gastos variáveis médios) menos o pagamento planejado da dívida.</InfoTip>}
          sub={capacity === null ? "Cadastre receitas recorrentes para calcular" : "Sem prejudicar as contas"}
        />
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border-strong p-4">
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nova meta
          </Button>
        </div>
      </div>

      {capacity !== null && active.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-pink-500" /> Quanto guardar em cada meta
              </CardTitle>
              <CardDescription>Divisão da sua capacidade de poupança por prioridade (alta 3 : média 2 : baixa 1), respeitando o que cada meta ainda precisa.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((g) => (
                <li key={g.id} className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
                  <span className="truncate">{g.name}</span>
                  <span className="tabular font-semibold">{g.recommended ? `${f.money(g.recommended)}/mês` : g.completed ? "concluída" : "—"}</span>
                </li>
              ))}
            </ul>
            {emergencyMonths !== null && <p className="mt-3 text-xs text-muted">Sua reserva de emergência cobre {emergencyMonths.toFixed(1)} mês(es) de despesas essenciais.</p>}
            {(assumptions.length > 0 || missing.length > 0) && (
              <p className="mt-2 text-xs text-muted">
                {assumptions.join(" ")} {missing.length ? `Dados faltando: ${missing.join(", ")}.` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!active.length ? (
        <EmptyState
          icon={<PiggyBank />}
          title="Nenhuma meta ainda"
          description="Crie sua reserva de emergência, uma viagem, eletrônicos ou a reserva para a faculdade."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus /> Criar meta
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} g={g} onContribute={() => setContributing(g)} onEdit={() => setEditing(g.initial)} onDelete={() => setDeleting(g)} />
          ))}
        </div>
      )}
      {archived.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Arquivadas</h3>
          <div className="grid gap-3 opacity-80 md:grid-cols-2">
            {archived.map((g) => (
              <GoalCard key={g.id} g={g} onContribute={() => setContributing(g)} onEdit={() => setEditing(g.initial)} onDelete={() => setDeleting(g)} />
            ))}
          </div>
        </>
      )}

      <Modal open={creating} onOpenChange={setCreating} title="Nova meta">
        <GoalForm onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Editar meta">
        {editing && <GoalForm initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!contributing} onOpenChange={(o) => !o && setContributing(null)} title={`Contribuir para “${contributing?.name ?? ""}”`}>
        {contributing && <ContributionForm goalId={contributing.id} currency={contributing.currency} onDone={() => setContributing(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir “${deleting?.name}”?`}
        description="A meta e o histórico de contribuições serão apagados. Para guardar o histórico, prefira arquivar."
        onConfirm={() => (deleting ? run(() => deleteGoal({ id: deleting.id })) : undefined)}
      />
    </>
  );

  function GoalCard({ g, onContribute, onEdit, onDelete }: { g: GoalView; onContribute: () => void; onEdit: () => void; onDelete: () => void }) {
    return (
      <Card className="rise-in p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{g.name}</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone="pink">{g.kindLabel}</Badge>
              <Badge>Prioridade {g.priorityLabel.toLowerCase()}</Badge>
              {g.completed && (
                <Badge tone="success">
                  <CheckCircle2 className="size-3" /> Concluída
                </Badge>
              )}
              {g.onTrack === false && <Badge tone="warning">Abaixo do necessário</Badge>}
              {g.onTrack === true && !g.completed && <Badge tone="success">No prazo</Badge>}
            </p>
          </div>
          <ActionMenu
            items={[
              { label: "Editar", icon: <Pencil />, onSelect: onEdit },
              { label: g.archived ? "Desarquivar" : "Arquivar", icon: g.archived ? <ArchiveRestore /> : <Archive />, onSelect: () => run(() => setGoalArchived({ id: g.id, archived: !g.archived })) },
              { label: "Excluir", icon: <Trash2 />, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <p className="tabular text-xl font-semibold">{f.money(g.saved, g.currency)}</p>
          <p className="tabular text-sm text-muted">de {f.money(g.target, g.currency)}</p>
        </div>
        <ProgressBar className="mt-2" value={g.percent} tone={g.completed ? "success" : "pink"} label={`${g.name}: ${g.percent}%`} />
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <Info label="Faltam" value={f.money(g.remaining, g.currency)} />
          <Info label="Contribuição planejada" value={g.monthly ? `${f.money(g.monthly, g.currency)}/mês` : "não definida"} />
          <Info
            label="Estimativa de conclusão"
            value={g.completed ? "Concluída" : g.estimatedDate ? `${f.date(g.estimatedDate)} (${monthsToText(g.monthsToTarget)})` : "Defina uma contribuição mensal"}
          />
          <Info
            label={g.deadline ? `Para chegar até ${f.date(g.deadline)}` : "Data limite"}
            value={g.deadline ? (g.requiredMonthly !== null ? `${f.money(g.requiredMonthly, g.currency)}/mês` : "—") : "sem data limite"}
          />
        </div>
        {g.contributions.length > 0 && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-muted">Últimas contribuições</summary>
            <ul className="mt-1.5 space-y-1">
              {g.contributions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>
                    {f.date(c.date, "short")} {c.note ? `· ${c.note}` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`tabular ${c.amount < 0 ? "text-danger" : ""}`}>{f.money(c.amount, g.currency, { signed: true })}</span>
                    <button type="button" aria-label="Remover contribuição" className="text-muted hover:text-danger" onClick={() => run(() => deleteContribution({ id: c.id }))}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <Button className="mt-4 w-full" variant="secondary" onClick={onContribute}>
          <Plus /> Registrar contribuição
        </Button>
      </Card>
    );
  }
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2">
      <p className="text-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}
