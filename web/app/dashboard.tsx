"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./logo";
import Assessment from "./assessment";
import Flashcards from "./flashcards";
import TensionView from "./tension-view";
import { summary, type SummaryView } from "./hub-actions";
import type { Dashboard as DashboardData } from "@/lib/db/records";

// The document dashboard hub (StudyFetch-leaning): after a PDF builds, the learner
// lands HERE — a home for this document with a grid of named tools over the study
// path. Lesson/Tutor open the Guide (the conversation surface); Quiz, Flashcards,
// and The Debate open as quick views from the hub. The Debate (the preserved
// tension) is our differentiator, so it gets a prominent hero card when present.

type Tool = "quiz" | "flashcards" | "tension" | null;

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [open, setOpen] = useState<Tool>(null);
  const [sum, setSum] = useState<SummaryView | "loading">("loading");

  useEffect(() => {
    summary(sessionId, data.versionId).then((s) => setSum(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.versionId]);

  const understand = () => router.push(`/learn/${data.versionId}/understand`);
  const askFreely = (q?: string) =>
    router.push(`/learn/${data.versionId}/guide${q ? `?q=${encodeURIComponent(q)}` : ""}`);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      {/* Top bar */}
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <button onClick={() => router.push("/")} className="flex items-center gap-2.5">
          <Logo className="h-6 w-6 text-neutral-900" />
          <span className="text-base font-semibold tracking-tight">grasp</span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 py-10">
        {/* Document title + stats */}
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Your document</p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{data.title}</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {data.counts.concepts} concepts · {data.counts.subtopics} sections · {data.counts.claims} claims
            {data.tensionId != null ? " · 1 contested point" : ""}
          </p>
        </div>

        {/* Concept-applied summary — explains the doc THROUGH its own concepts;
            named concepts are clickable chips that open the guide on that idea. */}
        {sum !== null && (
          <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5">
            {sum === "loading" ? (
              <div className="space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-full animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
              </div>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-neutral-800">
                  {sum.text.replace(/\*\*/g, "")}
                </p>
                {sum.chips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sum.chips.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => askFreely(`What is ${c.name}, and why does it matter here?`)}
                        className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* The Debate — hero card when a tension was detected (our differentiator) */}
        {data.tensionId != null && (
          <button
            onClick={() => setOpen("tension")}
            className="mb-6 flex w-full items-center gap-4 rounded-2xl border border-neutral-300 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">⚖</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-neutral-900">The debate</div>
              <div className="text-xs leading-snug text-neutral-500">
                {data.tensionDimension ?? "This document turns on a contested point — see both sides, unresolved."}
              </div>
            </div>
            <span className="text-neutral-300" aria-hidden>→</span>
          </button>
        )}

        {/* Tool grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile
            title="Understand"
            detail="Read it, section by section"
            icon="📖"
            onClick={understand}
          />
          <Tile
            title="Quiz"
            detail={data.hasAssessment ? "Check what you know" : "Not available"}
            icon="✓"
            disabled={!data.hasAssessment}
            onClick={() => setOpen("quiz")}
          />
          <Tile
            title="Flashcards"
            detail="Drill the key terms"
            icon="🗂"
            onClick={() => setOpen("flashcards")}
          />
        </div>

        <button
          onClick={() => askFreely()}
          className="mt-3 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-700 hover:underline"
        >
          …or just ask a question →
        </button>

        {/* Study path */}
        {data.subtopics.length > 0 && (
          <div className="mt-10">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">Study path</p>
            <ol className="space-y-2">
              {data.subtopics.map((s, i) => (
                <li key={s.id}>
                  <button
                    onClick={understand}
                    className="flex w-full items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-600">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-neutral-900">{s.title}</span>
                      {s.summary && <span className="block text-xs leading-snug text-neutral-500">{s.summary}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </main>

      {/* Tool overlays */}
      {open === "quiz" && (
        <Assessment versionId={data.versionId} sessionId={sessionId} phase="pre" onClose={() => setOpen(null)} />
      )}
      {open === "flashcards" && (
        <Flashcards versionId={data.versionId} onClose={() => setOpen(null)} />
      )}
      {open === "tension" && data.tensionId != null && (
        <TensionView tensionId={data.tensionId} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function Tile({
  title,
  detail,
  icon,
  onClick,
  disabled,
}: {
  title: string;
  detail: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-40 disabled:shadow-none"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-semibold text-neutral-900">{title}</span>
      <span className="text-xs leading-snug text-neutral-500">{detail}</span>
    </button>
  );
}
