"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { debateSetup, debateMove } from "./hub-actions";
import { Logo } from "./logo";
import type { DebateSetup, DebateSide, DebateTurn } from "@/lib/debate";

// The debate as a FULL PAGE (not a modal). The contested point, made live: pick a
// side and argue (the AI rebuts from the other), or watch both AIs go. Arguments
// are grounded in the artifact; nobody wins — the point is when each side holds.

type Mode = null | { kind: "watch" } | { kind: "play"; mine: DebateSide };
type UITurn = DebateTurn & { groundedIn?: string[] };

export default function DebatePage({ versionId, tensionId }: { versionId: number; tensionId: number }) {
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const [setup, setSetup] = useState<DebateSetup | null | "loading">("loading");
  const [mode, setMode] = useState<Mode>(null);
  const [turns, setTurns] = useState<UITurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    debateSetup(tensionId).then((s) => setSetup(s));
  }, [tensionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, busy]);

  function aiMove(side: DebateSide, studentPoint: string | null, hist: UITurn[]) {
    const plain: DebateTurn[] = hist.map((h) => ({ side: h.side, text: h.text }));
    start(async () => {
      const move = await debateMove(sessionId, tensionId, side, plain, studentPoint);
      if (move) setTurns((t) => [...t, { side, text: move.argument, groundedIn: move.groundedIn }]);
    });
  }
  function advanceWatch() {
    const next: DebateSide = turns.length === 0 ? "A" : turns[turns.length - 1].side === "A" ? "B" : "A";
    aiMove(next, null, turns);
  }
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
    const ai: DebateSide = mine === "A" ? "B" : "A";
    aiMove(ai, null, []);
  }
  function startWatch() {
    setMode({ kind: "watch" });
    aiMove("A", null, []);
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="text-sm font-medium text-neutral-700">The debate</span>
      </header>

      {setup === "loading" ? (
        <div className="p-8 text-sm text-neutral-400">Loading the debate…</div>
      ) : setup == null ? (
        <div className="p-8 text-sm text-neutral-500">No debate is recorded for this document.</div>
      ) : (
        <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 py-6">
          {/* The question */}
          <p className="text-center text-xs font-medium uppercase tracking-wide text-neutral-400">The contested point</p>
          <h1 className="mt-1 text-center text-lg font-semibold leading-snug text-neutral-900">{setup.dimension}</h1>

          {/* The two positions */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <PositionCard side="A" s={setup.sideA} mine={mode?.kind === "play" && mode.mine === "A"} />
            <PositionCard side="B" s={setup.sideB} mine={mode?.kind === "play" && mode.mine === "B"} />
          </div>

          {/* Mode picker */}
          {mode == null && (
            <div className="mt-6">
              <p className="mb-2 text-center text-xs text-neutral-400">Take a side — or watch them go</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => startPlay("A")} className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-center text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-400 hover:bg-neutral-50">
                  I'll argue {setup.sideA.label}
                </button>
                <button onClick={() => startPlay("B")} className="rounded-xl border border-neutral-300 bg-white px-3 py-3 text-center text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-400 hover:bg-neutral-50">
                  I'll argue {setup.sideB.label}
                </button>
              </div>
              <button onClick={startWatch} className="mt-2 w-full rounded-xl bg-neutral-900 px-3 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800">
                Watch both sides debate
              </button>
            </div>
          )}

          {/* The exchange */}
          {turns.length > 0 && (
            <div className="mt-6 flex-1 space-y-3 overflow-y-auto">
              {turns.map((t, i) => {
                const isMine = mode?.kind === "play" && mode.mine === t.side;
                const label = t.side === "A" ? setup.sideA.label : setup.sideB.label;
                return (
                  <div key={i} className={"flex " + (t.side === "A" ? "justify-start" : "justify-end")}>
                    <div
                      className={
                        "max-w-[80%] animate-[fadeIn_.3s_ease] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm " +
                        (t.side === "A" ? "rounded-tl-sm bg-white text-neutral-800" : "rounded-tr-sm bg-neutral-900 text-white")
                      }
                    >
                      <div className={"mb-1 text-[10px] font-medium uppercase tracking-wide " + (t.side === "A" ? "text-neutral-400" : "text-neutral-500")}>
                        {label}{isMine ? " · you" : ""}
                      </div>
                      {t.text}
                      {!isMine && t.groundedIn && t.groundedIn.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          <span className={"text-[10px] " + (t.side === "A" ? "text-neutral-400" : "text-neutral-500")}>grounded in:</span>
                          {t.groundedIn.map((g, k) => (
                            <span
                              key={k}
                              className={
                                "rounded px-1.5 py-0.5 text-[10px] " +
                                (t.side === "A" ? "bg-neutral-100 text-neutral-600" : "bg-white/15 text-neutral-200")
                              }
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {busy && (
                <div className="flex justify-center py-2">
                  <span className="flex gap-1">
                    <Dot /> <Dot /> <Dot />
                  </span>
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}

          {/* Controls */}
          {mode?.kind === "watch" && (
            <div className="mt-4">
              <button onClick={advanceWatch} disabled={busy} className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40">
                {busy ? "…" : "Continue the debate →"}
              </button>
              <p className="mt-2 text-center text-[11px] text-neutral-400">Nobody wins — the point is when each side holds.</p>
            </div>
          )}
          {mode?.kind === "play" && (
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); submitPoint(); }}>
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={`Make your case for ${mode.mine === "A" ? setup.sideA.label : setup.sideB.label}…`}
                  className="flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-neutral-400"
                />
                <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                  {busy ? "…" : "Argue"}
                </button>
              </div>
            </form>
          )}
        </main>
      )}
    </div>
  );
}

function PositionCard({ side, s, mine }: { side: DebateSide; s: { label: string; claim: string; when: string }; mine: boolean }) {
  return (
    <div className={"rounded-2xl border bg-white p-4 " + (mine ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200")}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        Side {side}{mine ? " · you" : ""}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-neutral-900">{s.label}</div>
      <p className="mt-1.5 text-xs leading-snug text-neutral-600">{s.claim}</p>
      <p className="mt-2 text-[11px] leading-snug text-neutral-400">Holds when: {s.when}</p>
    </div>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:0ms] [&:nth-child(2)]:[animation-delay:150ms] [&:nth-child(3)]:[animation-delay:300ms]" />;
}
