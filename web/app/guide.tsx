"use client";

import { useState, useTransition } from "react";
import { startGoal, forward, submitProbe, expandSource } from "./actions";
import { initialState, type GuideState, type Coverage } from "@/lib/guide/types";
import type { Step } from "@/lib/render";

const EXAMPLES = [
  "why does deep learning struggle with reasoning?",
  "when does reinforcement learning fail?",
  "what is the watchmaker parable?",
];

export default function Guide() {
  const [state, setState] = useState<GuideState>(() =>
    initialState(globalThis.crypto?.randomUUID?.() ?? String(Math.random())),
  );
  const [step, setStep] = useState<Step | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [source, setSource] = useState<string[] | null>(null);
  const [goal, setGoal] = useState("");
  const [response, setResponse] = useState("");
  const [pending, start] = useTransition();

  function reset() {
    setCoverage(null);
    setSource(null);
    setResponse("");
  }

  function onGoal(text: string) {
    if (!text.trim()) return;
    reset();
    start(async () => {
      const adv = await startGoal(state, text);
      setState(adv.state);
      setStep(adv.step);
      setGoal("");
    });
  }

  function onForward() {
    reset();
    start(async () => {
      const adv = await forward(state);
      setState(adv.state);
      setStep(adv.step);
    });
  }

  function onProbe() {
    if (step?.kind !== "probe" || !response.trim()) return;
    const probeId = step.probeId;
    start(async () => {
      const adv = await submitProbe(state, probeId, response);
      setState(adv.state);
      setStep(adv.step);
      setCoverage(adv.coverage ?? null);
      setSource(null);
      setResponse("");
    });
  }

  function onSource() {
    const id = step?.kind === "briefing" ? step.entityId : state.target;
    if (id == null) return;
    start(async () => setSource(await expandSource(id)));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Grasp</h1>
        <p className="text-xs text-neutral-500">One idea at a time.</p>
      </header>

      {!step && (
        <section className="flex flex-1 flex-col justify-center gap-4">
          <label className="text-sm text-neutral-700">What do you want to grasp?</label>
          <GoalBox value={goal} onChange={setGoal} onSubmit={() => onGoal(goal)} pending={pending} />
          <ul className="space-y-1.5">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  className="text-left text-sm text-neutral-500 underline-offset-2 hover:underline"
                  onClick={() => onGoal(ex)}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step && (
        <section className="flex flex-1 flex-col gap-5">
          <StepCard step={step} coverage={coverage} />

          {source && <SourceBlock passages={source} />}

          {step.kind === "probe" ? (
            <div className="space-y-2">
              <textarea
                className="min-h-24 w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-neutral-400"
                placeholder="Answer in your own words…"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
              />
              <Button onClick={onProbe} pending={pending} disabled={!response.trim()}>
                Check
              </Button>
            </div>
          ) : step.kind === "stop" ? null : (
            <div className="flex items-center gap-3">
              <Button onClick={onForward} pending={pending}>
                Continue
              </Button>
              {(step.kind === "briefing" || step.kind === "tension") && !source && (
                <button
                  className="text-sm text-neutral-500 underline-offset-2 hover:underline disabled:opacity-50"
                  onClick={onSource}
                  disabled={pending}
                >
                  Show the source
                </button>
              )}
            </div>
          )}

          <div className="mt-auto border-t border-neutral-100 pt-4">
            <GoalBox
              value={goal}
              onChange={setGoal}
              onSubmit={() => onGoal(goal)}
              pending={pending}
              placeholder="Ask a follow-up, or set a new goal…"
            />
          </div>
        </section>
      )}
    </main>
  );
}

function StepCard({ step, coverage }: { step: Step; coverage: Coverage | null }) {
  return (
    <article className="space-y-3 rounded-2xl border border-neutral-200 p-5">
      <h2 className="text-sm font-medium text-neutral-900">{step.title}</h2>

      {coverage && step.kind !== "probe" && (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          You touched {coverage.covered.length} of {coverage.total} key points.{" "}
          {coverage.grasped ? "Nice — moving on." : "Let's look a little deeper."}
        </p>
      )}

      {step.kind === "tension" ? (
        <div className="space-y-3">
          {step.table.dimension && (
            <p className="text-sm text-neutral-700">{step.table.dimension}</p>
          )}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-200 text-xs">
            <Cell head>{step.table.labelA}</Cell>
            <Cell head>{step.table.labelB}</Cell>
            <Cell>{step.table.propA}</Cell>
            <Cell>{step.table.propB}</Cell>
            <Cell muted>When: {step.table.whenA}</Cell>
            <Cell muted>When: {step.table.whenB}</Cell>
          </div>
        </div>
      ) : step.kind === "probe" ? (
        <p className="text-sm text-neutral-800">{step.prompt}</p>
      ) : (
        <p className="text-sm leading-relaxed text-neutral-800">{step.point}</p>
      )}
    </article>
  );
}

function Cell({
  children,
  head,
  muted,
}: {
  children: React.ReactNode;
  head?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "bg-white p-3 " +
        (head ? "font-medium text-neutral-900" : muted ? "text-neutral-500" : "text-neutral-700")
      }
    >
      {children}
    </div>
  );
}

function SourceBlock({ passages }: { passages: string[] }) {
  return (
    <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Source</p>
      {passages.length === 0 ? (
        <p className="text-xs text-neutral-500">No source passage on file.</p>
      ) : (
        passages.slice(0, 3).map((p, i) => (
          <p key={i} className="text-xs leading-relaxed text-neutral-600">
            “{p.length > 360 ? p.slice(0, 360) + "…" : p}”
          </p>
        ))
      )}
    </div>
  );
}

function GoalBox({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder = "e.g. why does deep learning struggle with reasoning?",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  placeholder?: string;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button onClick={onSubmit} pending={pending} disabled={!value.trim()}>
        Go
      </Button>
    </form>
  );
}

function Button({
  children,
  onClick,
  pending,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
    >
      {pending ? "…" : children}
    </button>
  );
}
