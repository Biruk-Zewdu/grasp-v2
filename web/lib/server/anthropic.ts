import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicKey, liveEnabled } from "./env";
import { checkAndConsume } from "./budget";

// The ONLY module that constructs the Anthropic client. server-only: a client
// component importing this fails the build, so the key cannot reach the browser.

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: anthropicKey() ?? undefined });
  return _client;
}

export type StructuredResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

/**
 * One strict tool-use call that returns the tool input as typed JSON. Guarantees
 * the output shape (the model can only fill the tool schema), which is how we
 * stop the renderer inventing facts (g1). Returns ok:false — never throws — when
 * live mode is off, the budget is spent, or the API errors, so every caller can
 * fall back to template/cached output and incur zero cost.
 *
 * `cacheSystem` marks the system prompt cacheable (-90% on the repeated
 * concept-list prefix used by the classifier).
 */
export async function structuredCall<T>(opts: {
  sessionId: string;
  model: string;
  system: string;
  user: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens?: number;
  cacheSystem?: boolean;
}): Promise<StructuredResult<T>> {
  if (!liveEnabled()) return { ok: false, reason: "template-mode" };

  const budget = checkAndConsume(opts.sessionId);
  if (!budget.ok) return { ok: false, reason: budget.reason };

  try {
    const system = opts.cacheSystem
      ? [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }]
      : opts.system;

    const resp = await client().messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      system: system as never,
      messages: [{ role: "user", content: opts.user }],
      tools: [
        {
          name: opts.tool.name,
          description: opts.tool.description,
          input_schema: opts.tool.input_schema as never,
        },
      ],
      tool_choice: { type: "tool", name: opts.tool.name },
    });

    const block = resp.content.find((c) => c.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return { ok: false, reason: "no tool_use in response" };
    }
    return { ok: true, data: block.input as T };
  } catch (err) {
    // an API hiccup must never crash a gesture or retry-loop into cost
    return { ok: false, reason: `api-error: ${(err as Error).message}` };
  }
}
