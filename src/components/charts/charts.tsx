"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormat } from "@/components/app-context";
import type { Currency } from "@/lib/finance/types";

export const SERIES = {
  income: "#5FAE8F",
  expense: "#D27AA6",
  debt: "#9A6DAE",
  netWorth: "#C96B98",
  assets: "#E8A3C1",
  gold: "#D9A85B",
  blue: "#7A8FD1",
};
export const CATEGORY_COLORS = ["#C96B98", "#E8A3C1", "#9A6DAE", "#5FAE8F", "#D9A85B", "#7A8FD1", "#E58F7B", "#7FB8C9", "#B7A1D6", "#A3C98B", "#D4B483", "#8C8A93", "#F0B8D0"];

const axis = { stroke: "var(--c-muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function useMoneyTick(currency?: Currency) {
  const f = useFormat();
  return {
    tick: (v: number) => f.money(Math.round(v * 100), currency ?? f.base, { compact: true }),
    full: (v: number) => f.money(Math.round(v * 100), currency ?? f.base),
  };
}

function TooltipBox({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string | number }>;
  label?: string | number;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tabular font-semibold text-ink">{fmt(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

export function IncomeExpenseChart({
  data,
  height = 260,
  hideIncome,
}: {
  data: Array<{ label: string; income: number; expenses: number; debt?: number }>;
  height?: number;
  hideIncome?: boolean;
}) {
  const m = useMoneyTick();
  const hasDebt = data.some((d) => (d.debt ?? 0) > 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={56} tickFormatter={m.tick} />
        <Tooltip cursor={{ fill: "var(--c-surface-2)" }} content={<TooltipBox fmt={m.full} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {!hideIncome && <Bar dataKey="income" name="Income" fill={SERIES.income} radius={[6, 6, 0, 0]} maxBarSize={28} />}
        <Bar dataKey="expenses" name="Expenses" fill={SERIES.expense} radius={[6, 6, 0, 0]} maxBarSize={28} />
        {hasDebt && <Bar dataKey="debt" name="Debt payments" fill={SERIES.debt} radius={[6, 6, 0, 0]} maxBarSize={28} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NetWorthChart({ data, height = 260 }: { data: Array<{ label: string; assets: number; debts: number; netWorth: number }>; height?: number }) {
  const m = useMoneyTick();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.netWorth} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES.netWorth} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={56} tickFormatter={m.tick} />
        <Tooltip content={<TooltipBox fmt={m.full} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <ReferenceLine y={0} stroke="var(--c-border-strong)" />
        <Area type="monotone" dataKey="netWorth" name="Net worth" stroke={SERIES.netWorth} strokeWidth={2.5} fill="url(#nw)" />
        <Line type="monotone" dataKey="assets" name="Money in accounts" stroke={SERIES.income} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="debts" name="Debts" stroke={SERIES.debt} strokeWidth={2} dot={false} strokeDasharray="5 4" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 220,
  centerLabel,
  centerValue,
}: {
  data: Array<{ name: string; value: number }>;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const m = useMoneyTick();
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<TooltipBox fmt={m.full} />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-[11px] text-muted">{centerLabel}</p>
            <p className="tabular text-lg font-semibold text-ink">{centerValue}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function MultiLineChart({
  data,
  series,
  height = 300,
  currency,
  referenceY,
  referenceLabel,
}: {
  data: Array<Record<string, number | string>>;
  series: Array<{ key: string; name: string; color: string; dashed?: boolean }>;
  height?: number;
  currency?: Currency;
  referenceY?: number;
  referenceLabel?: string;
}) {
  const m = useMoneyTick(currency);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} minTickGap={24} />
        <YAxis {...axis} width={60} tickFormatter={m.tick} />
        <Tooltip content={<TooltipBox fmt={m.full} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke={SERIES.gold} strokeDasharray="4 4" label={{ value: referenceLabel, fontSize: 10, fill: "var(--c-muted)", position: "insideTopRight" }} />
        )}
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.25} dot={false} strokeDasharray={s.dashed ? "5 4" : undefined} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BalanceAreaChart({
  data,
  height = 280,
  buffer,
}: {
  data: Array<{ label: string; balance: number }>;
  height?: number;
  buffer?: number;
}) {
  const m = useMoneyTick();
  const min = Math.min(0, ...data.map((d) => d.balance));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.netWorth} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SERIES.netWorth} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--c-border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axis} minTickGap={28} />
        <YAxis {...axis} width={60} tickFormatter={m.tick} domain={[min, "auto"]} />
        <Tooltip content={<TooltipBox fmt={m.full} />} />
        <ReferenceLine y={0} stroke="var(--c-danger)" strokeOpacity={0.5} />
        {buffer !== undefined && buffer > 0 && (
          <ReferenceLine y={buffer} stroke={SERIES.gold} strokeDasharray="4 4" label={{ value: "safety cushion", fontSize: 10, fill: "var(--c-muted)", position: "insideTopLeft" }} />
        )}
        <Area type="stepAfter" dataKey="balance" name="Expected balance" stroke={SERIES.netWorth} strokeWidth={2.25} fill="url(#bal)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBars({
  data,
  height,
}: {
  data: Array<{ label: string; planned: number; actual: number }>;
  height?: number;
}) {
  const m = useMoneyTick();
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke="var(--c-border)" strokeDasharray="3 3" />
        <XAxis type="number" {...axis} tickFormatter={m.tick} />
        <YAxis type="category" dataKey="label" {...axis} width={110} />
        <Tooltip cursor={{ fill: "var(--c-surface-2)" }} content={<TooltipBox fmt={m.full} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="planned" name="Planned" fill={SERIES.assets} radius={[0, 6, 6, 0]} maxBarSize={14} />
        <Bar dataKey="actual" name="Actual" fill={SERIES.expense} radius={[0, 6, 6, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
