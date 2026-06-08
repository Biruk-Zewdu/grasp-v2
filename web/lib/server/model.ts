import "server-only";
import { liveEnabled, MODEL_PROVIDER, MODELS, type Role } from "./env";
import { checkAndConsume } from "./budget";
import { openaiProvider } from "./providers/openai";
import { anthropicProvider } from "./providers/anthropic";
import type { ProviderResult } from "./providers/types";

// The one seam every model call goes through. Resolves the active provider +
// model by role, enforces template-mode and the budget cap, and dispatches.
// Returns ok:false — never throws — when live mode is off, the budget is spent,
// or the provider errors, so every caller falls back to template output and
// incurs zero cost.

const PROVIDERS = { openai: openaiProvider, anthropic: anthropicProvider } as const;

export type StructuredResult<T> = ProviderResult<T>;

export async function structuredCall<T>(opts: {
  sessionId: string; // identity key (uuid): anon-auth uid, else client session uuid
  role: Role;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  cacheSystem?: boolean;
}): Promise<StructuredResult<T>> {
  if (!liveEnabled()) return { ok: false, reason: "template-mode" };

  const budget = await checkAndConsume(opts.sessionId);
  if (!budget.ok) return { ok: false, reason: budget.reason };

  const provider = PROVIDERS[MODEL_PROVIDER];
  return provider.structured<T>({
    model: MODELS[MODEL_PROVIDER][opts.role],
    system: opts.system,
    user: opts.user,
    schemaName: opts.schemaName,
    schema: opts.schema,
    maxTokens: opts.maxTokens ?? 1024,
    cacheSystem: opts.cacheSystem,
  });
}
