import "server-only";
import OpenAI from "openai";
import { openaiKey } from "../env";
import type { Provider, ProviderRequest, ProviderResult } from "./types";

// OpenAI adapter. Uses Structured Outputs (response_format json_schema, strict)
// to guarantee the output shape — the same anti-hallucination guarantee as
// Anthropic's strict tool-use (g1). Prompt caching is automatic on long static
// prefixes (the concept list), so `cacheSystem` is a no-op here.

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: openaiKey() ?? undefined });
  return _client;
}

export const openaiProvider: Provider = {
  name: "openai",
  async structured<T>(req: ProviderRequest): Promise<ProviderResult<T>> {
    try {
      const resp = await client().chat.completions.create({
        model: req.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.schemaName, schema: req.schema, strict: true },
        },
        max_completion_tokens: req.maxTokens,
      });
      const msg = resp.choices[0]?.message;
      if (msg?.refusal) return { ok: false, reason: `refusal: ${msg.refusal}` };
      const content = msg?.content;
      if (!content) return { ok: false, reason: "empty response" };
      return {
        ok: true,
        data: JSON.parse(content) as T,
        tokens: resp.usage?.total_tokens,
        model: req.model,
      };
    } catch (err) {
      return { ok: false, reason: `api-error: ${(err as Error).message}` };
    }
  },
};
