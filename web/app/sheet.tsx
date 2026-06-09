"use client";

import { useEffect, useState } from "react";
import { Logo } from "./logo";
import { defaultSheet } from "./sheet-actions";
import { getJourney, type Journey, type SectionMemory } from "./journey";
import type { DefaultSheet, DefaultSection } from "@/lib/sheet";

// The study sheet — COMPLETE by default, PERSONAL where you engaged. Every section
// of the document always has a key idea + exam-ready takeaways (built from the
// artifact). Sections the student actually studied get a "studied" marker plus
// THEIR own captured work (the reasoning operators they ran, the questions they
// asked) layered in — so the sheet is both immediately useful and increasingly
// theirs as they learn.

export default function Sheet({
  versionId,
  title,
}: {
  versionId: number;
  title: string;
}) {
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const [sheet, setSheet] = useState<DefaultSheet | null | "loading">("loading");
  const [journey, setJourney] = useState<Journey | null>(null);

  useEffect(() => {
    setJourney(getJourney(versionId));
    defaultSheet(sessionId, versionId).then((d) => setSheet(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  const memList = memByList(journey);
  const studiedCount = sheet !== "loading" && sheet ? sheet.sections.filter((s) => memByHas(memList, s.subtopicId)).length : 0;

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">Study sheet · {title}</span>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 py-10">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Exam-ready · grows as you learn</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Study sheet</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          The whole document, section by section. Sections you study from first principles get your
          own work layered in.
        </p>

        {sheet === "loading" ? (
          <SheetSkeleton />
        ) : sheet == null ? (
          <p className="mt-8 rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
            Building the study sheet needs the live model. Set <code>SERVE_MODE=live</code> with an API key.
          </p>
        ) : (
          <>
            {studiedCount > 0 && (
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-900" />
                {studiedCount}/{sheet.sections.length} sections studied — your work is in
              </div>
            )}
            <div className="mt-6 space-y-4">
              {sheet.sections.map((s, i) => (
                <SectionCard key={s.subtopicId} s={s} n={i + 1} mem={memBy(memList, s.subtopicId)} versionId={versionId} />
              ))}
            </div>

            <div className="mt-8 flex gap-3">
              <a href={`/learn/${versionId}/understand`} className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Study from first principles
              </a>
              <a href={`/learn/${versionId}/quiz`} className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-800">
                Test myself
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SectionCard({
  s,
  n,
  mem,
  versionId,
}: {
  s: DefaultSection;
  n: number;
  mem: SectionMemory | undefined;
  versionId: number;
}) {
  const studied = !!mem && (mem.operators.length > 0 || mem.questions.length > 0);
  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{n}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold leading-snug text-neutral-900">{s.title}</h2>
              {studied && <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">studied</span>}
            </div>
            {s.keyIdea && <p className="mt-1 text-sm leading-relaxed text-neutral-600">{s.keyIdea}</p>}
          </div>
        </div>

        {/* exam-ready takeaways (always present) */}
        {s.takeaways.length > 0 && (
          <ul className="mt-3 space-y-1.5 pl-9">
            {s.takeaways.map((t, i) => (
              <li key={i} className="flex gap-2 text-sm text-neutral-700">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                <span className="leading-snug">{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* the student's own work, if they engaged here */}
      {studied && mem && (
        <div className="space-y-2.5 border-t border-neutral-100 bg-neutral-50/60 p-5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Your work here</p>
          {mem.operators.map((o, i) => (
            <div key={`op-${i}`} className="rounded-xl bg-white p-3">
              <p className="text-[11px] font-medium text-neutral-500">{o.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-700">{o.body}</p>
            </div>
          ))}
          {mem.questions.map((qa, i) => (
            <div key={`qa-${i}`} className="rounded-xl bg-white p-3">
              <p className="text-sm font-medium text-neutral-800">Q: {qa.q}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-600">{qa.a}</p>
            </div>
          ))}
        </div>
      )}

      {/* not engaged yet → nudge */}
      {!studied && (
        <a
          href={`/learn/${versionId}/understand`}
          className="block border-t border-neutral-100 px-5 py-2.5 text-xs text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
        >
          Study this section to add your own work →
        </a>
      )}
    </article>
  );
}

// helpers to read section memory from the journey
function memByList(j: Journey | null): SectionMemory[] {
  if (!j) return [];
  return j.order.map((id) => j.sections[id]).filter(Boolean);
}
function memBy(list: SectionMemory[], subtopicId: number): SectionMemory | undefined {
  return list.find((m) => m.subtopicId === subtopicId);
}
function memByHas(list: SectionMemory[], subtopicId: number): boolean {
  const m = memBy(list, subtopicId);
  return !!m && (m.operators.length > 0 || m.questions.length > 0);
}

function SheetSkeleton() {
  return (
    <div className="mt-8 space-y-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
          <div className="mt-3 space-y-2 pl-9">
            <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      ))}
      <p className="text-xs text-neutral-400">Building your study sheet from the document…</p>
    </div>
  );
}
