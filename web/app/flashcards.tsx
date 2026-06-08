"use client";

import { useEffect, useState } from "react";
import { flashcards as fetchCards } from "./hub-actions";
import { Overlay } from "./tension-view";

// Flashcards = the artifact's concepts (term ⇄ definition). No model — they're the
// typed records, so every card is grounded and free. A simple flip + next deck.

type Card = { id: number; term: string; definition: string };

export default function Flashcards({ versionId, onClose }: { versionId: number; onClose: () => void }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    fetchCards(versionId).then((c) => setCards(c as Card[]));
  }, [versionId]);

  function go(delta: number) {
    if (!cards) return;
    setFlipped(false);
    setI((n) => (n + delta + cards.length) % cards.length);
  }

  return (
    <Overlay onClose={onClose}>
      <div className="border-b border-neutral-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-neutral-900">Flashcards</h2>
        <p className="text-xs text-neutral-400">The document's key terms. Tap a card to flip.</p>
      </div>

      <div className="px-5 py-5">
        {cards == null ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-neutral-500">No defined concepts to make cards from.</p>
        ) : (
          <>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-6 py-8 text-center transition-colors hover:bg-neutral-100"
            >
              {!flipped ? (
                <>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Term</span>
                  <span className="text-lg font-semibold text-neutral-900">{cards[i].term}</span>
                  <span className="mt-2 text-xs text-neutral-400">tap to reveal</span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Definition</span>
                  <span className="text-sm leading-relaxed text-neutral-800">{cards[i].definition}</span>
                </>
              )}
            </button>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => go(-1)}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              >
                ‹ Prev
              </button>
              <span className="text-xs text-neutral-400">
                {i + 1} / {cards.length}
              </span>
              <button
                onClick={() => go(1)}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              >
                Next ›
              </button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
