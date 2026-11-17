"use client";

import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useServerAction } from "@/components/app-context";
import { Wordmark } from "@/components/brand";
import { AccountForm, BillForm, DebtForm, GoalForm, IncomeSourceForm, SubscriptionForm } from "@/components/forms/entity-forms";
import { ProfileForm, type ProfileValues } from "@/components/forms/profile-form";
import { ExpenseForm } from "@/components/forms/transaction-forms";
import { Button } from "@/components/ui/button";
import { Card, ProgressBar } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { completeOnboarding } from "@/server/actions/settings";

interface Created {
  accounts: string[];
  incomes: string[];
  recurring: string[];
  bills: string[];
  debts: string[];
  goals: string[];
}

const STEPS = [
  { key: "profile", title: "Suas preferências", text: "Moeda principal, fuso horário e a reserva mínima que você quer manter." },
  { key: "accounts", title: "Contas e saldo inicial", text: "Cadastre onde seu dinheiro está hoje e quanto há em cada conta." },
  { key: "incomes", title: "Receitas", text: "Bolsa, salário, ajuda familiar… Recorrentes entram nas projeções futuras." },
  { key: "recurring", title: "Despesas recorrentes", text: "Assinaturas e gastos que se repetem, como academia ou streaming." },
  { key: "bills", title: "Contas a pagar", text: "Aluguel, telefone, internet — com vencimento e prioridade." },
  { key: "debt", title: "Dívida universitária", text: "Saldo atual e o acréscimo de 5.500 por semestre (você pode ajustar)." },
  { key: "goals", title: "Objetivos financeiros", text: "Reserva de emergência, viagem, faculdade…" },
] as const;

export function OnboardingWizard({ profile, created }: { profile: ProfileValues; created: Created }) {
  const [step, setStep] = React.useState(0);
  const [recurringMode, setRecurringMode] = React.useState<"subscription" | "expense">("subscription");
  const [formKey, setFormKey] = React.useState(0);
  const router = useRouter();
  const { pending, run } = useServerAction();
  const current = STEPS[step];
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const resetForm = () => setFormKey((k) => k + 1);
  const finish = () => run(() => completeOnboarding({ done: true }), { success: "Tudo pronto! Bem-vinda à sua Isabelle Wallet.", onSuccess: () => router.push("/dashboard") });

  const list = (items: string[], empty: string) =>
    items.length ? (
      <div className="mb-5 flex flex-wrap gap-2">
        {items.map((n, i) => (
          <span key={`${n}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-medium text-success">
            <CheckCircle2 className="size-3.5" /> {n}
          </span>
        ))}
      </div>
    ) : (
      <p className="mb-5 text-xs text-muted">{empty}</p>
    );

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <Wordmark />
        <button type="button" onClick={finish} className="text-sm font-medium text-muted hover:text-ink" disabled={pending}>
          Pular e configurar depois
        </button>
      </div>
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted">
          <span>
            Passo {step + 1} de {STEPS.length}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <ProgressBar value={((step + 1) / STEPS.length) * 100} label="Progresso da configuração" />
        <ol className="mt-4 hidden gap-1 sm:flex">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "w-full truncate rounded-lg px-2 py-1 text-[11px] font-medium transition",
                  i === step ? "bg-pink-50 text-pink-600" : i < step ? "text-ink" : "text-muted",
                )}
              >
                {i < step && <Check className="mr-1 inline size-3" />}
                {s.title}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <Card className="rise-in p-5 sm:p-8" key={current.key}>
        <h1 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">{current.title}</h1>
        <p className="mb-6 mt-1.5 text-sm text-muted">{current.text}</p>

        {current.key === "profile" && <ProfileForm initial={profile} compact detectTimezone submitLabel="Salvar e continuar" onDone={next} />}

        {current.key === "accounts" && (
          <>
            {list(created.accounts, "Nenhuma conta ainda. Comece pela conta que você mais usa.")}
            <AccountForm key={formKey} onDone={resetForm} />
          </>
        )}

        {current.key === "incomes" && (
          <>
            {list(created.incomes, "Nenhuma receita cadastrada.")}
            <IncomeSourceForm key={formKey} onDone={resetForm} />
          </>
        )}

        {current.key === "recurring" && (
          <>
            {list(created.recurring, "Nenhuma despesa recorrente cadastrada.")}
            <div className="mb-5 inline-flex rounded-full border border-border p-1 text-sm">
              {(["subscription", "expense"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRecurringMode(m)}
                  className={cn("rounded-full px-4 py-1.5 font-medium", recurringMode === m ? "bg-pink-500 text-on-primary" : "text-muted")}
                >
                  {m === "subscription" ? "Assinatura" : "Despesa recorrente"}
                </button>
              ))}
            </div>
            {recurringMode === "subscription" ? <SubscriptionForm key={`s${formKey}`} onDone={resetForm} /> : <ExpenseForm key={`e${formKey}`} initial={{ recurrence: "monthly", status: "pending" }} onDone={resetForm} />}
          </>
        )}

        {current.key === "bills" && (
          <>
            {list(created.bills, "Nenhuma conta a pagar cadastrada.")}
            <BillForm key={formKey} onDone={resetForm} />
          </>
        )}

        {current.key === "debt" && (
          <>
            {created.debts.length ? (
              list(created.debts, "")
            ) : (
              <DebtForm key={formKey} onDone={() => {
                resetForm();
                next();
              }} />
            )}
          </>
        )}

        {current.key === "goals" && (
          <>
            {list(created.goals, "Nenhuma meta criada.")}
            <GoalForm key={formKey} onDone={resetForm} />
          </>
        )}
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          <ArrowLeft /> Voltar
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="outline" onClick={next}>
            {step === 0 ? "Pular" : "Próximo"} <ArrowRight />
          </Button>
        ) : (
          <Button onClick={finish} loading={pending}>
            Concluir e ver meu dashboard
          </Button>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted">Nenhum dado é preenchido automaticamente — o ambiente começa vazio e tudo pode ser editado depois.</p>
    </div>
  );
}
