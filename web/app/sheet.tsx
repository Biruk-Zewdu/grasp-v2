"use client";

import { useEffect, useState } from "react";
import { Logo } from "./logo";
import {
  getJourney,
  sectionList,
  engagementScore,
  type Journey,
  type SectionMemory,
} from "./journey";

// The study sheet IS the learner's journey through First Principles — literally
// built, section by section, from what THEY did: the key idea they read, the
// reasoning operators they ran, the questions they asked. It's their memory of the
// document, in their order, not a generic summary. Pure client-side render of the
// journey (instant, free, truly personal). Sections they never opened are shown as
// gaps to fill — the sheet grows as they learn.

export default function Sheet({
  versionId,
  title,
  allSubtopics,
}: {
  versionId: number;
  title: string;
  allSubtopics: { id: number; title: string }[];
}) {
  const [journey, setJourney] = useState<Journey | null>(null);

  useEffect(() => {
    setJourney(getJourney(versionId));
  }, [versionId]);

  if (!journey) return null;

  const studied = sectionList(journey);
  const studiedIds = new Set(studied.map((s) => s.subtopicId));
  const notYet = allSubtopics.filter((s) => !studiedIds.has(s.id));
  const engaged = engagementScore(journey) >= 1;
  const totalMoves = studied.reduce((n, s) => n + s.operators.length + s.questions.length, 0);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">Your study sheet · {title}</span>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-10">
        {/* intro */}
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Built from your learning</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your study sheet</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          This is <em>your</em> journey through the document — the ideas you studied, the moves you
          made, the questions you asked. It grows as you learn from first principles.
        </p>

        {/* progress strip */}
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Pill>{studied.length}/{allSubtopics.length} sections studied</Pill>
          {totalMoves > 0 && <Pill>{totalMoves} interactions captured</Pill>}
          {journey.preScore && <Pill>pre-quiz {journey.preScore.correct}/{journey.preScore.total}</Pill>}
        </div>

        {!engaged ? (
          <Empty versionId={versionId} />
        ) : (
          <div className="mt-8 space-y-4">
            {studied.map((s, i) => (
              <SectionCard key={s.subtopicId} s={s} n={i + 1} versionId={versionId} />
            ))}

            {/* gaps to fill */}
            {notYet.length > 0 && (
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/50 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Not yet studied</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Study these from first principles to add them to your sheet:
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {notYet.map((s) => (
                    <a
                      key={s.id}
                      href={`/learn/${versionId}/understand`}
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                    >
                      {s.title} →
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <a href={`/learn/${versionId}/understand`} className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Keep learning
              </a>
              <a href={`/learn/${versionId}/quiz`} className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-800">
                Test myself
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SectionCard({ s, n, versionId }: { s: SectionMemory; n: number; versionId: number }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      {/* section header = the key idea */}
      <div className="border-b border-neutral-100 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{n}</span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-snug text-neutral-900">{s.headline || s.title}</h2>
            {s.recap && <p className="mt-1 text-sm leading-relaxed text-neutral-600">{s.recap}</p>}
          </div>
        </div>
      </div>

      {/* what the learner did here */}
      {(s.operators.length > 0 || s.questions.length > 0) ? (
        <div className="space-y-3 p-5">
          {s.operators.map((o, i) => (
            <div key={`op-${i}`} className="rounded-xl bg-neutral-50 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                You worked it: {o.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-700">{o.body}</p>
            </div>
          ))}
          {s.questions.map((qa, i) => (
            <div key={`qa-${i}`} className="rounded-xl border border-neutral-100 p-3">
              <p className="text-sm font-medium text-neutral-800">You asked: {qa.q}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{qa.a}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-3">
          <a
            href={`/learn/${versionId}/understand`}
            className="text-xs text-neutral-400 underline-offset-2 hover:text-neutral-700 hover:underline"
          >
            You read this — apply a reasoning move or ask a question to deepen it →
          </a>
        </div>
      )}
    </article>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-600">{children}</span>;
}

function Empty({ versionId }: { versionId: number }) {
  return (
    <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-8 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 text-lg">📝</div>
      <h2 className="text-base font-semibold text-neutral-900">Your sheet is blank — for now</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
        It fills in as you study from first principles. Read a section, apply a reasoning move,
        ask a question — each one becomes part of your sheet.
      </p>
      <a
        href={`/learn/${versionId}/understand`}
        className="mt-5 inline-block rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Start learning →
      </a>
    </div>
  );
}
