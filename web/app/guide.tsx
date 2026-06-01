"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { turn, basics, expandSources } from "./actions";
import { Logo } from "./logo";
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
// (ask box, a left-pane big question / key idea, a basics ladder) starts a fresh
// group = a new cell. A CONTINUATION of the current thread (Go deeper / example /
// opposing view / explain simply, or following a → branch) appends a STEP inside
// the last group's cell — those steps are one build-up, not separate questions.
// Each step carries a stable client id so it can be reordered (drag or ↑↓) and so
// revealed sources stay attached to the right step after a move.
type Step = { id: string; card: AnswerCard };
type Group = Step[];

let _sid = 0;
function mkStep(card: AnswerCard): Step {
  const id = globalThis.crypto?.randomUUID?.() ?? `s${_sid++}`;
  return { id, card };
}

export default function Guide({ catalog }: { catalog: Catalog }) {
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [thread, setThread] = useState<Group[]>([]);
  const [active, setActive] = useState<number | null>(null);
  // Revealed source passages, keyed by "groupIndex-stepId" (stable across reorder).
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
      .map(
        ({ card: c }) =>
          `You: ${c.question}\nGuide: ${c.headline ? c.headline + ". " : ""}${c.reply}`,
      )
      .join("\n\n");
  }

  // Start a new cell.
  function pushGroup(card: AnswerCard) {
    setThread((t) => [...t, [mkStep(card)]]);
  }
  // Append a step to the current (last) cell — a continuation of the build-up.
  function pushStep(card: AnswerCard) {
    setThread((t) => {
      if (!t.length) return [[mkStep(card)]];
      const next = t.slice();
      next[next.length - 1] = [...next[next.length - 1], mkStep(card)];
      return next;
    });
  }

  // Reorder steps within one cell (drag drop or the ↑↓ nudge buttons).
  function reorder(g: number, from: number, to: number) {
    if (from === to) return;
    setThread((t) => {
      const next = t.slice();
      const grp = next[g].slice();
      const [moved] = grp.splice(from, 1);
      grp.splice(to, 0, moved);
      next[g] = grp;
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

  // Source toggle: load on first open, fold back (remove) when already open.
  function toggleSource(key: string, ids: number[]) {
    if (sources[key]) {
      setSources((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
      return;
    }
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
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      {/* TOP BAR — spans the full width so the app reads as one product */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Logo className="h-6 w-6 text-neutral-900" />
          <span className="text-base font-semibold tracking-tight">grasp</span>
          <span className="hidden text-xs text-neutral-400 sm:inline">
            — a guide to AI ideas, one at a time
          </span>
        </div>
        {pending && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
            thinking…
          </span>
        )}
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[264px_1fr_360px]">
        {/* LEFT — Explore */}
        <aside className="hidden min-h-0 flex-col gap-7 overflow-y-auto border-r border-neutral-200 bg-white p-5 lg:flex">
          <Section title="Big questions">
            <div className="-mx-1 space-y-0.5">
              {catalog.questions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => send(q.text)}
                  disabled={pending}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
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
                  className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </Section>
        </aside>

        {/* MIDDLE — Session transcript (one cell per build-up) */}
        <section className="min-h-0 overflow-y-auto px-5 py-8 lg:px-10">
          {thread.length === 0 ? (
            <EmptyState
              questions={catalog.questions.slice(0, 3)}
              onPick={(q) => send(q)}
              disabled={pending}
            />
          ) : (
            <div className="mx-auto w-full max-w-2xl space-y-6">
              {thread.map((group, g) => (
                <BuildUp
                  key={g}
                  id={`group-${g}`}
                  group={group}
                  active={g === active}
                  live={g === thread.length - 1}
                  pending={pending}
                  sources={sources}
                  sourceKey={(stepId) => `${g}-${stepId}`}
                  onReorder={(from, to) => reorder(g, from, to)}
                  onExplore={(term) => send(`What is ${term}, and why does it matter?`)}
                  onRung={(name) => send(`What is ${name}, and why does it matter?`)}
                  onContinue={(q) => send(q, true)}
                  onBasics={(topic) => startBasics(topic)}
                  onToggleSource={(stepId, ids) => toggleSource(`${g}-${stepId}`, ids)}
                />
              ))}
              {pending && (
                <p className="px-1 text-xs text-neutral-400">Thinking…</p>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        {/* RIGHT — Conversation outline + ask */}
        <aside className="flex min-h-0 flex-col border-t border-neutral-200 bg-white p-5 lg:border-l lg:border-t-0">
          <Label>Your session</Label>
          <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {thread.length === 0 ? (
              <p className="text-xs text-neutral-400">Ask a question to start.</p>
            ) : (
              thread.map((group, g) => (
                <button
                  key={g}
                  onClick={() => jumpTo(g)}
                  className={
                    "block w-full rounded-lg border-l-2 px-2.5 py-1.5 text-left text-xs leading-snug transition-colors " +
                    (g === active
                      ? "border-neutral-900 bg-neutral-100 text-neutral-900"
                      : "border-transparent text-neutral-500 hover:bg-neutral-50")
                  }
                >
                  {group[0].card.path ? "↳ basics: " : ""}
                  {group[0].card.question.replace(/^Start from the basics: /, "")}
                  {group.length > 1 && (
                    <span className="ml-1 text-neutral-400">· {group.length} steps</span>
                  )}
                </button>
              ))
            )}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400 focus:bg-white"
              placeholder="Ask a follow-up…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
            >
              {pending ? "…" : "Ask"}
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}

function EmptyState({
  questions,
  onPick,
  disabled,
}: {
  questions: { id: number; text: string }[];
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <Logo className="h-7 w-7 text-neutral-900" />
      </div>
      <h2 className="text-base font-semibold text-neutral-900">Ask anything about AI ideas</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
        You get a direct, grounded answer — with the tension preserved where it matters. Everything
        you explore stays here as you go.
      </p>
      <div className="mt-5 w-full space-y-1.5">
        {questions.map((q) => (
          <button
            key={q.id}
            onClick={() => onPick(q.text)}
            disabled={disabled}
            className="block w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-[13px] text-neutral-700 shadow-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
          >
            {q.text}
          </button>
        ))}
      </div>
    </div>
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

// One build-up = one cell. Its steps stack and scroll inside the single card and
// can be reordered (drag the grip, or ↑↓) — scoped to THIS cell by its own
// DndContext. Only the LIVE edge (last step of the last group) carries the action
// row and clickable branches, so the learner advances the current thread in place.
function BuildUp({
  id,
  group,
  active,
  live,
  pending,
  sources,
  sourceKey,
  onReorder,
  onExplore,
  onRung,
  onContinue,
  onBasics,
  onToggleSource,
}: {
  id: string;
  group: Group;
  active: boolean;
  live: boolean;
  pending: boolean;
  sources: Record<string, string[]>;
  sourceKey: (stepId: string) => string;
  onReorder: (from: number, to: number) => void;
  onExplore: (term: string) => void;
  onRung: (name: string) => void;
  onContinue: (q: string) => void;
  onBasics: (topic: string) => void;
  onToggleSource: (stepId: string, ids: number[]) => void;
}) {
  const topic = group[0].card.question;
  const ids = group.map((s) => s.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (over && a.id !== over.id) {
      onReorder(ids.indexOf(a.id as string), ids.indexOf(over.id as string));
    }
  }

  return (
    <article
      id={id}
      className={
        "scroll-mt-6 rounded-2xl border bg-white p-5 shadow-sm transition-shadow " +
        (active ? "border-neutral-300 shadow-md" : "border-neutral-200")
      }
    >
      <p className="text-xs text-neutral-400">
        You asked: <span className="text-neutral-600">{topic}</span>
      </p>

      <div className="mt-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-neutral-100">
              {group.map((s, i) => (
                <SortableStep
                  key={s.id}
                  id={s.id}
                  card={s.card}
                  index={i}
                  count={group.length}
                  first={i === 0}
                  source={sources[sourceKey(s.id)] ?? null}
                  pending={pending}
                  onUp={() => onReorder(i, i - 1)}
                  onDown={() => onReorder(i, i + 1)}
                  onExplore={onExplore}
                  onRung={onRung}
                  onToggleSource={() => onToggleSource(s.id, s.card.sourceConceptIds)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* The live edge: branches + action row advance THIS build-up in place. */}
      {live && (
        <LiveEdge
          last={group[group.length - 1].card}
          pending={pending}
          onContinue={onContinue}
          onBasics={() => onBasics(topic)}
        />
      )}
    </article>
  );
}

// A draggable, reorderable wrapper around one step. Only the grip handle starts a
// drag (the rest of the step stays clickable/selectable); ↑↓ nudge as an
// accessible alternative. The "Step N" controls row only appears once a build-up
// has more than one step.
function SortableStep({
  id,
  card,
  index,
  count,
  first,
  source,
  pending,
  onUp,
  onDown,
  onExplore,
  onRung,
  onToggleSource,
}: {
  id: string;
  card: AnswerCard;
  index: number;
  count: number;
  first: boolean;
  source: string[] | null;
  pending: boolean;
  onUp: () => void;
  onDown: () => void;
  onExplore: (term: string) => void;
  onRung: (name: string) => void;
  onToggleSource: () => void;
}) {
  // Keyed by the step's stable id — must match an entry in SortableContext items.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = { transform: CSS.Translate.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "group/step relative " +
        (first ? "" : "pt-5 ") +
        (isDragging ? "z-10 rounded-xl bg-white opacity-90 shadow-lg ring-1 ring-neutral-200" : "")
      }
    >
      {count > 1 && (
        <div className="mb-2 flex items-center gap-1 opacity-60 transition-opacity group-hover/step:opacity-100">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
            className="cursor-grab touch-none rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 active:cursor-grabbing"
          >
            <Grip />
          </button>
          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-300">
            Step {index + 1}
          </span>
          <span className="flex-1" />
          <NudgeBtn onClick={onUp} disabled={index === 0} label="Move up">
            ↑
          </NudgeBtn>
          <NudgeBtn onClick={onDown} disabled={index === count - 1} label="Move down">
            ↓
          </NudgeBtn>
        </div>
      )}

      <StepBody
        card={card}
        source={source}
        pending={pending}
        onExplore={onExplore}
        onRung={onRung}
        onToggleSource={onToggleSource}
      />
    </div>
  );
}

function StepBody({
  card,
  source,
  pending,
  onExplore,
  onRung,
  onToggleSource,
}: {
  card: AnswerCard;
  source: string[] | null;
  pending: boolean;
  onExplore: (term: string) => void;
  onRung: (name: string) => void;
  onToggleSource: () => void;
}) {
  return (
    <div className="space-y-4">
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
                className="block w-full rounded-xl border border-neutral-200 p-3 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
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

      {card.sourceConceptIds.length > 0 && (
        <button
          onClick={onToggleSource}
          disabled={pending}
          className="text-xs font-medium text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-800 hover:underline disabled:opacity-40"
        >
          {source ? "Hide the source" : "Show the source"}
        </button>
      )}
    </div>
  );
}

// The live edge of a build-up: the last step's forward branches plus the action
// row. Everything here CONTINUES the current cell, except the basics ladder.
function LiveEdge({
  last,
  pending,
  onContinue,
  onBasics,
}: {
  last: AnswerCard;
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
              className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-100 disabled:opacity-40"
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

function Grip() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="3" r="1.3" />
      <circle cx="7.5" cy="3" r="1.3" />
      <circle cx="2.5" cy="8" r="1.3" />
      <circle cx="7.5" cy="8" r="1.3" />
      <circle cx="2.5" cy="13" r="1.3" />
      <circle cx="7.5" cy="13" r="1.3" />
    </svg>
  );
}

function NudgeBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded p-1 text-xs leading-none text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
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
    <span className="group/term relative inline">
      <button
        onClick={onClick}
        className="cursor-help underline decoration-dotted decoration-neutral-400 underline-offset-2 hover:text-neutral-950"
      >
        {word}
      </button>
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-64 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg group-hover/term:block">
        {def}
      </span>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
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
      className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-40"
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
