import "server-only";

// Normalize uploaded text into addressable text units (paragraphs) with char
// offsets, so provenance can point precisely at a passage. A TS port of the v1
// build/normalize.py paragraph splitter — deterministic, no model. (V2_DESIGN §3)

export type TextUnit = {
  paragraphIndex: number;
  section: string | null;
  charStart: number;
  charEnd: number;
  text: string;
};

const HEADING = /^(?:\d+(?:\.\d+)*\.?\s+\S|[A-Z][A-Z ]{6,}$)/;
const NOISE = /^\d+$/; // lone page numbers

/** Split raw document text into paragraph text units, tracking the running
 *  section heading and exact char offsets into the original string. */
export function normalize(raw: string): TextUnit[] {
  const text = raw.replace(/\r\n/g, "\n");
  const units: TextUnit[] = [];
  let section: string | null = null;
  let para = 0;
  let cursor = 0;

  // Split on blank lines, but keep offsets by scanning the original.
  const blocks = text.split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const start = text.indexOf(block, cursor);
    cursor = start + block.length;
    const trimmed = block.trim();
    if (!trimmed || NOISE.test(trimmed)) continue;

    // A short ALLCAPS / numbered line updates the running section label.
    const firstLine = trimmed.split("\n")[0].trim();
    if (HEADING.test(firstLine) && firstLine.length < 80) {
      section = firstLine;
      // a heading-only block isn't a paragraph
      if (trimmed === firstLine) continue;
    }

    units.push({
      paragraphIndex: para++,
      section,
      charStart: start,
      charEnd: cursor,
      text: trimmed,
    });
  }
  return units;
}

/** Join text units back into a compact, labelled document for the extractor
 *  prompt — each unit tagged with its index so the model can cite it. */
export function unitsForPrompt(units: TextUnit[]): string {
  return units
    .map((u) => `[#${u.paragraphIndex}${u.section ? ` · ${u.section}` : ""}] ${u.text}`)
    .join("\n\n");
}
