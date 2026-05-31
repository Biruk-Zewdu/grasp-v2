import { describe, it, expect } from "vitest";

// Durable cost guard, against the REAL Postgres counters. No API key, no model
// cost. Requires DATABASE_URL. Caps are read from env at import, so we pin tiny
// caps here and dynamic-import the module after setting them.
//   set -a && source .env.local && set +a && pnpm exec vitest run test/budget.integration.test.ts
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("durable budget (Postgres-backed)", () => {
  it("consumes up to the hourly cap, then refuses — and the count persists", async () => {
    process.env.BUDGET_PER_HOUR = "3";
    process.env.BUDGET_PER_DAY = "100";
    const { checkAndConsume, budgetStatus } = await import("@/lib/server/budget");

    const userId = crypto.randomUUID(); // fresh identity => fresh counters
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await checkAndConsume(userId));

    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3].ok).toBe(false);
    expect(results[4].ok).toBe(false);

    const status = await budgetStatus(userId);
    expect(status.hourUsed).toBe(3); // never over-counts past the cap
  });

  it("a separate identity is unaffected by another's spend", async () => {
    process.env.BUDGET_PER_HOUR = "3";
    process.env.BUDGET_PER_DAY = "100";
    const { checkAndConsume } = await import("@/lib/server/budget");
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await checkAndConsume(a);
    await checkAndConsume(a);
    await checkAndConsume(a); // a is now at cap
    expect((await checkAndConsume(a)).ok).toBe(false);
    expect((await checkAndConsume(b)).ok).toBe(true); // b is independent
  });
});
