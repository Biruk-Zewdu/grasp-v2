import type { TensionTable } from "@/lib/render";

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
};
