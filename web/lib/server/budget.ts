import "server-only";
import { BUDGET } from "./env";

// App-level rate cap (defense in depth under the Console monthly spend limit).
// In-memory per server instance — fine for the v1 demo. M4 should back this with
// a durable store (Postgres/Upstash) so caps hold across serverless instances.

type Window = { count: number; resetAt: number };
const HOUR = 3_600_000;

const hourly: Window = { count: 0, resetAt: Date.now() + HOUR };
const sessionCounts = new Map<string, number>();

export type BudgetResult = { ok: true } | { ok: false; reason: string };

/** Consume one model-call slot, or refuse. Refusal => caller falls back to
 *  template/cached output and NEVER calls the API. */
export function checkAndConsume(sessionId: string): BudgetResult {
  const now = Date.now();
  if (now > hourly.resetAt) {
    hourly.count = 0;
    hourly.resetAt = now + HOUR;
  }
  if (hourly.count >= BUDGET.perHour) {
    return { ok: false, reason: `hourly cap reached (${BUDGET.perHour})` };
  }
  const used = sessionCounts.get(sessionId) ?? 0;
  if (used >= BUDGET.perSession) {
    return { ok: false, reason: `session cap reached (${BUDGET.perSession})` };
  }
  hourly.count += 1;
  sessionCounts.set(sessionId, used + 1);
  return { ok: true };
}

export function budgetStatus(sessionId: string) {
  return {
    sessionUsed: sessionCounts.get(sessionId) ?? 0,
    sessionCap: BUDGET.perSession,
    hourlyUsed: hourly.count,
    hourlyCap: BUDGET.perHour,
  };
}
