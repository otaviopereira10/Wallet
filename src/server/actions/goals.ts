"use server";

import { z } from "zod";
import { budgetSchema, contributionSchema, expenseCategory, goalSchema, uuid } from "@/lib/validation";
import { baseCurrency, idSchema, run, userToday, UserError } from "./helpers";

export async function createGoal(raw: unknown) {
  return run(
    goalSchema,
    raw,
    async (v, { db }) => {
      const r = await db.query<{ id: string }>(
        `insert into goals (name, kind, target_amount, currency, deadline, priority, monthly_contribution, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [v.name, v.kind, v.targetAmount, v.currency, v.deadline, v.priority, v.monthlyContribution, v.notes],
      );
      if (v.initialSaved && Number(v.initialSaved) > 0) {
        await db.query("insert into goal_contributions (goal_id, date, amount, note) values ($1, $2, $3, 'Valor já acumulado')", [
          r[0].id,
          await userToday(db),
          v.initialSaved,
        ]);
      }
      return r[0].id;
    },
    { message: "Meta criada" },
  );
}

export async function updateGoal(raw: unknown) {
  return run(
    z.intersection(idSchema, goalSchema),
    raw,
    async (v, { db }) => {
      const r = await db.query(
        `update goals set name = $2, kind = $3, target_amount = $4, currency = $5, deadline = $6, priority = $7, monthly_contribution = $8, notes = $9
         where id = $1 returning id`,
        [v.id, v.name, v.kind, v.targetAmount, v.currency, v.deadline, v.priority, v.monthlyContribution, v.notes],
      );
      if (!r.length) throw new UserError("Meta não encontrada.");
    },
    { message: "Meta atualizada" },
  );
}

export async function setGoalArchived(raw: unknown) {
  return run(z.object({ id: uuid, archived: z.boolean() }), raw, async (v, { db }) => {
    await db.query("update goals set archived = $2 where id = $1", [v.id, v.archived]);
  }, { message: "Meta atualizada" });
}

export async function deleteGoal(raw: unknown) {
  return run(idSchema, raw, async (v, { db }) => {
    const r = await db.query("delete from goals where id = $1 returning id", [v.id]);
    if (!r.length) throw new UserError("Meta não encontrada.");
  }, { message: "Meta excluída" });
}

export async function addContribution(raw: unknown) {
  return run(
    contributionSchema,
    raw,
    async (v, { db }) => {
      if (Number(v.amount) < 0) {
        const saved = await db.query<{ total: string | null }>("select sum(amount)::text as total from goal_contributions where goal_id = $1", [v.goalId]);
        if (Number(saved[0]?.total ?? 0) + Number(v.amount) < 0) throw new UserError("A retirada é maior que o valor acumulado.");
      }
      await db.query("insert into goal_contributions (goal_id, date, amount, note) values ($1, $2, $3, $4)", [v.goalId, v.date, v.amount, v.note]);
    },
    { message: "Contribuição registrada" },
  );
}

export async function deleteContribution(raw: unknown) {
  return run(idSchema, raw, async (v, { db }) => {
    await db.query("delete from goal_contributions where id = $1", [v.id]);
  }, { message: "Contribuição removida" });
}

export async function upsertBudget(raw: unknown) {
  return run(
    budgetSchema,
    raw,
    async (v, { db }) => {
      const cur = await baseCurrency(db);
      await db.query(
        `insert into budgets (category, amount, currency) values ($1, $2, $3)
         on conflict (user_id, category) do update set amount = excluded.amount, currency = excluded.currency`,
        [v.category, v.amount, cur],
      );
    },
    { message: "Limite salvo" },
  );
}

export async function deleteBudget(raw: unknown) {
  return run(z.object({ category: expenseCategory }), raw, async (v, { db }) => {
    await db.query("delete from budgets where category = $1", [v.category]);
  }, { message: "Limite removido" });
}
