import type { Step } from "@/lib/render";

// Serve-time session state. In v1 this lives CLIENT-SIDE (no accounts, nothing
// persisted server-side — see 02_DATA_MODEL.md). The client passes it to each
// server action and stores what comes back.
export type GuideState = {
  sessionId: string;
  target: number | null;
  seen: number[];
  grasped: number[];
  probed: number[];
  seenTensions: number[];
};

export type Coverage = { covered: number[]; total: number; grasped: boolean };

export type Advance = {
  step: Step;
  state: GuideState;
  gap?: boolean; // the goal/ask fell outside the corpus
  coverage?: Coverage; // present after a probe answer
  concept?: string; // a follow-up switched to this concept (breadcrumb label)
};

export function initialState(sessionId: string): GuideState {
  return { sessionId, target: null, seen: [], grasped: [], probed: [], seenTensions: [] };
}
