"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./logo";
import { summary, type SummaryView } from "./hub-actions";
import type { Dashboard as DashboardData } from "@/lib/db/records";

// The document dashboard — a home for what you uploaded. A concept-applied summary
// up top, an interactive stat row (the numbers are doors into the real knowledge
// graph), the contested-point hero, and the study tools. Everything navigates to a
// full PAGE — no modals.

export default function Dashboard({ data }: { data: DashboardData }) {
  const router = useRouter();
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const [sum, setSum] = useState<SummaryView | "loading">("loading");

  useEffect(() => {
    summary(sessionId, data.versionId).then((s) => setSum(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.versionId]);

  const go = (p: string) => router.push(`/learn/${data.versionId}${p}`);
  const ask = (q: string) => router.push(`/learn/${data.versionId}/guide?q=${encodeURIComponent(q)}`);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <button onClick={() => router.push("/")} className="flex items-center gap-2.5">
          <Logo className="h-6 w-6 text-neutral-900" />
          <span className="text-base font-semibold tracking-tight">grasp</span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 py-10">
        {/* Title */}
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Your document</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{data.title}</h1>

        {/* Interactive stat row — each number is a door into the knowledge graph */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Stat n={data.counts.concepts} label="concepts" onClick={() => go("/concepts")} />
          <Stat n={data.counts.subtopics} label="sections" onClick={() => go("/understand")} />
          <Stat n={data.counts.claims} label="claims" onClick={() => go("/concepts")} />
          {data.tensionId != null && <Stat n={1} label="contested point" accent onClick={() => go("/debate")} />}
        </div>

        {/* Concept-applied summary */}
        {sum !== null && (
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
            {sum === "loading" ? (
              <div className="space-y-2">
                <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-full animate-pulse rounded bg-neutral-200" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
              </div>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-neutral-800">{renderBold(sum.text)}</p>
                {sum.chips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {sum.chips.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => ask(`What is ${c.name}, and why does it matter here?`)}
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

        {/* The Debate — hero (our differentiator) */}
        {data.tensionId != null && (
          <button
            onClick={() => go("/debate")}
            className="mt-6 flex w-full items-center gap-4 rounded-2xl border border-neutral-300 bg-gradient-to-br from-white to-neutral-50 p-5 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-lg text-white">⚖</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-neutral-900">The debate — argue it live</div>
              <div className="text-xs leading-snug text-neutral-500">
                {data.tensionDimension ?? "This document turns on a contested point."} Take a side; the AI takes the other.
              </div>
            </div>
            <span className="text-neutral-300" aria-hidden>→</span>
          </button>
        )}

        {/* Tools */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile title="First principles" detail="Learn it, section by section" icon="📖" onClick={() => go("/understand")} />
          <Tile title="Study sheet" detail="Personal — built as you learn" icon="📝" onClick={() => go("/sheet")} />
          <Tile title="Quiz" detail={data.hasAssessment ? "Test yourself" : "Not available"} icon="✓" disabled={!data.hasAssessment} onClick={() => go("/quiz")} />
          <Tile title="Flashcards" detail="Drill the key terms" icon="🗂" onClick={() => go("/flashcards")} />
        </div>

        <button onClick={() => router.push(`/learn/${data.versionId}/guide`)} className="mt-3 text-xs text-neutral-400 underline-offset-2 hover:text-neutral-700 hover:underline">
          …or just ask a question →
        </button>
      </main>
    </div>
  );
}

function Stat({ n, label, onClick, accent }: { n: number; label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={
        "group flex items-baseline gap-1.5 rounded-xl border px-3 py-2 transition-colors " +
        (accent
          ? "border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800"
          : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50")
      }
    >
      <span className="text-lg font-bold tabular-nums">{n}</span>
      <span className={"text-xs " + (accent ? "text-neutral-300" : "text-neutral-500")}>{label}</span>
      <span className={"text-xs transition-transform group-hover:translate-x-0.5 " + (accent ? "text-neutral-400" : "text-neutral-300")} aria-hidden>→</span>
    </button>
  );
}

function Tile({ title, detail, icon, onClick, disabled }: { title: string; detail: string; icon: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-semibold text-neutral-900">{title}</span>
      <span className="text-xs leading-snug text-neutral-500">{detail}</span>
    </button>
  );
}

// Render **bold** spans from the concept-applied summary.
function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-neutral-900">
        {p.slice(2, -2)}
      </strong>
    ) : (
      p
    ),
  );
}
