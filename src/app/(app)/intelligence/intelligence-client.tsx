"use client";

import { AlertCircle, ArrowUp, Bot, Lightbulb, ListChecks, Sparkles, Target, TriangleAlert, User } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { useApp } from "@/components/app-context";
import { Switch } from "@/components/ui/overlays";
import { Card, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import type { AssistantAnswer } from "@/lib/finance/assistant";
import { askIsabelle, type AskResult } from "@/server/actions/assistant";

const SUGGESTIONS = [
  "Can I buy something for $150 this month?",
  "How much can I spend until my next paycheck?",
  "Which bill should I pay first?",
  "Am I spending too much on food?",
  "How much should I set aside for college?",
  "How much do I need to pay monthly to pay off my loan in 3 years?",
  "How can I save $100 per month?",
  "What will my finances look like in six months?",
];

interface Turn {
  id: number;
  question: string;
  result?: AskResult;
  error?: string;
}

export function IntelligenceClient() {
  const app = useApp();
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [useAI, setUseAI] = React.useState(app.aiEnabled && app.aiAvailable);
  const [pending, startTransition] = React.useTransition();
  const endRef = React.useRef<HTMLDivElement>(null);

  const ask = (q: string) => {
    const question = q.trim();
    if (question.length < 3) return;
    const id = Date.now();
    setTurns((t) => [...t, { id, question }]);
    setInput("");
    startTransition(async () => {
      try {
        const r = await askIsabelle({ question, useAI });
        setTurns((t) => t.map((x) => (x.id === id ? (r.ok ? { ...x, result: r.data } : { ...x, error: r.error }) : x)));
      } catch {
        toast.error("Connection failed.");
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: "Connection failed." } : x)));
      }
    });
  };

  React.useEffect(() => {
    if (turns.length) void endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  return (
    <div className="mx-auto max-w-3xl">
      {!turns.length && (
        <Card className="mb-6 overflow-hidden">
          <div className="bg-[radial-gradient(120%_120%_at_0%_0%,var(--c-pink-50),transparent_60%)] p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-pink-500 text-on-primary">
              <Sparkles className="size-5" />
            </span>
            <h2 className="mt-4 font-display text-2xl">Ask about your money</h2>
            <p className="mt-1 text-sm text-muted">
              Every answer shows the situation, what to do, the expected impact and the risks. Projections are estimates, not guarantees. Tap a question below to try it.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-border bg-surface px-3.5 py-2 text-left text-sm transition hover:border-pink-300 hover:bg-pink-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-5" aria-live="polite">
        {turns.map((t) => (
          <div key={t.id} className="space-y-3">
            <div className="flex justify-end gap-2">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-pink-500 px-4 py-2.5 text-sm text-on-primary">{t.question}</p>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
                <User className="size-4" />
              </span>
            </div>
            <div className="flex gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pink-50 text-pink-500">
                <Bot className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                {t.error ? (
                  <p className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">{t.error}</p>
                ) : t.result ? (
                  <AnswerCard answer={t.result.answer} ai={t.result.ai} />
                ) : (
                  <div className="flex gap-1 rounded-2xl bg-surface px-4 py-4 shadow-soft" aria-label="Calculating">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="size-2 animate-bounce rounded-full bg-pink-300" style={{ animationDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-24 mt-6 lg:bottom-6"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <Card className="p-2">
          <div className="flex items-end gap-2">
            <Textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              placeholder="e.g. Can I buy $120 headphones this month?"
              className="min-h-11 resize-none border-0 focus:ring-0"
              aria-label="Your question"
              maxLength={500}
            />
            <Button type="submit" size="icon" loading={pending} aria-label="Send question" disabled={input.trim().length < 3}>
              {!pending && <ArrowUp />}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-2 text-xs text-muted">
            <label className="flex items-center gap-2">
              <Switch checked={useAI} onCheckedChange={setUseAI} disabled={!app.aiAvailable || !app.aiEnabled} label="Use AI" />
              AI explanation
              {!app.aiAvailable ? " (not set up on the server)" : !app.aiEnabled ? (
                <>
                  {" "}
                  (turn it on in <Link href="/settings" className="text-pink-600 underline">Settings</Link>)
                </>
              ) : null}
            </label>
            <span>Numbers always come from the app’s own calculations.</span>
          </div>
        </Card>
      </form>
    </div>
  );
}

function AnswerCard({ answer, ai }: { answer: AssistantAnswer; ai: AskResult["ai"] }) {
  const sections = [
    { icon: <AlertCircle className="size-4" />, title: "Situation", body: answer.problem },
    { icon: <Target className="size-4" />, title: "What to do", body: answer.action },
    { icon: <Lightbulb className="size-4" />, title: "Expected impact", body: answer.impact },
    { icon: <TriangleAlert className="size-4" />, title: "Risks and limits", body: answer.risks },
  ].filter((s) => s.body);
  return (
    <Card className="rise-in p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-pink-500">{answer.title}</p>
      <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">{answer.summary}</p>
      {sections.length > 0 && (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {sections.map((s) => (
            <div key={s.title} className="rounded-xl bg-surface-2/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                {s.icon} {s.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{s.body}</p>
            </div>
          ))}
        </div>
      )}
      {answer.missing.length > 0 && (
        <p className="mt-3 rounded-xl bg-warning-bg px-3 py-2 text-xs text-warning">
          <strong>Missing information:</strong> {answer.missing.join("; ")}.
        </p>
      )}
      {answer.assumptions.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="flex cursor-pointer items-center gap-1.5">
            <ListChecks className="size-3.5" /> Assumptions used
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {answer.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}
      {ai && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-pink-500">
            <Sparkles className="size-3.5" /> AI explanation
          </p>
          {ai.ok ? (
            <div className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">{ai.text.replace(/\*\*(.+?)\*\*/g, "$1")}</div>
          ) : (
            <p className="mt-1.5 text-sm text-muted">{ai.error}</p>
          )}
        </div>
      )}
    </Card>
  );
}
