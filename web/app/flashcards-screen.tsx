"use client";

import { useEffect, useState } from "react";
import { flashcards as fetchCards } from "./hub-actions";
import { Logo } from "./logo";

// Flashcards as a full page with a real 3D flip. The document's key terms (term ⇄
// definition), straight from the typed records — grounded, free.

type Card = { id: number; term: string; definition: string };

export default function FlashcardsScreen({ versionId, title }: { versionId: number; title: string }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchCards(versionId).then((c) => setCards(c as Card[]));
  }, [versionId]);

  function go(delta: number) {
    if (!cards) return;
    setFlipped(false);
    setI((n) => (n + delta + cards.length) % cards.length);
  }
  function mark(knownIt: boolean) {
    if (!cards) return;
    setKnown((s) => {
      const next = new Set(s);
      if (knownIt) next.add(cards[i].id);
      else next.delete(cards[i].id);
      return next;
    });
    setTimeout(() => go(1), 180);
  }

  // keyboard: space flips, arrows navigate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
      else if (e.code === "ArrowRight") go(1);
      else if (e.code === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, i]);

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">Flashcards · {title}</span>
        {cards && cards.length > 0 && (
          <span className="ml-auto text-xs text-neutral-400">{known.size} / {cards.length} known</span>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-8">
        {cards == null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-neutral-500">No defined concepts to make cards from.</p>
        ) : (
          <>
            {/* progress */}
            <div className="mb-5 h-1 w-full max-w-md overflow-hidden rounded-full bg-neutral-200">
              <div className="h-full bg-neutral-900 transition-all" style={{ width: `${((i + 1) / cards.length) * 100}%` }} />
            </div>

            {/* the flip card */}
            <button
              onClick={() => setFlipped((f) => !f)}
              className="group w-full max-w-md [perspective:1200px]"
              style={{ height: 280 }}
            >
              <div
                className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                {/* front */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm [backface-visibility:hidden]">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Term {i + 1}</span>
                  <span className="text-2xl font-semibold text-neutral-900">{cards[i].term}</span>
                  <span className="mt-2 text-xs text-neutral-400">tap or press space to flip</span>
                </div>
                {/* back */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-neutral-900 bg-neutral-900 p-8 text-center text-white [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Definition</span>
                  <span className="text-[15px] leading-relaxed">{cards[i].definition}</span>
                </div>
              </div>
            </button>

            {/* controls */}
            <div className="mt-6 flex w-full max-w-md items-center justify-between gap-3">
              <button onClick={() => go(-1)} className="rounded-xl px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">‹</button>
              <div className="flex flex-1 gap-2">
                <button onClick={() => mark(false)} className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
                  Still learning
                </button>
                <button onClick={() => mark(true)} className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                  Got it ✓
                </button>
              </div>
              <button onClick={() => go(1)} className="rounded-xl px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">›</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
