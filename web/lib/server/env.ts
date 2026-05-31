import "server-only";

// Server-only config. API keys are read ONLY in this module and the provider
// adapters (all `server-only`) — importing any from a client component fails the
// build. There is NO NEXT_PUBLIC_* for a key; they never reach the browser.

export type ServeMode = "template" | "live";
export type ProviderName = "openai" | "anthropic";
export type Role = "render" | "classify" | "probe";

// Default is template: zero model calls, zero cost, no key required. The Guide
// works fully in template mode (records fix the content; the model only phrases).
export const SERVE_MODE: ServeMode =
  process.env.SERVE_MODE === "live" ? "live" : "template";

export const SERVE_CORPUS_VERSION = process.env.SERVE_CORPUS_VERSION ?? "v1";

// The model is a swappable instrument (the project's thesis). Pick the provider
// with one env var; default OpenAI.
export const MODEL_PROVIDER: ProviderName =
  process.env.MODEL_PROVIDER === "anthropic" ? "anthropic" : "openai";

// Per-provider model ids by role (small render/probe, mid classify). All
// env-overridable — bump these as providers ship new models.
export const MODELS: Record<ProviderName, Record<Role, string>> = {
  openai: {
    render: process.env.OPENAI_MODEL_RENDER ?? "gpt-5.4-nano",
    classify: process.env.OPENAI_MODEL_CLASSIFY ?? "gpt-5.4-mini",
    probe: process.env.OPENAI_MODEL_PROBE ?? "gpt-5.4-nano",
  },
  anthropic: {
    render: process.env.ANTHROPIC_MODEL_RENDER ?? "claude-haiku-4-5-20251001",
    classify: process.env.ANTHROPIC_MODEL_CLASSIFY ?? "claude-sonnet-4-6",
    probe: process.env.ANTHROPIC_MODEL_PROBE ?? "claude-haiku-4-5-20251001",
  },
};

// App-level caps (the second layer under the provider's hard spend limit).
export const BUDGET = {
  perSession: Number(process.env.BUDGET_PER_SESSION ?? 20),
  perHour: Number(process.env.BUDGET_PER_HOUR ?? 100),
};

export function openaiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null;
}
export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}
export function providerKey(p: ProviderName): string | null {
  return p === "openai" ? openaiKey() : anthropicKey();
}

/** Live model calls happen ONLY when enabled AND the active provider has a key.
 *  No key => template mode => never calls the API, never costs anything. */
export function liveEnabled(): boolean {
  return SERVE_MODE === "live" && !!providerKey(MODEL_PROVIDER);
}
