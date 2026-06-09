// Client-safe operator catalog — the course's reasoning moves as plain data (no
// server-only / DB deps), so client components can render the operator bar. The
// server-side application logic lives in ./index.ts.

export type OperatorKey = "decompose" | "contrast" | "analogize" | "apply" | "steelman";

export type Operator = { key: OperatorKey; label: string; blurb: string };

export const OPERATORS: Record<OperatorKey, Operator> = {
  decompose: { key: "decompose", label: "Break it down", blurb: "into its parts (Simon's watchmaker)" },
  contrast: { key: "contrast", label: "Find the tension", blurb: "the opposed view, when each holds" },
  analogize: { key: "analogize", label: "Make an analogy", blurb: "map it to something familiar" },
  apply: { key: "apply", label: "Apply it", blurb: "run the idea on a new case" },
  steelman: { key: "steelman", label: "Steelman the rival", blurb: "the strongest opposing case" },
};

/** Which operators to surface for a section (most fitting first; the page shows ~4). */
export function operatorsForSection(): Operator[] {
  return [OPERATORS.decompose, OPERATORS.apply, OPERATORS.analogize, OPERATORS.contrast, OPERATORS.steelman];
}

export type OperatorResult = { title: string; body: string };
