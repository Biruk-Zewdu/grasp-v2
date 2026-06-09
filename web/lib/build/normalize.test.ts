import { describe, it, expect } from "vitest";
import { normalize, unitsForPrompt } from "./normalize";

// The normalizer is deterministic, no model/DB — so it's unit-testable directly.

describe("normalize", () => {
  it("splits paragraphs on blank lines with correct offsets", () => {
    const raw = "First paragraph here.\n\nSecond paragraph here.";
    const units = normalize(raw);
    expect(units).toHaveLength(2);
    expect(units[0].text).toBe("First paragraph here.");
    expect(units[1].text).toBe("Second paragraph here.");
    expect(units[0].paragraphIndex).toBe(0);
    expect(units[1].paragraphIndex).toBe(1);
    // offsets point back into the original string
    expect(raw.slice(units[1].charStart, units[1].charEnd)).toContain("Second paragraph");
  });

  it("tracks a running section heading", () => {
    const raw = "INTRODUCTION\n\nThe opening idea.\n\nThe second idea.";
    const units = normalize(raw);
    // heading-only block is not a paragraph; following paras carry the section
    expect(units.every((u) => u.section === "INTRODUCTION")).toBe(true);
    expect(units).toHaveLength(2);
  });

  it("drops lone page-number noise", () => {
    const raw = "Real content.\n\n42\n\nMore content.";
    const units = normalize(raw);
    expect(units.map((u) => u.text)).toEqual(["Real content.", "More content."]);
  });

  it("tags units with index and section for the extractor prompt", () => {
    const raw = "2.1 Methods\n\nWe did a thing.";
    const prompt = unitsForPrompt(normalize(raw));
    expect(prompt).toContain("[#0");
    expect(prompt).toContain("We did a thing.");
  });

  it("returns nothing for empty input", () => {
    expect(normalize("   ")).toHaveLength(0);
  });
});
