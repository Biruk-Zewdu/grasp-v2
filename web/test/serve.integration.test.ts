import { describe, it, expect, beforeAll } from "vitest";

// Integration smoke for the serve pipeline against the REAL frozen v1 artifact.
// No API key, no cost (template mode). Requires DATABASE_URL in the env:
//   set -a && source .env.local && set +a && pnpm exec vitest run test/serve.integration.test.ts
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("serve pipeline (frozen v1)", () => {
  let frozenVersion: typeof import("@/lib/db/records").frozenVersion;
  let getEntitiesForVersion: typeof import("@/lib/db/records").getEntitiesForVersion;
  let getTension: typeof import("@/lib/db/records").getTension;
  let loadGraph: typeof import("@/lib/db/graph").loadGraph;
  let nextStep: typeof import("@/lib/sequencer").nextStep;
  let keywordMatch: typeof import("@/lib/index").keywordMatch;
  let renderTension: typeof import("@/lib/render").renderTension;

  beforeAll(async () => {
    ({ frozenVersion, getEntitiesForVersion, getTension } = await import("@/lib/db/records"));
    ({ loadGraph } = await import("@/lib/db/graph"));
    ({ nextStep } = await import("@/lib/sequencer"));
    ({ keywordMatch } = await import("@/lib/index"));
    ({ renderTension } = await import("@/lib/render"));
  });

  it("v1 is frozen", async () => {
    const v = await frozenVersion("v1");
    expect(v?.frozenAt).toBeTruthy();
  });

  it("keyword index routes a demo goal to a real concept", async () => {
    const v = await frozenVersion("v1");
    const ents = await getEntitiesForVersion(v!.id);
    const m = keywordMatch("why does deep learning struggle with reasoning?", ents);
    expect("entityId" in m).toBe(true);
    if ("entityId" in m) {
      const e = ents.find((x) => x.id === m.entityId)!;
      expect(e.name.toLowerCase()).toContain("deep learning");
    }
  });

  it("the sequencer walks a goal to satisfice without looping, surfacing a tension", async () => {
    const v = await frozenVersion("v1");
    const graph = await loadGraph(v!.id);
    const ents = await getEntitiesForVersion(v!.id);
    const m = keywordMatch("when does reinforcement learning fail?", ents);
    expect("entityId" in m).toBe(true);
    const target = (m as { entityId: number }).entityId;

    const state = { target, seen: [] as number[], grasped: [] as number[], probed: [] as number[], seenTensions: [] as number[] };
    let sawTension = false;
    let stopped = false;
    for (let i = 0; i < 200; i++) {
      const ref = nextStep(graph, state);
      if (ref.kind === "stop") { stopped = true; break; }
      if (ref.kind === "entity") { state.seen = [...new Set([...state.seen, ref.entityId])]; state.grasped = [...new Set([...state.grasped, ref.entityId])]; }
      else if (ref.kind === "probe") {
        // simulate a hit: mark the probe's concepts probed + grasped
        const p = graph.probes.find((x) => x.id === ref.probeId)!;
        state.probed = [...new Set([...state.probed, ...p.conceptIds])];
        state.grasped = [...new Set([...state.grasped, ...p.conceptIds])];
      } else if (ref.kind === "tension") { sawTension = true; state.seenTensions = [...new Set([...state.seenTensions, ref.tensionId])]; }
    }
    expect(stopped).toBe(true);
    expect(sawTension).toBe(true);
  });

  it("each scripted demo goal routes and walks to satisfice via a tension", async () => {
    const v = await frozenVersion("v1");
    const graph = await loadGraph(v!.id);
    const ents = await getEntitiesForVersion(v!.id);
    const goals = [
      "why does deep learning struggle with reasoning?",
      "when does reinforcement learning fail?",
      "what's the difference between Shannon and Simon information?",
    ];
    for (const goal of goals) {
      const m = keywordMatch(goal, ents);
      expect("entityId" in m, `routed: ${goal}`).toBe(true);
      const target = (m as { entityId: number }).entityId;
      const st = { target, seen: [] as number[], grasped: [] as number[], probed: [] as number[], seenTensions: [] as number[] };
      let sawTension = false;
      let stopped = false;
      for (let i = 0; i < 300; i++) {
        const ref = nextStep(graph, st);
        if (ref.kind === "stop") { stopped = true; break; }
        if (ref.kind === "entity") { st.seen = [...new Set([...st.seen, ref.entityId])]; st.grasped = [...new Set([...st.grasped, ref.entityId])]; }
        else if (ref.kind === "probe") { const p = graph.probes.find((x) => x.id === ref.probeId)!; st.probed = [...new Set([...st.probed, ...p.conceptIds])]; st.grasped = [...new Set([...st.grasped, ...p.conceptIds])]; }
        else if (ref.kind === "tension") { sawTension = true; st.seenTensions = [...new Set([...st.seenTensions, ref.tensionId])]; }
      }
      expect(stopped, `satisficed: ${goal}`).toBe(true);
      expect(sawTension, `tension: ${goal}`).toBe(true);
    }
  });

  it("every tension renders as a two-column table with BOTH sides (g11)", async () => {
    const v = await frozenVersion("v1");
    const graph = await loadGraph(v!.id);
    for (const t of graph.tensions) {
      const rec = await getTension(t.id);
      const step = renderTension(rec!);
      expect(step.kind).toBe("tension");
      if (step.kind === "tension") {
        expect(step.table.whenA.trim().length).toBeGreaterThan(0);
        expect(step.table.whenB.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
