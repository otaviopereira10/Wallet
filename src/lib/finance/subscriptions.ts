import { diffDays } from "./dates";
import type { MoneyContext } from "./fx";
import { monthlyEquivalent } from "./recurrence";
import type { Cents, ISODate, Subscription } from "./types";

export interface SubscriptionView {
  sub: Subscription;
  monthly: Cents;
  yearly: Cents;
  daysUntilCharge: number;
  chargeSoon: boolean;
  chargeOverdue: boolean;
  /** "unknown" when there is no usage data — usage is never assumed. */
  usage: "unknown" | "recent" | "low";
  daysSinceUse: number | null;
}

export const LOW_USAGE_DAYS = 30;

export function subscriptionView(sub: Subscription, today: ISODate, alertDays: number): SubscriptionView {
  const monthly = monthlyEquivalent(sub.amount, { frequency: sub.billingCycle });
  const yearly =
    sub.billingCycle === "monthly"
      ? sub.amount * 12
      : sub.billingCycle === "yearly"
        ? sub.amount
        : sub.billingCycle === "quarterly"
          ? sub.amount * 4
          : sub.billingCycle === "semiannual"
            ? sub.amount * 2
            : sub.amount * 52;
  const daysUntilCharge = diffDays(today, sub.nextChargeDate);
  const daysSinceUse = sub.lastUsedOn ? diffDays(sub.lastUsedOn, today) : null;
  return {
    sub,
    monthly,
    yearly,
    daysUntilCharge,
    chargeSoon: sub.status !== "cancelled" && daysUntilCharge >= 0 && daysUntilCharge <= alertDays,
    chargeOverdue: sub.status !== "cancelled" && daysUntilCharge < 0,
    usage: daysSinceUse === null ? "unknown" : daysSinceUse > LOW_USAGE_DAYS ? "low" : "recent",
    daysSinceUse,
  };
}

export interface SubscriptionTotals {
  activeMonthly: Cents;
  activeYearly: Cents;
  cancelPlannedMonthly: Cents;
  count: number;
}

export function subscriptionTotals(views: SubscriptionView[], ctx: MoneyContext): SubscriptionTotals {
  const t: SubscriptionTotals = { activeMonthly: 0, activeYearly: 0, cancelPlannedMonthly: 0, count: 0 };
  for (const v of views) {
    if (v.sub.status === "cancelled") continue;
    t.count++;
    t.activeMonthly += ctx.toBase(v.monthly, v.sub.currency);
    t.activeYearly += ctx.toBase(v.yearly, v.sub.currency);
    if (v.sub.status === "cancel_planned") t.cancelPlannedMonthly += ctx.toBase(v.monthly, v.sub.currency);
  }
  return t;
}
