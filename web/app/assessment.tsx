"use client";

import { useEffect, useState } from "react";
import { quiz, grade, delta } from "./assess-actions";
import { recordPreQuiz } from "./journey";

// The doc-level pre/post check (Phase G). One question set, taken before learning
// (baseline) and after (gain); the payoff is the before→after delta — credit
// assignment (S1). Grading is deterministic on the server; this only collects
// answers and shows results. Self-contained: mounts as a panel in the learning view.

type Q = { id: number; ordinal: number; stem: string; options: string[] };
type Graded = {
  total: number;
  correct: number;
  perQuestion: { id: number; correct: boolean; answerIndex: number; chosenIndex: number; rationale: string | null }[];
};

export default function Assessment({
  versionId,
  sessionId,
  phase,
  onClose,
}: {
  versionId: number;
  sessionId: string;
  phase: "pre" | "post";
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<Q[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Graded | null>(null);
  const [deltaInfo, setDeltaInfo] = useState<{ pre: number | null; post: number | null; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    quiz(versionId).then((qs) => setQuestions(qs as Q[]));
  }, [versionId]);

  async function submit() {
    if (!questions || Object.keys(answers).length < questions.length || busy) return;
    setBusy(true);
    const g = await grade(sessionId, versionId, phase, answers);
    setResult(g);
    setDeltaInfo(await delta(sessionId, versionId));
    setBusy(false);
    // Feed the journey: on the pre-quiz, remember which questions they missed so
    // the personalized study sheet can focus there.
    if (phase === "pre" && questions) {
      const byId = new Map(questions.map((q) => [q.id, q]));
      const misses = g.perQuestion.filter((r) => !r.correct).map((r) => byId.get(r.id)?.stem ?? "").filter(Boolean);
      recordPreQuiz(versionId, misses, g.correct, g.total);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              {phase === "pre" ? "Quick check — before you start" : "Check again — what stuck?"}
            </h2>
            <p className="text-xs text-neutral-400">
              {phase === "pre"
                ? "A baseline. Answer honestly — we'll measure how far you move."
                : "The same questions. Let's see the gain."}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {questions == null ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : questions.length === 0 ? (
            <p className="text-sm text-neutral-500">No assessment was generated for this document.</p>
          ) : result ? (
            <Results questions={questions} result={result} delta={deltaInfo} phase={phase} versionId={versionId} />
          ) : (
            <ol className="space-y-5">
              {questions.map((q, i) => (
                <li key={q.id}>
                  <p className="text-sm font-medium text-neutral-800">
                    {i + 1}. {q.stem}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {q.options.map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: idx }))}
                        className={
                          "block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                          (answers[q.id] === idx
                            ? "border-neutral-900 bg-neutral-50 text-neutral-900"
                            : "border-neutral-200 text-neutral-600 hover:border-neutral-300")
                        }
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {questions && questions.length > 0 && !result && (
          <div className="border-t border-neutral-100 px-5 py-3">
            <button
              onClick={submit}
              disabled={Object.keys(answers).length < questions.length || busy}
              className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
            >
              {busy ? "Scoring…" : `Submit (${Object.keys(answers).length}/${questions.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Results({
  questions,
  result,
  delta,
  phase,
  versionId,
}: {
  questions: Q[];
  result: Graded;
  delta: { pre: number | null; post: number | null; total: number } | null;
  phase: "pre" | "post";
  versionId: number;
}) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const missed = result.perQuestion.filter((r) => !r.correct).length;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center">
        <div className="text-2xl font-semibold text-neutral-900">
          {result.correct} / {result.total}
        </div>
        {phase === "post" && delta && delta.pre != null ? (
          <p className="mt-1 text-sm text-neutral-600">
            You went from <b>{delta.pre}</b> → <b>{delta.post}</b> out of {delta.total}.
            {delta.post! > delta.pre
              ? " That's the learning, measured."
              : delta.post! === delta.pre
                ? " Same as before — the misses below are where to look next."
                : ""}
          </p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500">
            {missed === 0
              ? "Nailed it. Read on to go deeper, or check again after."
              : `${missed} to firm up — each is explained below, with where to learn it.`}
          </p>
        )}
      </div>

      <ol className="space-y-2.5">
        {result.perQuestion.map((r, i) => {
          const q = byId.get(r.id);
          if (!q) return null;
          return (
            <li
              key={r.id}
              className={
                "rounded-xl border p-3.5 " +
                (r.correct ? "border-neutral-100 bg-white" : "border-amber-200 bg-amber-50/40")
              }
            >
              <p className="text-sm font-medium text-neutral-800">
                {i + 1}. {q.stem}
              </p>

              {/* what you picked vs the answer — a real diff, not just "go study" */}
              <div className="mt-2 space-y-1 text-xs">
                {!r.correct && (
                  <p className="text-red-600">
                    <span className="font-medium">You chose:</span> {q.options[r.chosenIndex]}
                  </p>
                )}
                <p className="text-green-700">
                  <span className="font-medium">{r.correct ? "✓ Correct:" : "Answer:"}</span> {q.options[r.answerIndex]}
                </p>
              </div>

              {/* the teaching moment */}
              {r.rationale && (
                <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs leading-snug text-neutral-600">
                  {r.rationale}
                </p>
              )}

              {!r.correct && (
                <a
                  href={`/learn/${versionId}/understand`}
                  className="mt-2 inline-block text-xs font-medium text-neutral-700 underline-offset-2 hover:underline"
                >
                  Learn this →
                </a>
              )}
            </li>
          );
        })}
      </ol>

      <a
        href={`/learn/${versionId}/understand`}
        className="block rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-neutral-800"
      >
        {missed === 0 ? "Go deeper in the lessons" : "Study the misses"}
      </a>
    </div>
  );
}
