import "server-only";
import { structuredCall } from "@/lib/server/model";
import { getEntitiesForVersion } from "@/lib/db/records";
import { keywordMatch, keywordRoute, type GoalMatch, type AskRoute } from "./keyword";

export { keywordMatch, keywordRoute };
export type { GoalMatch, AskRoute };

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
    role: "classify",
    cacheSystem: true,
    system:
      "Map a learner's goal to the single best-matching concept id from this list, " +
      "or null if none fits. Return only an id from the list.\n\nCONCEPTS:\n" +
      conceptList,
    user: `Goal: ${goal}`,
    schemaName: "route",
    schema: {
      type: "object",
      properties: { entityId: { type: ["integer", "null"] } },
      required: ["entityId"],
      additionalProperties: false,
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

/** Route a message typed in the "Ask a follow-up, or set a new goal" box, given
 *  the concept the learner is currently reading. Unlike classifyGoal this is
 *  NOT obligated to return a concept: a clarification ("I don't get it", "explain
 *  by example") stays on the current idea and deepens it, rather than being
 *  misrouted to its nearest semantic neighbour. Only a message that clearly names
 *  a DIFFERENT concept switches; a genuinely new off-corpus topic falls to {gap}. */
export async function routeAsk(
  text: string,
  versionId: number,
  sessionId: string,
  current: { id: number; name: string } | null,
): Promise<AskRoute> {
  const ents = await getEntitiesForVersion(versionId);

  // No current concept (e.g. very first action) — there's nothing to deepen, so
  // treat it as a fresh goal.
  if (!current) {
    const m = await classifyGoal(text, versionId, sessionId);
    return "gap" in m ? { kind: "gap" } : { kind: "concept", entityId: m.entityId, name: m.name };
  }

  const conceptList = ents.map((e) => `${e.id}: ${e.name}`).join("\n");
  const model = await structuredCall<{
    intent: "follow_up" | "new_concept" | "off_topic";
    entityId: number | null;
  }>({
    sessionId,
    role: "classify",
    cacheSystem: true,
    system:
      `The learner is currently reading about "${current.name}". They typed a message ` +
      `in the follow-up box. Classify the intent:\n` +
      `- "follow_up": a clarification or request to go deeper on the CURRENT concept ` +
      `(e.g. "I don't get it", "explain by example", "why?", "say more"). Prefer this ` +
      `for any vague, meta, or clarifying message.\n` +
      `- "new_concept": they clearly want a DIFFERENT specific concept from the list — ` +
      `set entityId to that concept's id.\n` +
      `- "off_topic": a new topic that is NOT in the list.\n` +
      `Only choose new_concept when the message clearly names another concept; when in ` +
      `doubt prefer follow_up.\n\nCONCEPTS:\n` +
      conceptList,
    user: `Message: ${text}`,
    schemaName: "ask_route",
    schema: {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["follow_up", "new_concept", "off_topic"] },
        entityId: { type: ["integer", "null"] },
      },
      required: ["intent", "entityId"],
      additionalProperties: false,
    },
    maxTokens: 50,
  });

  if (model.ok) {
    const { intent, entityId } = model.data;
    if (intent === "follow_up") return { kind: "deepen" };
    if (intent === "new_concept" && entityId != null) {
      const e = ents.find((x) => x.id === entityId);
      if (e && e.id !== current.id) return { kind: "concept", entityId: e.id, name: e.name };
      return { kind: "deepen" }; // named the current concept (or a bad id) -> just deepen
    }
    if (intent === "off_topic") return { kind: "gap" };
  }
  // model off or unusable -> deterministic keyword route (strict switch threshold)
  return keywordRoute(text, ents, current);
}
