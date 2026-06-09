"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Assessment from "./assessment";
import { Logo } from "./logo";

// Quiz as a full page. Pre = baseline before learning, post = the gain after. The
// Assessment component carries the take→submit→teaching-feedback flow; here it sits
// on a real page with a phase toggle.

export default function QuizScreen({ versionId, title }: { versionId: number; title: string }) {
  const router = useRouter();
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? String(Math.random()));
  const [phase, setPhase] = useState<"pre" | "post">("pre");
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex h-14 items-center gap-2.5 border-b border-neutral-200 bg-white/80 px-5 backdrop-blur">
        <a href={`/learn/${versionId}`} className="rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">←</a>
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="truncate text-sm font-medium text-neutral-700">Quiz · {title}</span>
        <div className="ml-auto flex gap-1 rounded-full bg-neutral-100 p-0.5">
          {(["pre", "post"] as const).map((p) => (
            <button
              key={p}
              onClick={() => { setPhase(p); setOpen(true); }}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (phase === p ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500")
              }
            >
              {p === "pre" ? "Before" : "After"}
            </button>
          ))}
        </div>
      </header>

      {open ? (
        <Assessment versionId={versionId} sessionId={sessionId} phase={phase} onClose={() => router.push(`/learn/${versionId}`)} />
      ) : null}
    </div>
  );
}
