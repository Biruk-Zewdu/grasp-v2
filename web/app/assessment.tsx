"use client";

import { useEffect, useState } from "react";
import { quiz, grade, delta } from "./assess-actions";

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
            <Results questions={questions} result={result} delta={deltaInfo} phase={phase} />
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
}: {
  questions: Q[];
  result: Graded;
  delta: { pre: number | null; post: number | null; total: number } | null;
  phase: "pre" | "post";
}) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center">
        <div className="text-2xl font-semibold text-neutral-900">
          {result.correct} / {result.total}
        </div>
        {phase === "post" && delta && delta.pre != null ? (
          <p className="mt-1 text-sm text-neutral-600">
            You went from <b>{delta.pre}</b> → <b>{delta.post}</b> out of {delta.total}.
            {delta.post! > delta.pre ? " That's the learning, measured." : ""}
          </p>
        ) : (
          <p className="mt-1 text-xs text-neutral-400">
            {phase === "pre" ? "Baseline saved. Now go learn — then check again." : "Saved."}
          </p>
        )}
      </div>

      <ol className="space-y-3">
        {result.perQuestion.map((r, i) => {
          const q = byId.get(r.id);
          if (!q) return null;
          return (
            <li key={r.id} className="rounded-lg border border-neutral-100 p-3">
              <p className="text-sm font-medium text-neutral-800">
                {i + 1}. {q.stem}
              </p>
              <p className={"mt-1 text-xs " + (r.correct ? "text-green-700" : "text-red-600")}>
                {r.correct ? "✓ Correct" : "✗"} — {q.options[r.answerIndex]}
              </p>
              {r.rationale && <p className="mt-1 text-xs leading-snug text-neutral-500">{r.rationale}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
