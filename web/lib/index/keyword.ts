// Pure, model-free routing over the concept list. No server-only / DB / network
// imports (type-only EntityRecord) so it runs in plain unit tests. index.ts adds
// the model-backed layer on top and re-exports these.
import type { EntityRecord } from "@/lib/db/records";

export type GoalMatch = { entityId: number; name: string } | { gap: true };

/** A follow-up routes to one of three outcomes: deepen the CURRENT concept,
 *  switch to a clearly-named different concept, or fall off-corpus. */
export type AskRoute =
  | { kind: "deepen" }
  | { kind: "concept"; entityId: number; name: string }
  | { kind: "gap" };

// What the learner's message IS, in registration terms (SERVE_DESIGN §8). All
// four are state updates feeding the one difference function — not just a lookup.
export type AskIntent = "follow_up" | "objection" | "new_concept" | "situation" | "off_topic";

/** Map a classified intent to a route. Clarifications and objections deepen the
 *  current concept (the why / rival side); a named concept or an anchored
 *  situation switches; anything that anchors to nothing stays put rather than
 *  fabricating a jump; off_topic falls off-corpus. */
export function routeFromIntent(
  intent: AskIntent,
  entityId: number | null,
  ents: EntityRecord[],
  current: { id: number },
): AskRoute {
  if (intent === "follow_up" || intent === "objection") return { kind: "deepen" };
  if (intent === "new_concept" || intent === "situation") {
    if (entityId == null) return { kind: "deepen" };
    const e = ents.find((x) => x.id === entityId);
    if (e && e.id !== current.id) return { kind: "concept", entityId: e.id, name: e.name };
    return { kind: "deepen" }; // anchored to the current concept (or a bad id) -> stay
  }
  return { kind: "gap" }; // off_topic
}

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

/** Score the best-matching concept for a free-text query. A whole concept name
 *  present in the text scores ~100; otherwise score is 10 per shared significant
 *  token. null when nothing overlaps. Shared by the goal matcher and the
 *  follow-up router (which apply different thresholds to the same score). */
function scoreBest(text: string, ents: EntityRecord[]): { e: EntityRecord; score: number } | null {
  const g = text.toLowerCase();
  const goalTokens = new Set(tokens(text));
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
  return best;
}

/** Pure keyword match over the concept list (no model). Used for a NEW goal,
 *  where we're generous: any token overlap is enough to pick a concept. */
export function keywordMatch(goal: string, ents: EntityRecord[]): GoalMatch {
  const best = scoreBest(goal, ents);
  return best ? { entityId: best.e.id, name: best.e.name } : { gap: true };
}

// A follow-up re-routes ONLY on a clear new-concept signal: a whole concept name,
// or >=2 shared significant tokens (score >= 20). A single shared word — or only
// meta words like "explain"/"example", which are stopwords and score 0 — is NOT
// enough to abandon the current idea; it deepens instead. This is the deterministic
// fallback for when the model is off (template mode) or unusable.
const CLEAR_SWITCH = 20;
export function keywordRoute(
  text: string,
  ents: EntityRecord[],
  current: { id: number } | null,
): AskRoute {
  const best = scoreBest(text, ents);
  if (best && best.score >= CLEAR_SWITCH && best.e.id !== current?.id) {
    return { kind: "concept", entityId: best.e.id, name: best.e.name };
  }
  return current ? { kind: "deepen" } : { kind: "gap" };
}
