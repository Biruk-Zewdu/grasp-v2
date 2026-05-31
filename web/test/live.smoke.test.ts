import { describe, it, expect, beforeAll } from "vitest";

// Live smoke — makes ONE real provider call. Gated: runs only when SERVE_MODE=live
// and a key is present. Skipped otherwise (and in CI). Run:
//   set -a && source .env.local && set +a && pnpm exec vitest run test/live.smoke.test.ts
const LIVE =
  process.env.SERVE_MODE === "live" &&
  (!!process.env.OPENAI_API_KEY || !!process.env.ANTHROPIC_API_KEY);
const d = LIVE ? describe : describe.skip;

d("live model smoke (one real API call)", () => {
  let structuredCall: typeof import("@/lib/server/model").structuredCall;
  let budgetStatus: typeof import("@/lib/server/budget").budgetStatus;

  beforeAll(async () => {
    ({ structuredCall } = await import("@/lib/server/model"));
    ({ budgetStatus } = await import("@/lib/server/budget"));
  });

  it("phrases a briefing through the live provider and consumes one budget slot", async () => {
    const r = await structuredCall<{ point: string }>({
      sessionId: "smoke",
      role: "render",
      system: "Phrase the concept in one short sentence using ONLY the definition.",
      user:
        "Concept: credit assignment\n" +
        "Definition: any process for evaluating the effects of individual actions on solving a problem.",
      schemaName: "briefing",
      schema: {
        type: "object",
        properties: { point: { type: "string" } },
        required: ["point"],
        additionalProperties: false,
      },
      maxTokens: 100,
    });
    if (!r.ok) console.log("live call failed:", r.reason);
    expect(r.ok).toBe(true);
    if (r.ok) {
      console.log("live briefing:", r.data.point);
      expect(typeof r.data.point).toBe("string");
      expect(r.data.point.length).toBeGreaterThan(0);
    }
    expect(budgetStatus("smoke").sessionUsed).toBeGreaterThan(0);
  });

  it("classify (mid model) returns a structured nullable id via strict schema", async () => {
    const r = await structuredCall<{ entityId: number | null }>({
      sessionId: "smoke2",
      role: "classify",
      cacheSystem: true,
      system:
        "Map the goal to the single best concept id, or null.\nCONCEPTS:\n" +
        "1: reinforcement learning\n2: deep learning\n3: search",
      user: "Goal: when does reinforcement learning fail?",
      schemaName: "route",
      schema: {
        type: "object",
        properties: { entityId: { type: ["integer", "null"] } },
        required: ["entityId"],
        additionalProperties: false,
      },
      maxTokens: 50,
    });
    if (!r.ok) console.log("classify failed:", r.reason);
    expect(r.ok).toBe(true);
    if (r.ok) {
      console.log("classified entityId:", r.data.entityId);
      expect(r.data.entityId === null || typeof r.data.entityId === "number").toBe(true);
    }
  });
});
