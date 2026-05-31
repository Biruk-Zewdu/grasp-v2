"use client";

import { useState, useTransition } from "react";
import { turn, expandSources } from "./actions";
import type { AnswerCard, Catalog } from "@/lib/guide/types";
import type { TensionTable } from "@/lib/render";

// Agentic moves the learner can trigger on the current answer — each is a
// templated follow-up the agent answers with full conversation context.
const ACTIONS = [
  { label: "Go deeper", q: "Go deeper on that — the reasoning behind it." },
  { label: "Give an example", q: "Give a concrete example that illustrates that." },
  { label: "The opposing view", q: "What's the strongest opposing view, and when does it hold?" },
  { label: "Explain simply", q: "Explain that more simply, for a beginner." },
];

export default function Guide({ catalog }: { catalog: Catalog }) {
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [thread, setThread] = useState<AnswerCard[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [sources, setSources] = useState<Record<number, string[]>>({});
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();

  function history(): string {
    return thread
      .slice(-4)
      .map((c) => `You: ${c.question}\nGuide: ${c.framing} ${c.prose}`)
      .join("\n\n");
  }

  function send(q: string) {
    if (!q.trim() || pending) return;
    const h = history();
    setInput("");
    start(async () => {
      let card: AnswerCard;
      try {
        card = await turn(sessionId, q, h);
      } catch {
        card = {
          question: q,
          framing: q,
          prose: "That didn't reach the server. Check your connection and try again.",
          table: null,
          sourceConceptIds: [],
          outOfScope: false,
        };
      }
      setThread((t) => {
        const nt = [...t, card];
        setActive(nt.length - 1);
        return nt;
      });
    });
  }

  function showSource(i: number, ids: number[]) {
    start(async () => {
      const s = await expandSources(ids);
      setSources((p) => ({ ...p, [i]: s.length ? s : ["No source passage on file."] }));
    });
  }

  const current = active != null ? thread[active] : null;

  return (
    <main className="grid h-dvh grid-cols-1 divide-neutral-200 lg:grid-cols-[260px_1fr_340px] lg:divide-x">
      {/* LEFT — Explore */}
      <aside className="flex flex-col gap-6 overflow-y-auto border-b border-neutral-200 p-5 lg:border-b-0">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Grasp</h1>
          <p className="text-xs text-neutral-500">One idea at a time.</p>
        </div>
        <Section title="Big questions">
          <div className="space-y-1">
            {catalog.questions.map((q) => (
              <button
                key={q.id}
                onClick={() => send(q.text)}
                disabled={pending}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-xs leading-snug text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
              >
                {q.text}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Key ideas">
          <div className="flex flex-wrap gap-1.5">
            {catalog.ideas.map((c) => (
              <button
                key={c.id}
                onClick={() => send(`What is ${c.name}, and why does it matter?`)}
                disabled={pending}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 disabled:opacity-50"
              >
                {c.name}
              </button>
            ))}
          </div>
        </Section>
      </aside>

      {/* MIDDLE — Answer canvas */}
      <section className="flex flex-col overflow-y-auto p-6 lg:p-10">
        {!current ? (
          <div className="m-auto max-w-md space-y-3 text-center">
            <p className="text-sm text-neutral-700">Ask anything about AI ideas.</p>
            <p className="text-xs text-neutral-400">
              Pick a big question or a key idea on the left, or type a question on the right.
              You get a framed, grounded answer — with the tension preserved.
            </p>
          </div>
        ) : (
          <article className="mx-auto w-full max-w-2xl space-y-5">
            <p className="text-xs text-neutral-400">
              You asked: <span className="text-neutral-600">{current.question}</span>
            </p>
            {current.framing && current.framing !== current.question && (
              <h2 className="text-lg font-semibold leading-snug text-neutral-900">
                {current.framing}
              </h2>
            )}
            {current.prose && (
              <p className="text-sm leading-relaxed text-neutral-800">{current.prose}</p>
            )}
            {current.outOfScope && (
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                That's at the edge of this corpus — try a topic from the AI-foundations sessions.
              </p>
            )}
            {current.table && (
              <div className="space-y-1.5">
                <Label>Two views — it depends</Label>
                <TensionGrid table={current.table} />
              </div>
            )}
            {active != null && sources[active] && <SourceBlock passages={sources[active]} />}

            <div className="flex flex-wrap gap-2 border-t border-neutral-100 pt-4">
              {ACTIONS.map((a) => (
                <ActionBtn key={a.label} onClick={() => send(a.q)} disabled={pending}>
                  {a.label}
                </ActionBtn>
              ))}
              {current.sourceConceptIds.length > 0 && active != null && !sources[active] && (
                <ActionBtn onClick={() => showSource(active, current.sourceConceptIds)} disabled={pending}>
                  Show the source
                </ActionBtn>
              )}
            </div>
          </article>
        )}
        {pending && (
          <p className="mx-auto mt-4 w-full max-w-2xl text-xs text-neutral-400">Thinking…</p>
        )}
      </section>

      {/* RIGHT — Conversation */}
      <aside className="flex max-h-dvh flex-col border-t border-neutral-200 p-5 lg:border-t-0">
        <Label>Conversation</Label>
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {thread.length === 0 ? (
            <p className="text-xs text-neutral-400">Ask a question to start.</p>
          ) : (
            thread.map((c, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={
                  "block w-full rounded-lg border p-2.5 text-left text-xs leading-snug " +
                  (i === active
                    ? "border-neutral-400 bg-neutral-50 text-neutral-900"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50")
                }
              >
                {c.question}
              </button>
            ))
          )}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            placeholder="Ask a follow-up…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? "…" : "Ask"}
          </button>
        </form>
      </aside>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{children}</p>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function TensionGrid({ table }: { table: TensionTable }) {
  return (
    <div className="space-y-3">
      {table.dimension && <p className="text-sm text-neutral-700">{table.dimension}</p>}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-200 text-xs">
        <Cell head>{table.labelA}</Cell>
        <Cell head>{table.labelB}</Cell>
        <Cell>{table.propA}</Cell>
        <Cell>{table.propB}</Cell>
        <Cell muted>When: {table.whenA}</Cell>
        <Cell muted>When: {table.whenB}</Cell>
      </div>
    </div>
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
      <Label>Source</Label>
      {passages.map((p, i) => (
        <p key={i} className="text-xs leading-relaxed text-neutral-600">
          “{p.length > 360 ? p.slice(0, 360) + "…" : p}”
        </p>
      ))}
    </div>
  );
}
