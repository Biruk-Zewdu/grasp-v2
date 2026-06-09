"use client";

import { useEffect, useState } from "react";
import { studySheet } from "./sheet-actions";
import { Logo } from "./logo";
import type { StudySheetData, SheetConcept } from "@/lib/sheet";

// The exam-prep study sheet — its own page. What a student actually wants before
// a test: a sharp TL;DR, the must-know concepts ranked by importance (tap to
// reveal the definition), the key points to memorise (tickable), and the contested
// point. Built from the typed records — the structure IS the knowledge graph,
// shown beautifully, not a paragraph.

export default function Sheet({
  versionId,
  title,
}: {
  versionId: number;
  title: string;
}) {
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const [data, setData] = useState<StudySheetData | null | "loading">("loading");

  useEffect(() => {
    studySheet(sessionId, versionId).then((d) => setData(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">Study sheet · {title}</span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        {data === "loading" ? (
          <SheetSkeleton />
        ) : data == null ? (
          <p className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
            Building the study sheet needs the live model. Set <code>SERVE_MODE=live</code> with an API key.
          </p>
        ) : (
          <div className="space-y-10">
            {/* TL;DR hero */}
            <section>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">In one line</p>
              <p className="mt-2 text-xl font-medium leading-snug text-neutral-900">{data.tldr}</p>
            </section>

            {/* Must-know concepts */}
            {data.concepts.length > 0 && (
              <section>
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-neutral-900">Must-know concepts</h2>
                  <span className="text-xs text-neutral-400">ranked by importance · tap to reveal</span>
                </div>
                <div className="space-y-2">
                  {data.concepts.map((c, i) => (
                    <ConceptRow key={`${c.id}-${i}`} c={c} rank={i + 1} versionId={versionId} />
                  ))}
                </div>
              </section>
            )}

            {/* Key points to remember */}
            {data.keyPoints.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-neutral-900">Remember these</h2>
                <ul className="space-y-1.5">
                  {data.keyPoints.map((p, i) => (
                    <KeyPoint key={i} text={p} />
                  ))}
                </ul>
              </section>
            )}

            {/* The contested point */}
            {data.tensionId != null && (
              <section>
                <a
                  href={`/learn/${versionId}/debate`}
                  className="flex items-center gap-3 rounded-2xl border border-neutral-300 bg-white p-4 transition-shadow hover:shadow-md"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">⚖</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-neutral-900">Know the debate</div>
                    <div className="text-xs text-neutral-500">The contested point examiners love — see both sides.</div>
                  </div>
                  <span className="text-neutral-300">→</span>
                </a>
              </section>
            )}

            <div className="flex gap-3 pt-2">
              <a href={`/learn/${versionId}/understand`} className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Study from first principles
              </a>
              <a href={`/learn/${versionId}`} className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-neutral-800">
                Test myself
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ConceptRow({ c, rank, versionId }: { c: SheetConcept; rank: number; versionId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-neutral-50">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-semibold text-white">
          {rank}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-neutral-900">{c.name}</span>
          <span className="block text-xs leading-snug text-neutral-500">{c.why}</span>
        </span>
        <span className={"text-neutral-300 transition-transform " + (open ? "rotate-90" : "")}>›</span>
      </button>
      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/60 px-3.5 py-3">
          <p className="text-[13px] leading-relaxed text-neutral-700">{c.definition}</p>
          <a
            href={`/learn/${versionId}/guide?q=${encodeURIComponent(`Explain ${c.name} in depth with an example.`)}`}
            className="mt-2 inline-block text-xs font-medium text-neutral-600 underline-offset-2 hover:underline"
          >
            Go deeper →
          </a>
        </div>
      )}
    </div>
  );
}

function KeyPoint({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <li>
      <button onClick={() => setDone((d) => !d)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-white">
        <span
          className={
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors " +
            (done ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-transparent")
          }
        >
          ✓
        </span>
        <span className={"text-sm leading-snug " + (done ? "text-neutral-400 line-through" : "text-neutral-700")}>{text}</span>
      </button>
    </li>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-neutral-200" />
        <div className="h-6 w-3/4 animate-pulse rounded bg-neutral-200" />
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
      <p className="text-xs text-neutral-400">Building your study sheet…</p>
    </div>
  );
}
