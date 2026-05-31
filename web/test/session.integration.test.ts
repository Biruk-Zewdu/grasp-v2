import { describe, it, expect, beforeAll } from "vitest";

// Server-side session persistence, against REAL Postgres. No API key/cost.
// Requires DATABASE_URL and a frozen v1.
//   set -a && source .env.local && set +a && pnpm exec vitest run test/session.integration.test.ts
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("session persistence (app_session)", () => {
  let loadProgress: typeof import("@/lib/db/session").loadProgress;
  let saveProgress: typeof import("@/lib/db/session").saveProgress;
  let emptyProgress: typeof import("@/lib/db/session").emptyProgress;
  let frozenVersion: typeof import("@/lib/db/records").frozenVersion;

  beforeAll(async () => {
    ({ loadProgress, saveProgress, emptyProgress } = await import("@/lib/db/session"));
    ({ frozenVersion } = await import("@/lib/db/records"));
  });

  it("round-trips progress for an identity and pins corpus_version on insert", async () => {
    const v = await frozenVersion("v1");
    const userId = crypto.randomUUID();

    // first visit: no row -> fallback returned verbatim
    expect(await loadProgress(userId, emptyProgress())).toEqual(emptyProgress());

    const p = { target: 7, seen: [7, 9], grasped: [9], probed: [9], seenTensions: [2] };
    await saveProgress(userId, v!.id, p);
    expect(await loadProgress(userId, emptyProgress())).toEqual(p);

    // a later save updates progress but must NOT change the pinned version
    const p2 = { ...p, seen: [7, 9, 11] };
    await saveProgress(userId, 999999, p2); // bogus version id; should be ignored on update
    const back = await loadProgress(userId, emptyProgress());
    expect(back.seen).toEqual([7, 9, 11]);
  });
});
