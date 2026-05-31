"use client";

import { useState, useTransition } from "react";
import { turn, expandSources } from "./actions";
import type { AnswerCard } from "@/lib/guide/types";
import type { TensionTable } from "@/lib/render";

const EXAMPLES = [
  "why can't AI just use common sense?",
  "is bigger and more data always better for AI?",
  "how should lots of disagreeing experts be combined?",
];

export default function Guide() {
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [cards, setCards] = useState<AnswerCard[]>([]);
  const [sources, setSources] = useState<Record<number, string[]>>({});
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();

  // Last few turns, as plain text, so follow-ups have context without unbounded cost.
  function history(): string {
    return cards
      .slice(-4)
      .map((c) => `You: ${c.question}\nGuide: ${c.framing} ${c.prose}`)
      .join("\n\n");
  }

  function send(q: string) {
    if (!q.trim() || pending) return;
    const h = history();
    setInput("");
    start(async () => {
      try {
        const card = await turn(sessionId, q, h);
        setCards((cs) => [...cs, card]);
      } catch {
        setCards((cs) => [
          ...cs,
          {
            question: q,
            framing: q,
            prose: "That didn't reach the server. Check your connection and try again.",
            table: null,
            sourceConceptIds: [],
            outOfScope: false,
          },
        ]);
      }
    });
  }

  function showSource(i: number, ids: number[]) {
    start(async () => {
      const s = await expandSources(ids);
      setSources((prev) => ({ ...prev, [i]: s.length ? s : ["No source passage on file."] }));
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-12">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Grasp</h1>
        <p className="text-xs text-neutral-500">One idea at a time.</p>
      </header>

      {cards.length === 0 ? (
        <section className="flex flex-1 flex-col justify-center gap-4">
          <label className="text-sm text-neutral-700">Ask anything about AI ideas.</label>
          <AskBox value={input} onChange={setInput} onSubmit={() => send(input)} pending={pending} />
          <ul className="space-y-1.5">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  className="text-left text-sm text-neutral-500 underline-offset-2 hover:underline"
                  onClick={() => send(ex)}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="flex flex-1 flex-col gap-5">
          {cards.map((c, i) => (
            <AnswerView
              key={i}
              card={c}
              source={sources[i] ?? null}
              onSource={() => showSource(i, c.sourceConceptIds)}
              pending={pending}
            />
          ))}
          {pending && <p className="text-xs text-neutral-400">Thinking…</p>}
          <div className="mt-auto border-t border-neutral-100 pt-4">
            <AskBox
              value={input}
              onChange={setInput}
              onSubmit={() => send(input)}
              pending={pending}
              placeholder="Ask a follow-up, or a new question…"
            />
          </div>
        </section>
      )}
    </main>
  );
}

function AnswerView({
  card,
  source,
  onSource,
  pending,
}: {
  card: AnswerCard;
  source: string[] | null;
  onSource: () => void;
  pending: boolean;
}) {
  return (
    <article className="space-y-3 rounded-2xl border border-neutral-200 p-5">
      <p className="text-xs text-neutral-400">
        You asked: <span className="text-neutral-600">{card.question}</span>
      </p>
      {card.framing && card.framing !== card.question && (
        <p className="text-sm font-medium text-neutral-900">{card.framing}</p>
      )}
      {card.prose && (
        <p className="text-sm leading-relaxed text-neutral-800">{card.prose}</p>
      )}

      {card.outOfScope && (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          That's at the edge of this corpus — try a topic from the AI-foundations sessions
          (credit assignment, search, representation, reasoning, aggregation…).
        </p>
      )}

      {card.table && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Two views — it depends
          </p>
          <TensionGrid table={card.table} />
        </div>
      )}

      {source && <SourceBlock passages={source} />}

      {card.sourceConceptIds.length > 0 && !source && (
        <button
          className="text-sm text-neutral-500 underline-offset-2 hover:underline disabled:opacity-50"
          onClick={onSource}
          disabled={pending}
        >
          Show the source
        </button>
      )}
    </article>
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
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Source</p>
      {passages.map((p, i) => (
        <p key={i} className="text-xs leading-relaxed text-neutral-600">
          “{p.length > 360 ? p.slice(0, 360) + "…" : p}”
        </p>
      ))}
    </div>
  );
}

function AskBox({
  value,
  onChange,
  onSubmit,
  pending,
  placeholder = "e.g. why can't AI just use common sense?",
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
      <button
        type="submit"
        disabled={pending || !value.trim()}
        className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "…" : "Ask"}
      </button>
    </form>
  );
}
