import { AlertTriangle, ArrowUpRight, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Insight } from "@/lib/finance/analysis";

const TONES = {
  danger: { icon: OctagonAlert, cls: "bg-danger-bg text-danger" },
  warning: { icon: AlertTriangle, cls: "bg-warning-bg text-warning" },
  positive: { icon: CheckCircle2, cls: "bg-success-bg text-success" },
  info: { icon: Info, cls: "bg-info-bg text-info" },
};

export function InsightList({ items, limit }: { items: Insight[]; limit?: number }) {
  const list = limit ? items.slice(0, limit) : items;
  if (!list.length)
    return <p className="text-sm text-muted">Add your accounts, income and expenses to get a smart summary based on your own data.</p>;
  return (
    <ul className="space-y-2.5">
      {list.map((i) => {
        const T = TONES[i.tone];
        const body = (
          <div className="flex items-start gap-3">
            <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl", T.cls)}>
              <T.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-ink">{i.title}</p>
              {i.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{i.detail}</p>}
            </div>
            {i.href && <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted transition group-hover:text-pink-500" />}
          </div>
        );
        return (
          <li key={i.id}>
            {i.href ? (
              <Link href={i.href} className="group block rounded-2xl border border-transparent p-2.5 transition hover:border-border hover:bg-surface-2/60">
                {body}
              </Link>
            ) : (
              <div className="p-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
