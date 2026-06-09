import "server-only";
import OpenAI from "openai";
import { openaiKey, liveEnabled, MODELS } from "@/lib/server/env";
import type { EnsembleLevel } from "@/lib/guide/types";

// Each persona tilts the model toward a different reasoning style.
// Same model, same artifact — diversity comes from temperature + instruction.
const PERSONAS: Record<EnsembleLevel, { name: string; instruction: string; temperature: number }[]> = {
  simple: [
    {
      name: "Factual",
      instruction:
        "Be precise and grounded. Prioritise definitions, concrete claims, and what the artifact says directly. Be concise.",
      temperature: 0.1,
    },
    {
      name: "Conceptual",
      instruction:
        "Focus on the big picture. Explain the underlying concepts, their relationships, and why they matter. Use analogies where helpful.",
      temperature: 0.7,
    },
  ],
  standard: [
    {
      name: "Factual",
      instruction:
        "Be precise and grounded. Prioritise definitions and what the artifact says directly.",
      temperature: 0.1,
    },
    {
      name: "Conceptual",
      instruction:
        "Focus on the big picture — underlying concepts, relationships, and implications.",
      temperature: 0.6,
    },
    {
      name: "Critical",
      instruction:
        "Examine edge cases, caveats, and counterarguments. Where does the standard view break down or need qualifying?",
      temperature: 0.8,
    },
  ],
  thorough: [
    {
      name: "Factual",
      instruction: "Be precise and grounded. Prioritise definitions and direct artifact claims.",
      temperature: 0.1,
    },
    {
      name: "Conceptual",
      instruction: "Focus on underlying concepts, their relationships, and why they matter.",
      temperature: 0.6,
    },
    {
      name: "Critical",
      instruction:
        "Examine edge cases, caveats, and counterarguments. Where does the standard view need qualifying?",
      temperature: 0.8,
    },
    {
      name: "Analogical",
      instruction:
        "Illuminate the ideas through concrete examples and vivid analogies that make them stick.",
      temperature: 0.7,
    },
    {
      name: "Pedagogical",
      instruction:
        "Answer as an experienced teacher would. Build understanding bottom-up, identify likely confusions, clarify them.",
      temperature: 0.5,
    },
  ],
};

const CONSENSUS_SYSTEM = `You are a Consensus LLM — a synthesis layer that reviews multiple AI responses to the same question and produces the most accurate, reliable final answer.

Your process:
1. Read all perspective responses carefully.
2. Identify points ALL (or most) perspectives agree on — these carry high confidence.
3. Identify specific contradictions or disagreements — flag them.
4. Synthesise a single final answer that reflects the consensus, resolves contradictions where possible, and honestly acknowledges genuine uncertainty where not.
5. Score agreement from 0–100 (100 = all perspectives said essentially the same thing; 0 = completely irreconcilable).

Rules:
- The final reply is the actual answer, NOT a meta-commentary on the perspectives. Never say "perspectives agree that…".
- Where perspectives disagree, resolve it if one is clearly more accurate; otherwise state the genuine uncertainty.
- Be concise — a focused briefing, not an essay.
- disagreements is an array of short strings naming specific contested points. Empty array if none.`;

export type EnsembleResult = {
  reply: string;
  headline: string | null;
  agreementScore: number;
  perspectives: { name: string; text: string }[];
  disagreements: string[];
};

function client(): OpenAI {
  const key = openaiKey();
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: key });
}

/** Run N persona-varied calls in parallel then synthesise with a Consensus LLM.
 *  Returns null when live mode is off or no key is present. */
export async function runEnsemble(
  question: string,
  history: string,
  artifact: string,
  constitution: string,
  level: EnsembleLevel,
): Promise<EnsembleResult | null> {
  if (!liveEnabled()) return null;

  const openai = client();
  const personas = PERSONAS[level];
  const model = MODELS.openai.reason;

  // ── 1. Perspectives (parallel) ─────────────────────────────────────────────
  const perspectiveResults = await Promise.all(
    personas.map(async (p) => {
      try {
        const resp = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                `${constitution}\n\nYOUR REASONING STYLE: ${p.instruction}\n\n` +
                `=== ARTIFACT ===\n${artifact}`,
            },
            {
              role: "user",
              content:
                (history ? `Conversation so far:\n${history}\n\n` : "") +
                `Question: ${question}`,
            },
          ],
          max_completion_tokens: 500,
          temperature: p.temperature,
        });
        return {
          name: p.name,
          text: resp.choices[0]?.message?.content?.trim() ?? "",
        };
      } catch {
        return { name: p.name, text: "" };
      }
    }),
  );

  const valid = perspectiveResults.filter((p) => p.text.length > 0);
  if (!valid.length) return null;

  // ── 2. Consensus synthesis ─────────────────────────────────────────────────
  const perspectiveBlock = valid
    .map((p, i) => `--- Perspective ${i + 1}: ${p.name} ---\n${p.text}`)
    .join("\n\n");

  const consensusSchema = {
    type: "object",
    properties: {
      reply: { type: "string" },
      headline: { type: ["string", "null"] },
      agreementScore: { type: "integer" },
      disagreements: { type: "array", items: { type: "string" } },
    },
    required: ["reply", "headline", "agreementScore", "disagreements"],
    additionalProperties: false,
  };

  try {
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: CONSENSUS_SYSTEM },
        {
          role: "user",
          content:
            `ORIGINAL QUESTION: ${question}\n\n` +
            `${perspectiveBlock}\n\n` +
            `Synthesise the best answer. Return JSON with:\n` +
            `- reply: the synthesised answer (direct prose, not meta)\n` +
            `- headline: a short title or null\n` +
            `- agreementScore: 0–100\n` +
            `- disagreements: array of short strings naming contested points ([] if none)`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "consensus", schema: consensusSchema, strict: true },
      },
      max_completion_tokens: 900,
    });

    const content = resp.choices[0]?.message?.content;
    if (!content) return null;

    const data = JSON.parse(content) as {
      reply: string;
      headline: string | null;
      agreementScore: number;
      disagreements: string[];
    };

    return {
      reply: data.reply?.trim() ?? "",
      headline: data.headline?.trim() ?? null,
      agreementScore: Math.max(0, Math.min(100, data.agreementScore ?? 50)),
      perspectives: valid,
      disagreements: data.disagreements ?? [],
    };
  } catch {
    // Consensus call failed — fall back to the most common perspective
    return {
      reply: valid[0].text,
      headline: null,
      agreementScore: 50,
      perspectives: valid,
      disagreements: [],
    };
  }
}
