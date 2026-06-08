"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { readLesson, ask, lessonSources, type LessonView, type AskAnswer } from "./learn-actions";
import { Logo } from "./logo";
import { Prose, TensionBlock, SourceBlock } from "./lesson-parts";
import type { Catalog } from "@/lib/guide/types";

// The revamped "Understand" surface: a lesson READER, not an empty chat box. The
// learner lands on a real, rendered lesson for the first subtopic; the left rail
// is the document's sections (a textbook contents); each section is grounded
// teaching material — prose with glossed key terms, the verbatim tension when the
// section turns on one, and sources on demand. A follow-up box lets the learner
// ask within the lesson, and answers stack below it (in context, never an
// empty void).

type Sub = { id: number; title: string; summary: string | null };
type Follow = { q: string; a: AskAnswer | null };

export default function Reader({
  versionId,
  title,
  subtopics,
}: {
  versionId: number;
  title: string;
  subtopics: Sub[];
}) {
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [activeId, setActiveId] = useState<number | null>(subtopics[0]?.id ?? null);
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [loading, startLoad] = useTransition();
  const [follows, setFollows] = useState<Follow[]>([]);
  const [input, setInput] = useState("");
  const [asking, startAsk] = useTransition();
  const [src, setSrc] = useState<string[] | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // Load (or compose) the lesson whenever the active section changes.
  useEffect(() => {
    if (activeId == null) return;
    setLesson(null);
    setFollows([]);
    setSrc(null);
    startLoad(async () => {
      const l = await readLesson(sessionId, activeId);
      setLesson(l);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const activeSub = subtopics.find((s) => s.id === activeId);

  function send() {
    const q = input.trim();
    if (!q || asking) return;
    setInput("");
    const ctx = lessonContext();
    setFollows((f) => [...f, { q, a: null }]);
    startAsk(async () => {
      const a = await ask(sessionId, q, ctx, versionId);
      setFollows((f) => f.map((x, i) => (i === f.length - 1 ? { ...x, a } : x)));
    });
  }

  function lessonContext(): string {
    const head = lesson ? `Lesson: ${lesson.headline}\n${lesson.body}` : "";
    const qa = follows
      .filter((f) => f.a)
      .map((f) => `You: ${f.q}\nGuide: ${f.a!.reply}`)
      .join("\n\n");
    return [head, qa].filter(Boolean).join("\n\n").slice(0, 6000);
  }

  function showSources() {
    if (!lesson) return;
    startAsk(async () => {
      const s = await lessonSources(lesson.sourceConceptIds);
      setSrc(s.length ? s : ["No source passage on file."]);
    });
  }

  const i = subtopics.findIndex((s) => s.id === activeId);

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a
          href={`/learn/${versionId}`}
          className="rounded-lg px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Back to dashboard"
        >
          ←
        </a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">{title}</span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* LEFT — contents */}
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white p-4 lg:flex">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Sections</p>
          <ol className="space-y-0.5">
            {subtopics.map((s, n) => (
              <li key={s.id}>
                <button
                  onClick={() => setActiveId(s.id)}
                  className={
                    "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors " +
                    (s.id === activeId ? "bg-neutral-100" : "hover:bg-neutral-50")
                  }
                >
                  <span
                    className={
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium " +
                      (s.id === activeId ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-500")
                    }
                  >
                    {n + 1}
                  </span>
                  <span className={"text-[13px] leading-snug " + (s.id === activeId ? "font-medium text-neutral-900" : "text-neutral-600")}>
                    {s.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* CENTER — the lesson */}
        <section className="min-h-0 overflow-y-auto px-5 py-8 lg:px-12">
          <div ref={topRef} className="mx-auto w-full max-w-2xl">
            {/* mobile section picker */}
            <div className="mb-4 flex flex-wrap gap-1.5 lg:hidden">
              {subtopics.map((s, n) => (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={
                    "rounded-full px-2.5 py-1 text-xs " +
                    (s.id === activeId ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600")
                  }
                >
                  {n + 1}
                </button>
              ))}
            </div>

            {loading || !lesson ? (
              <LessonSkeleton title={activeSub?.title ?? ""} />
            ) : lesson.unavailable ? (
              <p className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">
                Composing this lesson needs the live model. Set <code>SERVE_MODE=live</code> with an API key.
              </p>
            ) : (
              <article className="space-y-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    Section {i + 1} of {subtopics.length}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{lesson.headline}</h1>
                </div>
                <Prose text={lesson.body} glossary={lesson.glossary} onExplore={(t) => { setInput(`Tell me more about ${t}.`); }} />
                {lesson.table && <TensionBlock table={lesson.table} />}
                {src && <SourceBlock passages={src} />}
                {lesson.sourceConceptIds.length > 0 && !src && (
                  <button
                    onClick={showSources}
                    disabled={asking}
                    className="text-xs font-medium text-neutral-500 underline-offset-2 transition-colors hover:text-neutral-800 hover:underline disabled:opacity-40"
                  >
                    Show the source
                  </button>
                )}

                {/* follow-ups stack here, in context */}
                {follows.length > 0 && (
                  <div className="space-y-4 border-t border-neutral-100 pt-5">
                    {follows.map((f, n) => (
                      <div key={n} className="space-y-2">
                        <p className="text-sm font-medium text-neutral-900">{f.q}</p>
                        {f.a == null ? (
                          <p className="text-xs text-neutral-400">Thinking…</p>
                        ) : (
                          <>
                            <Prose text={f.a.reply} glossary={f.a.glossary} onExplore={(t) => setInput(`Tell me more about ${t}.`)} />
                            {f.a.table && <TensionBlock table={f.a.table} />}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* nav + ask */}
                <div className="flex items-center justify-between border-t border-neutral-100 pt-5">
                  <button
                    onClick={() => i > 0 && setActiveId(subtopics[i - 1].id)}
                    disabled={i <= 0}
                    className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30"
                  >
                    ‹ Previous
                  </button>
                  <button
                    onClick={() => i < subtopics.length - 1 && setActiveId(subtopics[i + 1].id)}
                    disabled={i >= subtopics.length - 1}
                    className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-30"
                  >
                    Next section ›
                  </button>
                </div>
              </article>
            )}

            {/* ask box — always present, never an empty void */}
            <form
              className="mt-6 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about this section…"
                className="flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
              />
              <button
                type="submit"
                disabled={asking || !input.trim()}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
              >
                {asking ? "…" : "Ask"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

function LessonSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold leading-tight tracking-tight text-neutral-900">{title}</h1>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-neutral-200" style={{ width: `${90 - i * 8}%` }} />
        ))}
      </div>
      <p className="text-xs text-neutral-400">Composing the lesson from the document…</p>
    </div>
  );
}
