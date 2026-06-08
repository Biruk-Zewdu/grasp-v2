"use client";

import { useEffect, useState, useTransition } from "react";
import { debateSetup, debateMove } from "./hub-actions";
import type { DebateSetup, DebateSide, DebateTurn } from "@/lib/debate";

// "The debate" — the preserved tension, made INTERACTIVE. It opens with both
// recorded sides (verbatim), then the learner chooses how to engage:
//   • Take a side  → they argue; the AI argues the other and rebuts them.
//   • Watch        → both sides are AIs; the learner advances the exchange.
// Arguments are grounded in the artifact (never fabricated), and the tension is
// never resolved — nobody "wins". This is the differentiator no chatbot has.

type Mode = null | { kind: "watch" } | { kind: "play"; mine: DebateSide };

export default function TensionView({
  tensionId,
  onClose,
}: {
  tensionId: number;
  onClose: () => void;
}) {
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const [setup, setSetup] = useState<DebateSetup | null | "loading">("loading");
  const [mode, setMode] = useState<Mode>(null);
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, start] = useTransition();

  useEffect(() => {
    debateSetup(tensionId).then((s) => setSetup(s));
  }, [tensionId]);

  function aiMove(side: DebateSide, studentPoint: string | null, hist: DebateTurn[]) {
    start(async () => {
      const text = await debateMove(sessionId, tensionId, side, hist, studentPoint);
      if (text) setTurns((t) => [...t, { side, text }]);
    });
  }

  // Watch mode: the next AI move is whichever side didn't go last (A opens).
  function advanceWatch() {
    const next: DebateSide = turns.length === 0 ? "A" : turns[turns.length - 1].side === "A" ? "B" : "A";
    aiMove(next, null, turns);
  }

  // Play mode: student submits a point for their side; AI rebuts for the other.
  function submitPoint() {
    if (mode?.kind !== "play" || !input.trim() || busy) return;
    const mine = mode.mine;
    const ai: DebateSide = mine === "A" ? "B" : "A";
    const point = input.trim();
    setInput("");
    const next = [...turns, { side: mine, text: point }];
    setTurns(next);
    aiMove(ai, point, next);
  }

  function startPlay(mine: DebateSide) {
    setMode({ kind: "play", mine });
    // AI opens for its side so the student has something to push against.
    const ai: DebateSide = mine === "A" ? "B" : "A";
    aiMove(ai, null, []);
  }

  function startWatch() {
    setMode({ kind: "watch" });
    aiMove("A", null, []);
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[88dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100">
          ✕
        </button>

        {setup === "loading" ? (
          <div className="p-6 text-sm text-neutral-400">Loading the debate…</div>
        ) : setup == null ? (
          <div className="p-6 text-sm text-neutral-500">No debate is recorded for this document.</div>
        ) : (
          <>
            <div className="border-b border-neutral-100 px-5 py-3.5 pr-10">
              <h2 className="text-sm font-semibold text-neutral-900">The debate</h2>
              <p className="text-xs leading-snug text-neutral-500">{setup.dimension}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* The two recorded positions — always shown as the framing */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-200 text-xs">
                <SideHead side="A" label={setup.sideA.label} active={mode?.kind === "play" && mode.mine === "A"} />
                <SideHead side="B" label={setup.sideB.label} active={mode?.kind === "play" && mode.mine === "B"} />
                <div className="bg-white p-3 text-neutral-700">{setup.sideA.claim}</div>
                <div className="bg-white p-3 text-neutral-700">{setup.sideB.claim}</div>
                <div className="bg-white p-3 text-neutral-500">When: {setup.sideA.when}</div>
                <div className="bg-white p-3 text-neutral-500">When: {setup.sideB.when}</div>
              </div>

              {/* Mode picker */}
              {mode == null && (
                <div className="mt-5 space-y-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Engage</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => startPlay("A")} className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-left text-xs hover:border-neutral-400 hover:bg-neutral-50">
                      <span className="font-medium text-neutral-900">Argue {setup.sideA.label}</span>
                      <span className="block text-neutral-400">AI takes the other side</span>
                    </button>
                    <button onClick={() => startPlay("B")} className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-left text-xs hover:border-neutral-400 hover:bg-neutral-50">
                      <span className="font-medium text-neutral-900">Argue {setup.sideB.label}</span>
                      <span className="block text-neutral-400">AI takes the other side</span>
                    </button>
                  </div>
                  <button onClick={startWatch} className="w-full rounded-xl bg-neutral-900 px-3 py-2.5 text-xs font-medium text-white hover:bg-neutral-800">
                    Watch both sides debate
                  </button>
                </div>
              )}

              {/* The exchange */}
              {turns.length > 0 && (
                <div className="mt-5 space-y-3">
                  {turns.map((t, i) => {
                    const isMine = mode?.kind === "play" && mode.mine === t.side;
                    const label = t.side === "A" ? setup.sideA.label : setup.sideB.label;
                    return (
                      <div key={i} className={"flex " + (t.side === "A" ? "justify-start" : "justify-end")}>
                        <div className={"max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm " + (t.side === "A" ? "bg-neutral-100 text-neutral-800" : "bg-neutral-900 text-white")}>
                          <div className={"mb-0.5 text-[10px] font-medium uppercase tracking-wide " + (t.side === "A" ? "text-neutral-400" : "text-neutral-400")}>
                            {label}{isMine ? " · you" : ""}
                          </div>
                          {t.text}
                        </div>
                      </div>
                    );
                  })}
                  {busy && <p className="text-xs text-neutral-400">Thinking…</p>}
                </div>
              )}
            </div>

            {/* Controls */}
            {mode?.kind === "watch" && (
              <div className="border-t border-neutral-100 px-5 py-3">
                <button onClick={advanceWatch} disabled={busy} className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                  {busy ? "…" : "Continue the debate →"}
                </button>
                <p className="mt-2 text-center text-[11px] text-neutral-400">Nobody wins — the point is when each side holds.</p>
              </div>
            )}
            {mode?.kind === "play" && (
              <form
                className="border-t border-neutral-100 px-5 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPoint();
                }}
              >
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={`Argue for ${mode.mine === "A" ? setup.sideA.label : setup.sideB.label}…`}
                    className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-400"
                  />
                  <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                    {busy ? "…" : "Argue"}
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-neutral-400">Make your case — the AI will rebut from the other side.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SideHead({ side, label, active }: { side: DebateSide; label: string; active: boolean }) {
  return (
    <div className={"bg-white p-3 font-medium " + (active ? "text-neutral-900" : "text-neutral-900")}>
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">Side {side}{active ? " · you" : ""}</span>
      <div>{label}</div>
    </div>
  );
}

// Re-export a generic overlay kept for the Flashcards modal (unchanged API).
export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
