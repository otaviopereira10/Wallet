import { CheckCircle2, Circle, HelpCircle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, ProgressBar } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

export interface SetupProgress {
  accounts: boolean;
  income: boolean;
  bills: boolean;
  expense: boolean;
  debt: boolean;
  goal: boolean;
}

const STEPS: Array<{ key: keyof SetupProgress; title: string; text: string; href: string; optional?: boolean }> = [
  { key: "accounts", title: "Add your accounts", text: "Checking, savings, cash or card — with how much is in each one today.", href: "/accounts" },
  { key: "income", title: "Add your income", text: "Salary, scholarship, family help. Repeating income is used to plan ahead.", href: "/income" },
  { key: "bills", title: "Add the bills you pay", text: "Rent, phone, internet… with the due date, so you get reminders.", href: "/bills" },
  { key: "expense", title: "Record a purchase", text: "Use the pink “Add money in or out” button whenever you spend.", href: "/expenses" },
  { key: "debt", title: "Set up your university debt", text: "Optional — see when it will be paid off and how much to pay.", href: "/debt", optional: true },
  { key: "goal", title: "Create a savings goal", text: "Optional — emergency fund, a trip, a new laptop…", href: "/goals", optional: true },
];

/**
 * Checklist shown on the dashboard until the basics are in place. It reads only
 * what the user has already entered — nothing is created automatically.
 */
export function GettingStarted({ progress }: { progress: SetupProgress }) {
  const required = STEPS.filter((s) => !s.optional);
  if (required.every((s) => progress[s.key])) return null;
  const done = STEPS.filter((s) => progress[s.key]).length;
  return (
    <Card className="mb-6">
      <CardHeader>
        <div>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            A few minutes of setup makes every number in the app accurate. {done} of {STEPS.length} done.
          </CardDescription>
        </div>
        <Link href="/help" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-pink-600 hover:underline">
          <HelpCircle className="size-4" /> How it works
        </Link>
      </CardHeader>
      <CardContent>
        <ProgressBar value={(done / STEPS.length) * 100} label="Setup progress" />
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => {
            const ok = progress[s.key];
            return (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    "flex h-full gap-3 rounded-xl border p-3 transition",
                    ok ? "border-transparent bg-success-bg/60" : "border-border hover:border-pink-300 hover:bg-pink-50/50",
                  )}
                >
                  {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" />}
                  <span>
                    <span className={cn("block text-sm font-semibold", ok && "text-success")}>
                      {i + 1}. {s.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{s.text}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
