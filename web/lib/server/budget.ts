import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { BUDGET } from "./env";

// Durable, per-user cost guard (M4). Postgres-backed so caps survive serverless
// restarts — the in-memory version reset on every cold start. Two windows: an
// hourly burst cap and a daily ceiling. Defense-in-depth UNDER the provider's
// hard monthly spend limit ($10 on the dashboard).
//
// Identity (`userId`) is a uuid: the anonymous-auth uid when configured, else the
// client session uuid. Counters key off it independently of RLS (the server
// writes via the postgres role, which bypasses RLS).
//
// Fail-closed: any DB problem REFUSES the call, so a database hiccup can never
// open the spend gate. A refusal just makes the caller fall back to template
// output — correct, free, never an error to the learner.

export type BudgetResult = { ok: true } | { ok: false; reason: string };

function hourStart(d = new Date()): string {
  const t = new Date(d);
  t.setUTCMinutes(0, 0, 0);
  return t.toISOString();
}
function dayStart(d = new Date()): string {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t.toISOString();
}
function windows() {
  return [
    { bucket: "hour", start: hourStart(), cap: BUDGET.perHour },
    { bucket: "day", start: dayStart(), cap: BUDGET.perDay },
  ];
}

type Execer = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };

async function readCount(tx: Execer, userId: string, bucket: string, start: string): Promise<number> {
  const rows = (await tx.execute(sql`
    select count from usage_counter
    where user_id = ${userId} and bucket = ${bucket} and window_start = ${start}
  `)) as Array<{ count: number | string }>;
  return Number(rows[0]?.count ?? 0);
}

/** Consume one model-call slot, or refuse. Refusal => the caller falls back to
 *  template/cached output and NEVER calls the API. */
export async function checkAndConsume(userId: string): Promise<BudgetResult> {
  try {
    return await db.transaction(async (tx) => {
      for (const w of windows()) {
        const cur = await readCount(tx, userId, w.bucket, w.start);
        if (cur >= w.cap) return { ok: false, reason: `${w.bucket} cap reached (${w.cap})` };
      }
      for (const w of windows()) {
        await tx.execute(sql`
          insert into usage_counter (user_id, bucket, window_start, count)
          values (${userId}, ${w.bucket}, ${w.start}, 1)
          on conflict (user_id, bucket, window_start)
          do update set count = usage_counter.count + 1
        `);
      }
      return { ok: true };
    });
  } catch {
    return { ok: false, reason: "budget-unavailable" };
  }
}

export async function budgetStatus(userId: string) {
  try {
    const [hourUsed, dayUsed] = await Promise.all([
      readCount(db, userId, "hour", hourStart()),
      readCount(db, userId, "day", dayStart()),
    ]);
    return { hourUsed, hourCap: BUDGET.perHour, dayUsed, dayCap: BUDGET.perDay };
  } catch {
    return { hourUsed: 0, hourCap: BUDGET.perHour, dayUsed: 0, dayCap: BUDGET.perDay };
  }
}
