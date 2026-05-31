// Deterministic relevance ranking over artifact text (no model, no DB) — the
// scoring half of the agent's `search` tool. Pure, so it unit-tests in isolation.

const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "is", "are", "and", "or", "for", "be",
  "why", "how", "when", "what", "which", "does", "do", "did", "can", "cant", "with",
  "about", "between", "vs", "versus", "i", "you", "it", "its", "just", "use", "using",
  "make", "get", "got", "know", "system", "ai", "machine", "machines",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Rank items by how many significant query words their text contains, with a
 *  bonus for a whole-phrase substring. Returns up to `limit` ids that have any
 *  real overlap, best first. */
export function rankByOverlap(
  query: string,
  items: { id: number; text: string }[],
  limit: number,
): number[] {
  const q = query.toLowerCase();
  const qTokens = new Set(tokens(query));
  if (!qTokens.size) return [];

  // crude stemming: tokens match exactly (+2) or share a >=4-char prefix (+1),
  // so "action" reaches "actions", "common" reaches "commonsense".
  const fuzzy = (qt: string, its: string[]) =>
    its.some((t) => (t.startsWith(qt) || qt.startsWith(t)) && Math.min(t.length, qt.length) >= 4);

  const scored = items.map((it) => {
    const itTokenList = tokens(it.text);
    const itTokens = new Set(itTokenList);
    let score = 0;
    for (const t of qTokens) {
      if (itTokens.has(t)) score += 2;
      else if (fuzzy(t, itTokenList)) score += 1;
    }
    // bonus if the concept/tension's name (before the em dash) appears whole
    const head = it.text.split("—")[0]?.trim().toLowerCase();
    if (head && head.length > 3 && q.includes(head)) score += 5;
    return { id: it.id, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit)
    .map((s) => s.id);
}
