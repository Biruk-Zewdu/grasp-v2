import type { TensionTable } from "@/lib/render";

// The browse catalog for the dashboard's left pane: the contested "big questions"
// (tension dimensions) and the "key ideas" (concept names).
export type Catalog = {
  questions: { id: number; text: string }[];
  ideas: { id: number; name: string }[];
};

// A key term in an answer: a real artifact concept the learner can hover (verbatim
// definition) or click to explore (SERVE_DESIGN §7a-b).
export type GlossTerm = { id: number; term: string; definition: string };

// A rung of a Foundations Path (start-from-the-basics, §7a-a): a real concept the
// learner climbs, with one line on why it matters.
export type PathRung = { id: number; name: string; why: string };

// An option-chip the agent attaches to a turn (SERVE_DESIGN §3a/§4): a real next
// question that lands on teachable corpus territory. Three uses, one field — ask
// back on a vague goal, offer 1-2 forward steps after an answer, or offer the
// basics ladder. Clicking it is just a normal turn.
export type Branch = { label: string; ask: string };

// One turn in the conversation (SERVE_DESIGN §3a). The agent returns one free-form
// `reply` — an answer, a question, or an orientation, whatever the input calls for —
// plus zero or more grounded attachments: an optional `headline`, branch chips, a
// verbatim tension table, sources, inline-glossed key terms. The shape is not
// prescribed; diversity emerges from which attachments are present.
export type AnswerCard = {
  question: string;
  headline: string | null; // optional short title for the heading / outline
  reply: string;
  table: TensionTable | null; // a pinned tension, rendered verbatim (cells never the model's)
  branches: Branch[]; // ask-back / forward / offer-basics chips
  sourceConceptIds: number[];
  outOfScope: boolean;
  glossary?: GlossTerm[]; // key terms in the reply, hover-glossed
  path?: PathRung[]; // a foundations ladder (when this card is a "start from the basics")
};
