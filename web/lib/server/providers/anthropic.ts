import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicKey } from "../env";
import type { Provider, ProviderRequest, ProviderResult } from "./types";

// Anthropic adapter. Strict tool-use forces the output to fill the schema, so
// the model cannot add facts (g1). `cacheSystem` marks the static prefix
// cacheable (-90% on the repeated concept list).

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: anthropicKey() ?? undefined });
  return _client;
}

export const anthropicProvider: Provider = {
  name: "anthropic",
  async structured<T>(req: ProviderRequest): Promise<ProviderResult<T>> {
    try {
      const system = req.cacheSystem
        ? [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }]
        : req.system;

      const resp = await client().messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: system as never,
        messages: [{ role: "user", content: req.user }],
        tools: [
          {
            name: req.schemaName,
            description: `Return ${req.schemaName} via this tool.`,
            input_schema: req.schema as never,
          },
        ],
        tool_choice: { type: "tool", name: req.schemaName },
      });

      const block = resp.content.find((c) => c.type === "tool_use");
      if (!block || block.type !== "tool_use") return { ok: false, reason: "no tool_use" };
      return { ok: true, data: block.input as T };
    } catch (err) {
      return { ok: false, reason: `api-error: ${(err as Error).message}` };
    }
  },
};
