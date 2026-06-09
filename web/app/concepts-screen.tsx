"use client";

import { useEffect, useMemo, useState } from "react";
import { flashcards as fetchConcepts } from "./hub-actions";
import { Logo } from "./logo";

// The concept explorer — what the "N concepts" stat opens into. Proof the system
// holds a real, inspectable knowledge graph (not just LLM text): every concept the
// document defines, searchable, each expandable to its verbatim definition with a
// "go deeper" into the guide.

type C = { id: number; term: string; definition: string };

export default function ConceptsScreen({ versionId, title }: { versionId: number; title: string }) {
  const [concepts, setConcepts] = useState<C[] | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    fetchConcepts(versionId).then((c) => setConcepts((c as C[]).sort((a, b) => a.term.localeCompare(b.term))));
  }, [versionId]);

  const shown = useMemo(
    () => (concepts ?? []).filter((c) => c.term.toLowerCase().includes(q.toLowerCase())),
    [concepts, q],
  );

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">Concepts · {title}</span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Every concept in this document</h1>
          {concepts && <span className="text-xs text-neutral-400">{concepts.length} total</span>}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search concepts…"
          className="mb-4 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-neutral-400"
        />

        {concepts == null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            {shown.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <button
                  onClick={() => setOpenId((id) => (id === c.id ? null : c.id))}
                  className="flex w-full items-center justify-between gap-3 p-3.5 text-left hover:bg-neutral-50"
                >
                  <span className="text-sm font-medium text-neutral-900">{c.term}</span>
                  <span className={"text-neutral-300 transition-transform " + (openId === c.id ? "rotate-90" : "")}>›</span>
                </button>
                {openId === c.id && (
                  <div className="border-t border-neutral-100 bg-neutral-50/60 px-3.5 py-3">
                    <p className="text-[13px] leading-relaxed text-neutral-700">{c.definition}</p>
                    <a
                      href={`/learn/${versionId}/guide?q=${encodeURIComponent(`Explain ${c.term} with an example.`)}`}
                      className="mt-2 inline-block text-xs font-medium text-neutral-600 underline-offset-2 hover:underline"
                    >
                      Go deeper →
                    </a>
                  </div>
                )}
              </div>
            ))}
            {shown.length === 0 && <p className="text-sm text-neutral-400">No concepts match “{q}”.</p>}
          </div>
        )}
      </main>
    </div>
  );
}
