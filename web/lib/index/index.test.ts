import { describe, it, expect } from "vitest";
import { keywordRoute, routeFromIntent } from "./keyword";
import type { EntityRecord } from "@/lib/db/records";

const ent = (id: number, name: string): EntityRecord => ({
  id,
  name,
  type: "Concept",
  definition: null,
  abstraction: null,
  paradigm: null,
});

const ENTS: EntityRecord[] = [
  ent(1, "shannon information"),
  ent(2, "simon information"),
  ent(3, "critical technical practice"),
  ent(4, "credit assignment"),
];

const CURRENT = { id: 1 }; // currently reading "shannon information"

describe("keywordRoute — follow-up routing (deterministic fallback)", () => {
  it("a vague clarification deepens the current concept (the reported bug)", () => {
    // "explain" is a stopword; only "example" survives and matches no concept -> deepen, NOT misroute.
    expect(keywordRoute("I don't get it, explain by example", ENTS, CURRENT)).toEqual({
      kind: "deepen",
    });
  });

  it("a single incidental shared word does NOT yank you to a new concept", () => {
    // "practice" alone (one shared token, score 10 < 20) must not switch to "critical technical practice".
    expect(keywordRoute("can you give me more practice", ENTS, CURRENT)).toEqual({ kind: "deepen" });
  });

  it("clearly naming a different concept switches", () => {
    const r = keywordRoute("what about credit assignment?", ENTS, CURRENT);
    expect(r).toEqual({ kind: "concept", entityId: 4, name: "credit assignment" });
  });

  it("naming the current concept stays (deepen, never re-render the same page)", () => {
    expect(keywordRoute("more on shannon information", ENTS, CURRENT)).toEqual({ kind: "deepen" });
  });

  it("with no current concept, a non-matching message falls off-corpus", () => {
    expect(keywordRoute("explain by example", ENTS, null)).toEqual({ kind: "gap" });
  });

  it("two shared significant tokens is enough to switch", () => {
    const r = keywordRoute("tell me about critical technical practice", ENTS, CURRENT);
    expect(r).toEqual({ kind: "concept", entityId: 3, name: "critical technical practice" });
  });
});

describe("routeFromIntent — Re-register (SERVE_DESIGN §8)", () => {
  it("a clarification deepens the current concept", () => {
    expect(routeFromIntent("follow_up", null, ENTS, CURRENT)).toEqual({ kind: "deepen" });
  });

  it("an objection deepens (surfaces the why / rival side), never switches away", () => {
    expect(routeFromIntent("objection", null, ENTS, CURRENT)).toEqual({ kind: "deepen" });
  });

  it("naming a different concept switches", () => {
    expect(routeFromIntent("new_concept", 4, ENTS, CURRENT)).toEqual({
      kind: "concept",
      entityId: 4,
      name: "credit assignment",
    });
  });

  it("a situation indexes to the concept the model anchored it to", () => {
    expect(routeFromIntent("situation", 3, ENTS, CURRENT)).toEqual({
      kind: "concept",
      entityId: 3,
      name: "critical technical practice",
    });
  });

  it("a situation that anchors to nothing stays put (deepen), never fabricates a jump", () => {
    expect(routeFromIntent("situation", null, ENTS, CURRENT)).toEqual({ kind: "deepen" });
  });

  it("off_topic falls out of the corpus", () => {
    expect(routeFromIntent("off_topic", null, ENTS, CURRENT)).toEqual({ kind: "gap" });
  });

  it("naming the current concept stays (deepen, no pointless re-render)", () => {
    expect(routeFromIntent("new_concept", 1, ENTS, CURRENT)).toEqual({ kind: "deepen" });
  });
});
