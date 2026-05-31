import "server-only";
import { structuredCall } from "@/lib/server/anthropic";
import { MODELS } from "@/lib/server/env";
import { getEntitiesForVersion, type EntityRecord } from "@/lib/db/records";

export type GoalMatch = { entityId: number; name: string } | { gap: true };

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "is", "are", "and", "or", "for",
  "why", "how", "when", "what", "does", "do", "with", "about", "between",
  "vs", "versus", "i", "want", "understand", "grasp", "learn", "explain",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Pure keyword match over the concept list (no model). Substring of a concept
 *  name wins; otherwise the concept with the most shared significant tokens. */
export function keywordMatch(goal: string, ents: EntityRecord[]): GoalMatch {
  const g = goal.toLowerCase();
  const goalTokens = new Set(tokens(goal));
  let best: { e: EntityRecord; score: number } | null = null;

  for (const e of ents) {
    const name = e.name.toLowerCase();
    let score = 0;
    if (g.includes(name)) score = 100 + name.length; // whole concept name present
    else {
      const nameTokens = tokens(e.name);
      const overlap = nameTokens.filter((t) => goalTokens.has(t)).length;
      score = overlap * 10;
    }
    if (score > 0 && (!best || score > best.score)) best = { e, score };
  }
  return best ? { entityId: best.e.id, name: best.e.name } : { gap: true };
}

/** Goal/ask text -> a target concept id. Model (Sonnet, cached concept list)
 *  when live; otherwise the keyword fallback. Never fabricates: returns {gap}
 *  when nothing matches (the surface says so honestly — g1). */
export async function classifyGoal(
  goal: string,
  versionId: number,
  sessionId: string,
): Promise<GoalMatch> {
  const ents = await getEntitiesForVersion(versionId);

  const conceptList = ents
    .map((e) => `${e.id}: ${e.name} — ${e.definition ?? ""}`)
    .join("\n");

  const model = await structuredCall<{ entityId: number | null }>({
    sessionId,
    model: MODELS.classify,
    cacheSystem: true,
    system:
      "Map a learner's goal to the single best-matching concept id from this list, " +
      "or null if none fits. Return only an id from the list.\n\nCONCEPTS:\n" +
      conceptList,
    user: `Goal: ${goal}`,
    tool: {
      name: "route",
      description: "Return the best concept id, or null if the goal is off-corpus.",
      input_schema: {
        type: "object",
        properties: { entityId: { type: ["integer", "null"] } },
        required: ["entityId"],
      },
    },
    maxTokens: 50,
  });

  if (model.ok && model.data.entityId != null) {
    const e = ents.find((x) => x.id === model.data.entityId);
    if (e) return { entityId: e.id, name: e.name };
  }
  // model off, returned null, or hallucinated an id -> deterministic fallback
  return keywordMatch(goal, ents);
}
