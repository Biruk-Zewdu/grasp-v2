"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { build, buildStatus } from "./build-actions";
import { Logo } from "./logo";

// The landing surface (Phase C): upload a PDF / paste text → watch the operators
// turn it into a typed knowledge artifact → route into the learning view. The
// "reveal" is the professor's money shot: it SHOWS the transformation (the answer
// to "what does it do with the PDF"), and it turns the ~15-40s extraction wait
// into the feature instead of a spinner.

// The operator sequence we narrate while the (single) extraction call runs. These
// are illustrative stages of the real pipeline (normalize → concepts → relations →
// claims → tension detection → sources), paced so the learner sees the structure
// being built. The actual build is one grounded call; this is honest scaffolding
// of what that call produces, not fake work.
const STAGES = [
  { label: "Reading the document", detail: "splitting into passages" },
  { label: "Extracting concepts", detail: "the meaningful units" },
  { label: "Linking relations", detail: "how the ideas connect" },
  { label: "Surfacing claims", detail: "what the document asserts" },
  { label: "Checking for a tension", detail: "is there a contested point?" },
  { label: "Anchoring sources", detail: "every claim to its passage" },
];

type Phase = "idle" | "building" | "done" | "error";

export default function Upload({ exampleVersionId }: { exampleVersionId: number | null }) {
  const router = useRouter();
  const [sessionId] = useState(
    () => globalThis.crypto?.randomUUID?.() ?? String(Math.random()),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ versionId: number; conceptCount: number; hasTension: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Advance the narrated stages while building (caps just before the last so it
  // never claims "done" before the server says so).
  useEffect(() => {
    if (phase !== "building") return;
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(t);
  }, [phase]);

  async function runBuild(form: FormData) {
    setPhase("building");
    setStage(0);
    setError(null);
    const res = await build(form, sessionId);
    if (res.ok) {
      setResult(res);
      setStage(STAGES.length - 1);
      setPhase("done");
      // brief beat on the finished reveal, then into the learning view
      setTimeout(() => router.push(`/learn/${res.versionId}`), 1400);
    } else {
      setError(friendlyError(res.reason));
      setPhase("error");
    }
  }

  function acceptFile(file: File | undefined | null) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    runBuild(form);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0]);
  }

  // Drag-and-drop: we must preventDefault on BOTH dragover and drop, or the
  // browser navigates to / opens the dropped file (the "new tab" bug).
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }

  function onPaste() {
    if (text.trim().length < 200) {
      setError("Paste a bit more text — at least a couple of paragraphs.");
      setPhase("error");
      return;
    }
    const form = new FormData();
    form.set("text", text);
    runBuild(form);
  }

  if (phase === "building" || phase === "done") {
    return <Reveal stage={stage} done={phase === "done"} result={result} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-8 px-6 py-12">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-10 w-10 text-neutral-900" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">grasp</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload what you want to understand. Grasp turns it into a structured lesson —
          concepts, sources, and the tension where it matters.
        </p>
      </div>

      {/* Upload card */}
      <div className="w-full space-y-4">
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={
            "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors " +
            (dragging
              ? "border-neutral-500 bg-neutral-100"
              : "border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50")
          }
        >
          <span className="text-sm font-medium text-neutral-800">
            {dragging ? "Drop to build your lesson" : "Drop a PDF, or click to choose"}
          </span>
          <span className="text-xs text-neutral-400">Works best on focused materials (~5–15 pages)</span>
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={onFile} />

        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" /> or paste text <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste an article, your notes, a section of a paper…"
          rows={4}
          className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-neutral-400"
        />
        <button
          onClick={onPaste}
          disabled={!text.trim()}
          className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
        >
          Build my lesson
        </button>

        {error && <p className="text-center text-xs text-red-600">{error}</p>}

        {exampleVersionId != null && (
          <button
            onClick={() => router.push(`/learn/${exampleVersionId}`)}
            className="w-full text-center text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline"
          >
            …or explore a ready-made example
          </button>
        )}
      </div>
    </main>
  );
}

function Reveal({
  stage,
  done,
  result,
}: {
  stage: number;
  done: boolean;
  result: { conceptCount: number; hasTension: boolean } | null;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-9 w-9 text-neutral-900" />
        <h2 className="mt-3 text-lg font-semibold tracking-tight">
          {done ? "Your knowledge map is ready" : "Building your knowledge map…"}
        </h2>
        {done && result && (
          <p className="mt-1 text-sm text-neutral-500">
            {result.conceptCount} concepts
            {result.hasTension ? " · a contested point detected" : ""} — opening your lesson…
          </p>
        )}
      </div>

      <ol className="w-full space-y-2.5">
        {STAGES.map((s, i) => {
          const state = i < stage || done ? "done" : i === stage ? "active" : "pending";
          return (
            <li
              key={s.label}
              className={
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors " +
                (state === "done"
                  ? "border-neutral-200 bg-white"
                  : state === "active"
                    ? "border-neutral-400 bg-white shadow-sm"
                    : "border-neutral-100 bg-neutral-50")
              }
            >
              <Dot state={state} />
              <div className="flex-1">
                <div className={"text-sm " + (state === "pending" ? "text-neutral-400" : "text-neutral-800")}>
                  {s.label}
                </div>
                <div className="text-xs text-neutral-400">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function Dot({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-[11px] text-white">✓</span>
    );
  if (state === "active")
    return <span className="h-5 w-5 animate-pulse rounded-full border-2 border-neutral-400 bg-white" />;
  return <span className="h-5 w-5 rounded-full border-2 border-neutral-200 bg-white" />;
}

function friendlyError(reason: string): string {
  switch (reason) {
    case "extraction-unavailable":
      return "Building a lesson needs the live model. Set SERVE_MODE=live with an API key.";
    case "too-short":
    case "no-content":
      return "That document was too short to build a lesson from. Try a fuller one.";
    case "could-not-read-file":
      return "Couldn't read that file. Try a text-based PDF (not a scan) or paste the text.";
    case "no-input":
      return "Choose a PDF or paste some text first.";
    default:
      if (reason.includes("budget")) return "Hit the usage limit for now — give it a minute and try again.";
      if (reason.includes("api-error") || reason.includes("connection") || reason.includes("EMAXCONN"))
        return "Couldn't reach the service to build the lesson. Try again in a moment.";
      return "Something went wrong building the lesson. Try again.";
  }
}
