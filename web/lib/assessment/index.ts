import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { assessment, assessmentQuestion, assessmentResponse, claim } from "@/lib/db/schema";
import { structuredCall } from "@/lib/server/model";

// Doc-level pre/post assessment (Phase G / V2_DESIGN §6). ONE question set per
// artifact, generated once at build time from the document's CLAIMS, used for both
// the pre (baseline) and post (gain) check. Grading is DETERMINISTIC against the
// stored answer key — the model only authors the questions, never scores. The
// pre→post delta is credit assignment (S1): measuring what the learning moved.

export type QuizQuestion = {
  id: number;
  ordinal: number;
  stem: string;
  options: string[];
  // answerIndex/rationale are NOT sent to the client before answering.
};

export type GradedQuestion = QuizQuestion & {
  answerIndex: number;
  rationale: string | null;
};

const GEN_SYSTEM =
  "You are writing a short multiple-choice check for a learner, grounded ENTIRELY in the claims " +
  "below (drawn from one document). Rules:\n" +
  "1. Write 4–6 questions that test UNDERSTANDING of the document's substantive claims — not " +
  "trivia, not wording. Span the material.\n" +
  "2. Each question: a clear stem, exactly 4 options, exactly one correct (answer_index 0–3), and " +
  "a one-line rationale grounded in the claim. Distractors must be plausible but clearly wrong " +
  "per the document.\n" +
  "3. Ground every question in the given claims — never invent facts beyond them. Reference the " +
  "claim id you used.";

const GEN_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stem: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer_index: { type: "integer" },
          claim_id: { type: ["integer", "null"] },
          rationale: { type: "string" },
        },
        required: ["stem", "options", "answer_index", "claim_id", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

type GenQ = {
  stem: string;
  options: string[];
  answer_index: number;
  claim_id: number | null;
  rationale: string;
};

/** Generate + persist the assessment for a version (called once at build time).
 *  No-op (returns 0) in template/no-key mode — assessment needs the live model. */
export async function generateAssessment(versionId: number, sessionId: string): Promise<number> {
  // already built?
  const existing = await db
    .select({ id: assessment.id })
    .from(assessment)
    .where(eq(assessment.corpusVersion, versionId))
    .limit(1);
  if (existing[0]) return 0;

  const claims = await db
    .select({ id: claim.id, proposition: claim.proposition, conceptIds: claim.conceptIds })
    .from(claim)
    .where(eq(claim.corpusVersion, versionId));
  if (claims.length < 2) return 0; // too thin to assess

  const claimList = claims.map((c) => `[claim ${c.id}] ${c.proposition}`).join("\n");
  const res = await structuredCall<{ questions: GenQ[] }>({
    sessionId,
    role: "extract",
    system: GEN_SYSTEM,
    user: `CLAIMS:\n${claimList}`,
    schemaName: "quiz",
    schema: GEN_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
  });
  if (!res.ok) return 0;

  // validate questions (well-formed, in-range key, ≥2 options)
  const claimIds = new Set(claims.map((c) => c.id));
  const valid = res.data.questions.filter(
    (q) => q.options.length >= 2 && q.answer_index >= 0 && q.answer_index < q.options.length && q.stem.trim(),
  );
  if (!valid.length) return 0;

  const [a] = await db
    .insert(assessment)
    .values({ corpusVersion: versionId })
    .returning({ id: assessment.id });

  await db.insert(assessmentQuestion).values(
    valid.map((q, i) => ({
      assessmentId: a.id,
      ordinal: i,
      stem: q.stem,
      options: q.options,
      answerIndex: q.answer_index,
      claimId: q.claim_id != null && claimIds.has(q.claim_id) ? q.claim_id : null,
      rationale: q.rationale,
    })),
  );
  return valid.length;
}

/** The questions for a version, WITHOUT the answer key (safe to send pre-answer). */
export async function getQuiz(versionId: number): Promise<QuizQuestion[]> {
  const a = await db
    .select({ id: assessment.id })
    .from(assessment)
    .where(eq(assessment.corpusVersion, versionId))
    .limit(1);
  if (!a[0]) return [];
  const qs = await db
    .select({
      id: assessmentQuestion.id,
      ordinal: assessmentQuestion.ordinal,
      stem: assessmentQuestion.stem,
      options: assessmentQuestion.options,
    })
    .from(assessmentQuestion)
    .where(eq(assessmentQuestion.assessmentId, a[0].id));
  return qs.sort((x, y) => x.ordinal - y.ordinal);
}

export type GradeResult = {
  total: number;
  correct: number;
  perQuestion: { id: number; correct: boolean; answerIndex: number; chosenIndex: number; rationale: string | null }[];
};

/** Grade a submission DETERMINISTICALLY against the stored key, and record each
 *  response (for the pre→post delta). `answers` maps questionId → chosen index. */
export async function gradeAndRecord(
  versionId: number,
  phase: "pre" | "post",
  answers: Record<number, number>,
  userId: string,
): Promise<GradeResult> {
  const ids = Object.keys(answers).map(Number);
  if (!ids.length) return { total: 0, correct: 0, perQuestion: [] };

  const keys = await db
    .select({
      id: assessmentQuestion.id,
      answerIndex: assessmentQuestion.answerIndex,
      rationale: assessmentQuestion.rationale,
    })
    .from(assessmentQuestion)
    .where(inArray(assessmentQuestion.id, ids));

  const perQuestion = keys.map((k) => {
    const chosen = answers[k.id];
    return {
      id: k.id,
      correct: chosen === k.answerIndex,
      answerIndex: k.answerIndex,
      chosenIndex: chosen,
      rationale: k.rationale,
    };
  });
  const correct = perQuestion.filter((q) => q.correct).length;

  // record (best-effort)
  try {
    await db.insert(assessmentResponse).values(
      perQuestion.map((q) => ({
        userId,
        questionId: q.id,
        phase,
        chosenIndex: q.chosenIndex,
        correct: q.correct,
      })),
    );
  } catch {
    /* recording is best-effort */
  }

  return { total: perQuestion.length, correct, perQuestion };
}

/** The pre→post delta for a user on a version (the payoff screen). */
export async function getDelta(
  versionId: number,
  userId: string,
): Promise<{ pre: number | null; post: number | null; total: number }> {
  const a = await db
    .select({ id: assessment.id })
    .from(assessment)
    .where(eq(assessment.corpusVersion, versionId))
    .limit(1);
  if (!a[0]) return { pre: null, post: null, total: 0 };
  const qids = (
    await db
      .select({ id: assessmentQuestion.id })
      .from(assessmentQuestion)
      .where(eq(assessmentQuestion.assessmentId, a[0].id))
  ).map((q) => q.id);
  if (!qids.length) return { pre: null, post: null, total: 0 };

  const score = async (phase: "pre" | "post"): Promise<number | null> => {
    const rows = await db
      .select({ correct: assessmentResponse.correct })
      .from(assessmentResponse)
      .where(
        and(
          eq(assessmentResponse.userId, userId),
          eq(assessmentResponse.phase, phase),
          inArray(assessmentResponse.questionId, qids),
        ),
      );
    return rows.length ? rows.filter((r) => r.correct).length : null;
  };
  return { pre: await score("pre"), post: await score("post"), total: qids.length };
}
