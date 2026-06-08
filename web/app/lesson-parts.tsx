"use client";

import type { TensionTable } from "@/lib/render";
import type { GlossTerm } from "@/lib/guide/types";

// Shared render parts for lessons and answers: prose with inline glossed key
// terms, the verbatim tension table, and a source block. The model never writes
// the tension cells — they come from the record (renderTension).

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function Prose({
  text,
  glossary,
  onExplore,
}: {
  text: string;
  glossary: GlossTerm[];
  onExplore: (term: string) => void;
}) {
  const cls = "text-[15px] leading-relaxed text-neutral-800";
  const terms = glossary.filter((g) => g.term && g.definition);
  // Render paragraphs (split on blank lines) so a multi-paragraph lesson reads well.
  const paras = text.split(/\n{2,}/).filter((p) => p.trim());

  if (!terms.length) {
    return (
      <div className="space-y-3">
        {paras.map((p, i) => (
          <p key={i} className={cls}>
            {p}
          </p>
        ))}
      </div>
    );
  }

  const byLower = new Map(terms.map((t) => [t.term.toLowerCase(), t]));
  const re = new RegExp(
    `\\b(${[...terms].sort((a, b) => b.term.length - a.term.length).map((t) => escapeRe(t.term)).join("|")})\\b`,
    "gi",
  );

  const renderPara = (para: string, pkey: number) => {
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let key = 0;
    for (const m of para.matchAll(re)) {
      const idx = m.index ?? 0;
      if (idx > last) nodes.push(para.slice(last, idx));
      const g = byLower.get(m[0].toLowerCase());
      nodes.push(
        g ? <Term key={key++} word={m[0]} def={g.definition} onClick={() => onExplore(g.term)} /> : m[0],
      );
      last = idx + m[0].length;
    }
    nodes.push(para.slice(last));
    return (
      <p key={pkey} className={cls}>
        {nodes}
      </p>
    );
  };

  return <div className="space-y-3">{paras.map(renderPara)}</div>;
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

export function TensionBlock({ table }: { table: TensionTable }) {
  return (
    <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">The catch — two views, it depends</p>
      {table.dimension && <p className="text-sm font-medium text-neutral-700">{table.dimension}</p>}
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

function Cell({ children, head, muted }: { children: React.ReactNode; head?: boolean; muted?: boolean }) {
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

export function SourceBlock({ passages }: { passages: string[] }) {
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
