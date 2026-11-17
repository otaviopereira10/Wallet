import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-border bg-surface shadow-soft", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[15px] font-semibold tracking-tight text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-0.5 text-[13px] text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 pt-4 sm:px-6 sm:pb-6", className)} {...props} />;
}

const badgeTones = {
  neutral: "bg-surface-2 text-muted",
  pink: "bg-pink-50 text-pink-600",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  plum: "bg-surface-2 text-plum",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function ProgressBar({
  value,
  tone = "pink",
  className,
  label,
}: {
  value: number;
  tone?: "pink" | "success" | "warning" | "danger" | "plum";
  className?: string;
  label?: string;
}) {
  const colors = { pink: "bg-pink-500", success: "bg-success", warning: "bg-warning", danger: "bg-danger", plum: "bg-plum" };
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-pink-300 focus:outline-none focus:ring-4 focus:ring-pink-100 disabled:opacity-60 aria-[invalid=true]:border-danger sm:text-sm";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClass, "h-auto min-h-20 py-2.5", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      inputClass,
      "select-chevron appearance-none pr-9",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
  extra,
}: {
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="flex items-center gap-1 text-[13px] font-medium text-ink">
          {label}
        </label>
        {extra}
      </div>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-pink-50 text-pink-500 [&_svg]:size-6">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-pink-500">{eyebrow}</p>}
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-tight text-ink sm:text-[34px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  info,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "pink" | "success" | "danger" | "plum" | "warning";
  info?: React.ReactNode;
  className?: string;
}) {
  const toneMap = {
    neutral: "bg-surface-2 text-muted",
    pink: "bg-pink-50 text-pink-500",
    success: "bg-success-bg text-success",
    danger: "bg-danger-bg text-danger",
    plum: "bg-surface-2 text-plum",
    warning: "bg-warning-bg text-warning",
  };
  return (
    <Card className={cn("rise-in p-5", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1 text-[13px] font-medium text-muted">
          {label}
          {info}
        </p>
        {icon && <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-[18px]", toneMap[tone])}>{icon}</span>}
      </div>
      <p className="tabular mt-2 text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">{value}</p>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted", className)}>{children}</h3>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}
