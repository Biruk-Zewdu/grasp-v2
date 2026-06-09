"use client";

import { useRouter } from "next/navigation";
import { Logo } from "./logo";

// The persistent left sidebar (StudyFetch-style): the uploaded file up top, then
// the tools under it. Shown on document pages so the learner always knows what
// they're studying and can jump between tools. `active` highlights the current one.

export type ToolKey = "home" | "understand" | "sheet" | "quiz" | "flashcards" | "concepts" | "debate" | "guide";

const TOOLS: { key: ToolKey; path: string; label: string; icon: string }[] = [
  { key: "home", path: "", label: "Overview", icon: "▦" },
  { key: "understand", path: "/understand", label: "First principles", icon: "📖" },
  { key: "sheet", path: "/sheet", label: "Study sheet", icon: "📝" },
  { key: "quiz", path: "/quiz", label: "Quiz", icon: "✓" },
  { key: "flashcards", path: "/flashcards", label: "Flashcards", icon: "🗂" },
  { key: "concepts", path: "/concepts", label: "Concepts", icon: "◈" },
  { key: "debate", path: "/debate", label: "The debate", icon: "⚖" },
  { key: "guide", path: "/guide", label: "Ask anything", icon: "💬" },
];

export default function ToolSidebar({
  versionId,
  title,
  active,
  hasTension = true,
  hasAssessment = true,
}: {
  versionId: number;
  title: string;
  active: ToolKey;
  hasTension?: boolean;
  hasAssessment?: boolean;
}) {
  const router = useRouter();
  const go = (p: string) => router.push(`/learn/${versionId}${p}`);

  const visible = TOOLS.filter(
    (t) => (t.key !== "debate" || hasTension) && (t.key !== "quiz" || hasAssessment),
  );

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-neutral-200 bg-white lg:flex">
      {/* brand */}
      <button onClick={() => router.push("/")} className="flex h-14 shrink-0 items-center gap-2.5 border-b border-neutral-100 px-5">
        <Logo className="h-6 w-6 text-neutral-900" />
        <span className="text-base font-semibold tracking-tight">grasp</span>
      </button>

      {/* the uploaded file */}
      <div className="border-b border-neutral-100 p-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-sm">📄</span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Studying</p>
            <p className="line-clamp-3 text-[13px] font-medium leading-snug text-neutral-800">{title}</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          className="mt-3 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-800"
        >
          + New document
        </button>
      </div>

      {/* tools */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {visible.map((t) => (
          <button
            key={t.key}
            onClick={() => go(t.path)}
            className={
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors " +
              (t.key === active
                ? "bg-neutral-900 font-medium text-white"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900")
            }
          >
            <span className="w-4 text-center text-xs">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
