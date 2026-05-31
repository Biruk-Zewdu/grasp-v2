import "server-only";

// Server-only config. The ANTHROPIC_API_KEY is read ONLY here and in anthropic.ts,
// both `server-only` — importing either from a client component fails the build.
// There is NO NEXT_PUBLIC_* for the key; it never reaches the browser.

export type ServeMode = "template" | "live";

// Default is template: zero model calls, zero cost, no key required. The Guide
// works fully in template mode (records fix the content; the model only phrases).
export const SERVE_MODE: ServeMode =
  process.env.SERVE_MODE === "live" ? "live" : "template";

export const SERVE_CORPUS_VERSION = process.env.SERVE_CORPUS_VERSION ?? "v1";

// May 2026 model ids (per 7_build_playbook/01_STACK.md).
export const MODELS = {
  render: "claude-haiku-4-5-20251001", // phrase a record
  probe: "claude-haiku-4-5-20251001", // coverage of a probe rubric
  classify: "claude-sonnet-4-6", // goal/ask -> concept
} as const;

// App-level caps (the second layer under the Console hard spend limit).
export const BUDGET = {
  perSession: Number(process.env.BUDGET_PER_SESSION ?? 20),
  perHour: Number(process.env.BUDGET_PER_HOUR ?? 100),
};

/** The key, server-side only. null when unset. */
export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

/** Live model calls happen ONLY when explicitly enabled AND a key is present.
 *  No key => always template mode => never calls the API, never costs anything. */
export function liveEnabled(): boolean {
  return SERVE_MODE === "live" && !!anthropicKey();
}
