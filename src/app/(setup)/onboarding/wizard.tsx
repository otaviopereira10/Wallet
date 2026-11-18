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
  { key: "profile", title: "Your preferences", text: "Your main currency, time zone and the safety cushion you always want to keep in your accounts." },
  { key: "accounts", title: "Accounts & balances", text: "Where your money is today (checking, savings, cash, card) and how much is in each one." },
  { key: "incomes", title: "Income", text: "Scholarship, salary, family help… Repeating income is used to plan the months ahead." },
  { key: "recurring", title: "Repeating expenses", text: "Subscriptions and costs that repeat, like the gym or streaming." },
  { key: "bills", title: "Bills", text: "Rent, phone, internet — with due date and how important each one is." },
  { key: "debt", title: "University debt", text: "What you owe today and the 5,500 added each semester (you can change this)." },
  { key: "goals", title: "Savings goals", text: "Emergency fund, a trip, college…" },
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
  const finish = () => run(() => completeOnboarding({ done: true }), { success: "All set! Welcome to your Isabelle Wallet.", onSuccess: () => router.push("/dashboard") });

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
          Skip and set up later
        </button>
      </div>
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted">
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <ProgressBar value={((step + 1) / STEPS.length) * 100} label="Setup progress" />
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

        {current.key === "profile" && <ProfileForm initial={profile} compact detectTimezone submitLabel="Save and continue" onDone={next} />}

        {current.key === "accounts" && (
          <>
            {list(created.accounts, "No accounts yet. Start with the one you use most.")}
            <AccountForm key={formKey} onDone={resetForm} />
          </>
        )}

        {current.key === "incomes" && (
          <>
            {list(created.incomes, "No income added yet.")}
            <IncomeSourceForm key={formKey} onDone={resetForm} />
          </>
        )}

        {current.key === "recurring" && (
          <>
            {list(created.recurring, "No repeating expenses added yet.")}
            <div className="mb-5 inline-flex rounded-full border border-border p-1 text-sm">
              {(["subscription", "expense"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRecurringMode(m)}
                  className={cn("rounded-full px-4 py-1.5 font-medium", recurringMode === m ? "bg-pink-500 text-on-primary" : "text-muted")}
                >
                  {m === "subscription" ? "Subscription" : "Repeating expense"}
                </button>
              ))}
            </div>
            {recurringMode === "subscription" ? <SubscriptionForm key={`s${formKey}`} onDone={resetForm} /> : <ExpenseForm key={`e${formKey}`} initial={{ recurrence: "monthly", status: "pending" }} onDone={resetForm} />}
          </>
        )}

        {current.key === "bills" && (
          <>
            {list(created.bills, "No bills added yet.")}
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
            {list(created.goals, "No goals yet.")}
            <GoalForm key={formKey} onDone={resetForm} />
          </>
        )}
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          <ArrowLeft /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="outline" onClick={next}>
            {step === 0 ? "Skip" : "Next"} <ArrowRight />
          </Button>
        ) : (
          <Button onClick={finish} loading={pending}>
            Finish and open my dashboard
          </Button>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-muted">Nothing is filled in for you — you start with a clean slate and can change everything later. Each step is optional.</p>
    </div>
  );
}
