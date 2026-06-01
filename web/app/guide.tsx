"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { turn, basics, expandSources } from "./actions";
import type { AnswerCard, Catalog, GlossTerm } from "@/lib/guide/types";
import type { TensionTable } from "@/lib/render";

// Agentic moves the learner can trigger on the current answer — each is a
// templated follow-up the agent answers with full conversation context. These are
// CONTINUATIONS: they extend the current build-up in the same cell (see below).
const ACTIONS = [
  { label: "Go deeper", q: "Go deeper on that — the reasoning behind it." },
  { label: "Give an example", q: "Give a concrete example that illustrates that." },
  { label: "The opposing view", q: "What's the strongest opposing view, and when does it hold?" },
  { label: "Explain simply", q: "Explain that more simply, for a beginner." },
];

// The transcript is a list of GROUPS, not a flat list of cards. A new question
// (ask box, a left-pane big question / key idea, a basics ladder, a rung, a key
// term) starts a fresh group = a new cell. A CONTINUATION of the current thread
// (Go deeper / example / opposing view / explain simply, or following a → branch)
// appends a step INSIDE the last group's cell — because those steps are one
// build-up, not separate questions. Steps stack and scroll within the one cell.
type Group = AnswerCard[];

export default function Guide({ catalog }: { catalog: Catalog }) {
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [thread, setThread] = useState<Group[]>([]);
  const [active, setActive] = useState<number | null>(null);
  // Revealed source passages, keyed by "groupIndex-stepIndex".
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const stepCount = thread.reduce((n, g) => n + g.length, 0);

  // The session flows: whenever a step arrives (new group OR a continuation step),
  // scroll the live edge into view and mark the last group active. Nothing is ever
  // paged away — the whole transcript stays, scrollable (a tutor session).
  useEffect(() => {
    if (thread.length) {
      setActive(thread.length - 1);
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [stepCount, thread.length]);

  function history(): string {
    return thread
      .flat()
      .slice(-4)
      .map((c) => `You: ${c.question}\nGuide: ${c.headline ? c.headline + ". " : ""}${c.reply}`)
      .join("\n\n");
  }

  // Start a new cell.
  function pushGroup(card: AnswerCard) {
    setThread((t) => [...t, [card]]);
  }
  // Append a step to the current (last) cell — a continuation of the build-up.
  function pushStep(card: AnswerCard) {
    setThread((t) => {
      if (!t.length) return [[card]];
      const next = t.slice();
      next[next.length - 1] = [...next[next.length - 1], card];
      return next;
    });
  }

  // `continued` = is this a step in the current build-up, or a brand-new question?
  function send(q: string, continued = false) {
    if (!q.trim() || pending) return;
    const h = history();
    if (!continued) setInput("");
    const add = continued && thread.length ? pushStep : pushGroup;
    start(async () => {
      try {
        add(await turn(sessionId, q, h));
      } catch {
        add(fallbackCard(q, "That didn't reach the server. Check your connection and try again."));
      }
    });
  }

  function startBasics(topic: string) {
    if (!topic.trim() || pending) return;
    const h = history();
    start(async () => {
      try {
        pushGroup(await basics(sessionId, topic, h));
      } catch {
        pushGroup(fallbackCard(`Start from the basics: ${topic}`, "That didn't reach the server."));
      }
    });
  }

  function showSource(key: string, ids: number[]) {
    start(async () => {
      const s = await expandSources(ids);
      setSources((p) => ({ ...p, [key]: s.length ? s : ["No source passage on file."] }));
    });
  }

  function jumpTo(g: number) {
    setActive(g);
    document.getElementById(`group-${g}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

      {/* MIDDLE — Session transcript (one cell per build-up) */}
      <section className="flex flex-col overflow-y-auto p-6 lg:p-10">
        {thread.length === 0 ? (
          <div className="m-auto max-w-md space-y-3 text-center">
            <p className="text-sm text-neutral-700">Ask anything about AI ideas.</p>
            <p className="text-xs text-neutral-400">
              Pick a big question or a key idea on the left, or type on the right. You get a direct,
              grounded answer — with the tension preserved where it matters. Everything stays here as
              you go.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-8">
            {thread.map((group, g) => (
              <BuildUp
                key={g}
                id={`group-${g}`}
                group={group}
                active={g === active}
                live={g === thread.length - 1}
                pending={pending}
                sources={sources}
                sourceKey={(s) => `${g}-${s}`}
                onExplore={(term) => send(`What is ${term}, and why does it matter?`)}
                onRung={(name) => send(`What is ${name}, and why does it matter?`)}
                onContinue={(q) => send(q, true)}
                onBasics={(topic) => startBasics(topic)}
                onSource={(s, ids) => showSource(`${g}-${s}`, ids)}
              />
            ))}
            {pending && <p className="text-xs text-neutral-400">Thinking…</p>}
            <div ref={bottomRef} />
          </div>
        )}
      </section>

      {/* RIGHT — Conversation outline + ask */}
      <aside className="flex max-h-dvh flex-col border-t border-neutral-200 p-5 lg:border-t-0">
        <Label>Your session</Label>
        <div className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
          {thread.length === 0 ? (
            <p className="text-xs text-neutral-400">Ask a question to start.</p>
          ) : (
            thread.map((group, g) => (
              <button
                key={g}
                onClick={() => jumpTo(g)}
                className={
                  "block w-full rounded-lg border-l-2 px-2.5 py-1.5 text-left text-xs leading-snug " +
                  (g === active
                    ? "border-neutral-900 bg-neutral-50 text-neutral-900"
                    : "border-transparent text-neutral-500 hover:bg-neutral-50")
                }
              >
                {group[0].path ? "↳ basics: " : ""}
                {group[0].question.replace(/^Start from the basics: /, "")}
                {group.length > 1 && (
                  <span className="ml-1 text-neutral-400">· {group.length} steps</span>
                )}
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

function fallbackCard(question: string, reply: string): AnswerCard {
  return {
    question,
    headline: null,
    reply,
    table: null,
    branches: [],
    sourceConceptIds: [],
    outOfScope: false,
  };
}

// One build-up = one cell. Its steps stack and scroll inside the single bordered
// cell; only the LIVE edge (last step of the last group) carries the action row
// and clickable branches, so the learner advances the current thread in place.
function BuildUp({
  id,
  group,
  active,
  live,
  pending,
  sources,
  sourceKey,
  onExplore,
  onRung,
  onContinue,
  onBasics,
  onSource,
}: {
  id: string;
  group: AnswerCard[];
  active: boolean;
  live: boolean;
  pending: boolean;
  sources: Record<string, string[]>;
  sourceKey: (step: number) => string;
  onExplore: (term: string) => void;
  onRung: (name: string) => void;
  onContinue: (q: string) => void;
  onBasics: (topic: string) => void;
  onSource: (step: number, ids: number[]) => void;
}) {
  const topic = group[0].question;
  return (
    <article
      id={id}
      className={
        "scroll-mt-6 rounded-2xl border p-5 transition-colors " +
        (active ? "border-neutral-300" : "border-neutral-200")
      }
    >
      <p className="text-xs text-neutral-400">
        You asked: <span className="text-neutral-600">{topic}</span>
      </p>

      <div className="mt-4 divide-y divide-neutral-100">
        {group.map((card, s) => (
          <Step
            key={s}
            card={card}
            first={s === 0}
            source={sources[sourceKey(s)] ?? null}
            pending={pending}
            onExplore={onExplore}
            onRung={onRung}
            onSource={() => onSource(s, card.sourceConceptIds)}
          />
        ))}
      </div>

      {/* The live edge: branches + action row advance THIS build-up in place. */}
      {live && (
        <LiveEdge
          last={group[group.length - 1]}
          topic={topic}
          pending={pending}
          onContinue={onContinue}
          onBasics={() => onBasics(topic)}
        />
      )}
    </article>
  );
}

// A single step within a build-up: the answer body. The first step has no top
// padding; later steps are separated by a hairline divider so the build-up reads
// as one continuous unit rather than separate cards.
function Step({
  card,
  first,
  source,
  pending,
  onExplore,
  onRung,
  onSource,
}: {
  card: AnswerCard;
  first: boolean;
  source: string[] | null;
  pending: boolean;
  onExplore: (term: string) => void;
  onRung: (name: string) => void;
  onSource: () => void;
}) {
  return (
    <div className={"space-y-4 " + (first ? "" : "pt-5")}>
      {card.headline && card.headline !== card.question && (
        <h2 className="text-lg font-semibold leading-snug text-neutral-900">{card.headline}</h2>
      )}
      {card.reply && <Prose text={card.reply} glossary={card.glossary ?? []} onExplore={onExplore} />}

      {card.path && card.path.length > 0 && (
        <ol className="space-y-2">
          {card.path.map((r, n) => (
            <li key={r.id}>
              <button
                onClick={() => onRung(r.name)}
                disabled={pending}
                className="block w-full rounded-xl border border-neutral-200 p-3 text-left hover:border-neutral-400 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-neutral-900">
                  {n + 1}. {r.name}
                </span>
                <span className="block text-xs leading-snug text-neutral-500">{r.why}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {card.outOfScope && (
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          That's at the edge of this corpus — try a topic from the AI-foundations sessions.
        </p>
      )}

      {card.table && (
        <div className="space-y-1.5">
          <Label>Two views — it depends</Label>
          <TensionGrid table={card.table} />
        </div>
      )}

      {source && <SourceBlock passages={source} />}

      {card.sourceConceptIds.length > 0 && !source && (
        <button
          onClick={onSource}
          disabled={pending}
          className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline disabled:opacity-40"
        >
          Show the source
        </button>
      )}
    </div>
  );
}

// The live edge of a build-up: the last step's forward branches plus the action
// row. Everything here CONTINUES the current cell (onContinue), except the basics
// ladder, which is its own flow.
function LiveEdge({
  last,
  topic,
  pending,
  onContinue,
  onBasics,
}: {
  last: AnswerCard;
  topic: string;
  pending: boolean;
  onContinue: (q: string) => void;
  onBasics: () => void;
}) {
  return (
    <div className="mt-5 space-y-3 border-t border-neutral-100 pt-4">
      {last.branches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {last.branches.map((b, n) => (
            <button
              key={n}
              onClick={() => onContinue(b.ask)}
              disabled={pending}
              className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-40"
            >
              {b.label} <span aria-hidden className="text-neutral-400">→</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <ActionBtn onClick={onBasics} disabled={pending}>
          Start from the basics
        </ActionBtn>
        {ACTIONS.map((a) => (
          <ActionBtn key={a.label} onClick={() => onContinue(a.q)} disabled={pending}>
            {a.label}
          </ActionBtn>
        ))}
      </div>
    </div>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Prose with inline key terms: any artifact concept named in the text is dotted-
// underlined; hover shows its verbatim definition, click explores it (§7a-b).
function Prose({
  text,
  glossary,
  onExplore,
}: {
  text: string;
  glossary: GlossTerm[];
  onExplore: (term: string) => void;
}) {
  const cls = "text-sm leading-relaxed text-neutral-800";
  const terms = glossary.filter((g) => g.term && g.definition);
  if (!terms.length) return <p className={cls}>{text}</p>;

  const byLower = new Map(terms.map((t) => [t.term.toLowerCase(), t]));
  const re = new RegExp(
    `\\b(${[...terms]
      .sort((a, b) => b.term.length - a.term.length)
      .map((t) => escapeRe(t.term))
      .join("|")})\\b`,
    "gi",
  );

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const g = byLower.get(m[0].toLowerCase());
    nodes.push(
      g ? (
        <Term key={key++} word={m[0]} def={g.definition} onClick={() => onExplore(g.term)} />
      ) : (
        m[0]
      ),
    );
    last = idx + m[0].length;
  }
  nodes.push(text.slice(last));
  return <p className={cls}>{nodes}</p>;
}

function Term({ word, def, onClick }: { word: string; def: string; onClick: () => void }) {
  return (
    <span className="group relative inline">
      <button
        onClick={onClick}
        className="cursor-help underline decoration-dotted decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
      >
        {word}
      </button>
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-64 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg group-hover:block">
        {def}
      </span>
    </span>
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
