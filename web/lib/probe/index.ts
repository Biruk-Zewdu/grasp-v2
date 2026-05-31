import "server-only";
import { structuredCall } from "@/lib/server/anthropic";
import { MODELS } from "@/lib/server/env";
import type { ProbeRecord } from "@/lib/db/records";

// Coverage-only probe check (g12). We report WHICH authored signals the response
// touches — never whether the answer is "right", never a score. A miss just
// opens depth (the surface treats !grasped as a breakdown, not a failure).
export type ProbeResult = { covered: number[]; grasped: boolean };

const GRASP_FRACTION = 0.5; // touched >= half the rubric -> grasped

function sig(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

/** Pure coverage: a signal is "touched" if the response shares enough of its
 *  significant words. No truth judgement. */
function keywordCoverage(signals: string[], response: string): number[] {
  const r = new Set(sig(response));
  const covered: number[] = [];
  signals.forEach((s, i) => {
    const st = sig(s);
    if (!st.length) return;
    const hits = st.filter((t) => r.has(t)).length;
    if (hits >= 2 || hits / st.length >= 0.4) covered.push(i);
  });
  return covered;
}

export async function checkProbe(
  probe: ProbeRecord,
  response: string,
  sessionId: string,
): Promise<ProbeResult> {
  const signals = probe.expectedSignals;

  const model = await structuredCall<{ covered: number[] }>({
    sessionId,
    model: MODELS.probe,
    system:
      "You check COVERAGE only. Given a learner's response and a numbered list of " +
      "signals a good answer would touch, return the indices of the signals the " +
      "response actually addresses. Do NOT judge whether the answer is correct, " +
      "do NOT score it, do NOT add signals. Coverage only.",
    user:
      `Response:\n${response}\n\nSignals:\n` +
      signals.map((s, i) => `${i}: ${s}`).join("\n"),
    tool: {
      name: "coverage",
      description: "Return indices of signals the response touches.",
      input_schema: {
        type: "object",
        properties: { covered: { type: "array", items: { type: "integer" } } },
        required: ["covered"],
      },
    },
    maxTokens: 100,
  });

  const covered =
    model.ok && Array.isArray(model.data.covered)
      ? model.data.covered.filter((i) => i >= 0 && i < signals.length)
      : keywordCoverage(signals, response);

  const grasped = signals.length > 0 && covered.length / signals.length >= GRASP_FRACTION;
  return { covered: [...new Set(covered)], grasped };
}
