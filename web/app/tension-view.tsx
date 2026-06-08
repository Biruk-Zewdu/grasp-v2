"use client";

import { useEffect, useState } from "react";
import { tensionTable } from "./hub-actions";
import type { TensionTable } from "@/lib/render";

// "The debate" — the preserved tension as a verbatim two-column table. This is the
// differentiator: both sides, both conditions, rendered from the record, never
// resolved by the model. Opens as a modal from the dashboard.

export default function TensionView({ tensionId, onClose }: { tensionId: number; onClose: () => void }) {
  const [table, setTable] = useState<TensionTable | null | "loading">("loading");

  useEffect(() => {
    tensionTable(tensionId).then((t) => setTable(t));
  }, [tensionId]);

  return (
    <Overlay onClose={onClose}>
      <div className="border-b border-neutral-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-neutral-900">The debate</h2>
        <p className="text-xs text-neutral-400">
          A contested point this document turns on — both sides, as the source states them. Not resolved.
        </p>
      </div>
      <div className="px-5 py-4">
        {table === "loading" ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : table == null ? (
          <p className="text-sm text-neutral-500">No tension is recorded for this document.</p>
        ) : (
          <div className="space-y-3">
            {table.dimension && <p className="text-sm font-medium text-neutral-700">{table.dimension}</p>}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-neutral-200 text-xs">
              <Cell head>{table.labelA}</Cell>
              <Cell head>{table.labelB}</Cell>
              <Cell>{table.propA}</Cell>
              <Cell>{table.propB}</Cell>
              <Cell muted>When: {table.whenA}</Cell>
              <Cell muted>When: {table.whenB}</Cell>
            </div>
            <p className="pt-1 text-xs text-neutral-400">
              Both views are kept. Which holds depends on the conditions above — that's the point.
            </p>
          </div>
        )}
      </div>
    </Overlay>
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

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-neutral-900/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
