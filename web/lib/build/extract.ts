import "server-only";
import { structuredCall } from "@/lib/server/model";
import { unitsForPrompt, type TextUnit } from "./normalize";

// The extraction operators (V2_DESIGN §3): turn uploaded text into a TYPED,
// GROUNDED, possibly-contested artifact. This is where "intelligence in the
// design" lives in v2 — the LLM executes a fixed, course-derived procedure into
// a strict schema; it does not freely generate. The schema + the operators are
// the design, not the weights.
//
// Tension is DETECTED, not required (the v1 rigidity we dropped): the model
// returns hasTension=false when the document presents no genuine contested fork,
// and never fabricates one. Floor = grounded concepts + claims; ceiling = a
// preserved two-sided tension when it truly exists.

export type ExtractedConcept = {
  name: string;
  definition: string;
  paragraphRefs: number[]; // text-unit indices grounding this concept
};

export type ExtractedRelation = {
  from: string; // concept name
  to: string; // concept name
  relType:
    | "generalizes"
    | "specializes"
    | "causes"
    | "enables"
    | "contradicts"
    | "composed_of"
    | "proposed_by"
    | "exemplified_by"
    | "addresses"
    | "extends";
  evidence: string;
};

export type ExtractedClaim = {
  proposition: string;
  conceptNames: string[];
  claimType:
    | "causal"
    | "correlative"
    | "contradictory"
    | "conditional"
    | "definitional"
    | "compositional"
    | "analogical";
  thinker: string | null;
  paradigmLabel: string | null; // free-text — any doc, not the course enum
  conditions: string | null;
  paragraphRefs: number[];
};

export type ExtractedTension = {
  dimension: string; // the contested question
  sideALabel: string; // free-text paradigm/side name
  sideAClaim: string; // proposition for side A
  sideAConditions: string; // when side A holds
  sideAThinker: string | null;
  sideBLabel: string;
  sideBClaim: string;
  sideBConditions: string;
  sideBThinker: string | null;
};

export type ExtractedSubtopic = {
  title: string;
  summary: string; // one line: what you'll grasp
  conceptNames: string[];
};

export type Artifact = {
  title: string; // a short title for the document
  concepts: ExtractedConcept[];
  relations: ExtractedRelation[];
  claims: ExtractedClaim[];
  hasTension: boolean;
  tension: ExtractedTension | null; // present iff hasTension
  subtopics: ExtractedSubtopic[]; // the decomposition (lesson rail)
};

const OPERATORS =
  "You are the extraction engine for Grasp — a study tool whose intelligence is in a " +
  "TYPED KNOWLEDGE REPRESENTATION, not in free generation. Execute these operators over the " +
  "document below and emit ONLY the structured artifact. Rules, without exception:\n" +
  "1. GROUND EVERYTHING. Every concept, claim, and tension must come from the document's actual " +
  "content. Cite the paragraph indices ([#N]) you drew each from. Never invent facts, names, or " +
  "numbers that are not in the text.\n" +
  "2. CONCEPTS: the meaningful units the document is built from (Simon's near-decomposability) — " +
  "name + a faithful one-to-three-sentence definition in the document's own terms.\n" +
  "3. RELATIONS: how concepts connect (generalizes/causes/enables/composed_of/contradicts/…), " +
  "with a short evidence phrase. Only relations the text supports.\n" +
  "4. CLAIMS: the document's substantive assertions, each tied to the concepts it is about, with " +
  "its type and (if the text gives one) the thinker and the conditions under which it holds.\n" +
  "5. TENSION — DETECT, DO NOT FORCE. Set hasTension=true ONLY if the document genuinely presents " +
  "a CONTESTED point: two defensible, opposed positions on the same question, each holding under " +
  "different conditions. If it does, fill `tension` with both sides VERBATIM-faithful to the text " +
  "and the conditions each holds under. If the document presents no real fork, set " +
  "hasTension=false and tension=null. NEVER manufacture a disagreement that isn't there.\n" +
  "6. SUBTOPICS: 3–6 sections that decompose the document bottom-up into a sensible learning " +
  "order, each naming the concepts it covers and one line on what the learner will grasp.\n" +
  "7. Be faithful and economical — the artifact is the document's structure, not a summary you " +
  "embellish.";

const ARTIFACT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          definition: { type: "string" },
          paragraphRefs: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "definition", "paragraphRefs"],
        additionalProperties: false,
      },
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          relType: {
            type: "string",
            enum: [
              "generalizes",
              "specializes",
              "causes",
              "enables",
              "contradicts",
              "composed_of",
              "proposed_by",
              "exemplified_by",
              "addresses",
              "extends",
            ],
          },
          evidence: { type: "string" },
        },
        required: ["from", "to", "relType", "evidence"],
        additionalProperties: false,
      },
    },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          proposition: { type: "string" },
          conceptNames: { type: "array", items: { type: "string" } },
          claimType: {
            type: "string",
            enum: [
              "causal",
              "correlative",
              "contradictory",
              "conditional",
              "definitional",
              "compositional",
              "analogical",
            ],
          },
          thinker: { type: ["string", "null"] },
          paradigmLabel: { type: ["string", "null"] },
          conditions: { type: ["string", "null"] },
          paragraphRefs: { type: "array", items: { type: "integer" } },
        },
        required: [
          "proposition",
          "conceptNames",
          "claimType",
          "thinker",
          "paradigmLabel",
          "conditions",
          "paragraphRefs",
        ],
        additionalProperties: false,
      },
    },
    hasTension: { type: "boolean" },
    tension: {
      type: ["object", "null"],
      properties: {
        dimension: { type: "string" },
        sideALabel: { type: "string" },
        sideAClaim: { type: "string" },
        sideAConditions: { type: "string" },
        sideAThinker: { type: ["string", "null"] },
        sideBLabel: { type: "string" },
        sideBClaim: { type: "string" },
        sideBConditions: { type: "string" },
        sideBThinker: { type: ["string", "null"] },
      },
      required: [
        "dimension",
        "sideALabel",
        "sideAClaim",
        "sideAConditions",
        "sideAThinker",
        "sideBLabel",
        "sideBClaim",
        "sideBConditions",
        "sideBThinker",
      ],
      additionalProperties: false,
    },
    subtopics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          conceptNames: { type: "array", items: { type: "string" } },
        },
        required: ["title", "summary", "conceptNames"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "concepts", "relations", "claims", "hasTension", "tension", "subtopics"],
  additionalProperties: false,
} as const;

/** Run the extraction operators over normalized text units. Returns the typed
 *  artifact, or null in template/no-key mode (the caller surfaces a friendly
 *  "live mode needed to build" — extraction is the one thing template can't fake). */
export async function extractArtifact(
  units: TextUnit[],
  sessionId: string,
): Promise<Artifact | null> {
  const res = await structuredCall<Artifact>({
    sessionId,
    role: "extract",
    system: OPERATORS,
    user: `DOCUMENT (paragraphs tagged [#index]):\n\n${unitsForPrompt(units)}`,
    schemaName: "artifact",
    schema: ARTIFACT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4000,
  });
  if (!res.ok) return null;
  const a = res.data;
  // Normalize the detected-tension invariant defensively (the model can't be
  // trusted to keep hasTension and tension perfectly in sync).
  if (!a.hasTension) a.tension = null;
  if (a.tension == null) a.hasTension = false;
  return a;
}
