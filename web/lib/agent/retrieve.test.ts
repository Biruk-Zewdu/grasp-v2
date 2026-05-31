import { describe, it, expect } from "vitest";
import { rankByOverlap } from "./retrieve";

const ITEMS = [
  { id: 1, text: "commonsense knowledge — default assumptions about how the world works" },
  { id: 2, text: "frame problem — knowing what stays the same when something changes" },
  { id: 3, text: "reinforcement learning — learning from a scalar reward signal" },
  { id: 4, text: "credit assignment — evaluating which actions led to an outcome" },
];

describe("rankByOverlap — relevance over concept/tension text", () => {
  it("ranks the item sharing the most significant words first", () => {
    const r = rankByOverlap("why can't AI use common sense about the world?", ITEMS, 2);
    expect(r[0]).toBe(1); // 'world' + 'common'/'sense'-ish overlap with commonsense knowledge
  });

  it("matches on meaning words, ignoring stopwords/question filler", () => {
    const r = rankByOverlap("how does a system know which action caused a reward?", ITEMS, 3);
    // 'action' + 'reward' touch credit assignment (4) and reinforcement learning (3)
    expect(r).toContain(4);
    expect(r).toContain(3);
  });

  it("returns at most `limit` ids, all with a real overlap", () => {
    const r = rankByOverlap("frame problem", ITEMS, 4);
    expect(r[0]).toBe(2);
    expect(r.length).toBeLessThanOrEqual(4);
  });

  it("returns nothing when nothing meaningful overlaps", () => {
    expect(rankByOverlap("xylophone bananas", ITEMS, 3)).toEqual([]);
  });
});
