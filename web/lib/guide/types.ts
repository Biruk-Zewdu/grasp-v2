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

// One answer in the conversation. The agent FRAMES the question and answers it,
// grounded in the artifact; a pinned tension renders verbatim (cells never written
// by the model); sources pull provenance for the concepts it grounded on.
export type AnswerCard = {
  question: string;
  framing: string;
  prose: string;
  table: TensionTable | null;
  sourceConceptIds: number[];
  outOfScope: boolean;
  glossary?: GlossTerm[]; // key terms in the prose, hover-glossed
  path?: PathRung[]; // a foundations ladder (when this card is a "start from the basics")
};
