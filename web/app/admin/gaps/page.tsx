import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { gapLog } from "@/lib/db/schema";

// Admin gap queue (M4 gap loop): out-of-corpus goals as curation candidates.
// Gated by a shared secret: /admin/gaps?key=$ADMIN_TOKEN. If ADMIN_TOKEN is
// unset the page 404s (admin disabled), so it can't be reached by accident.
export const dynamic = "force-dynamic";

export default async function GapQueue({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const token = process.env.ADMIN_TOKEN;
  const { key } = await searchParams;
  if (!token || key !== token) notFound();

  const rows = await db
    .select()
    .from(gapLog)
    .where(eq(gapLog.resolved, false))
    .orderBy(desc(gapLog.createdAt))
    .limit(200);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Gap queue</h1>
      <p className="mt-1 text-xs text-neutral-500">
        {rows.length} unresolved out-of-corpus goal{rows.length === 1 ? "" : "s"} — curation candidates.
      </p>
      <ul className="mt-6 divide-y divide-neutral-100">
        {rows.length === 0 ? (
          <li className="py-4 text-sm text-neutral-500">Nothing in the queue.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-sm text-neutral-800">{r.goalText}</span>
              <time className="shrink-0 text-xs text-neutral-400">
                {new Date(r.createdAt).toLocaleString()}
              </time>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
