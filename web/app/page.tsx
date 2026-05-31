import { artifactStats } from "@/lib/db/queries";

// Serve reads the live frozen artifact, not a build-time snapshot.
export const dynamic = "force-dynamic";

// M3 scaffold surface. This is NOT the Guide yet — it's a wire-check that the
// serve layer reads the frozen v1 artifact end to end (Drizzle over Supabase).
// The real single-surface Guide (goal box -> Step -> deeper -> ask) lands next.
export default async function Home() {
  const stats = await artifactStats();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Grasp</h1>
        <p className="text-sm text-neutral-500">An AI system for studying AI ideas.</p>
      </header>

      {stats ? (
        <section className="space-y-3 rounded-2xl border border-neutral-200 p-5">
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            Serving corpus{" "}
            <span className="font-medium text-neutral-700">{stats.version.label}</span>{" "}
            (frozen)
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Concepts" value={stats.entities} />
            <Stat label="Claims" value={stats.claims} />
            <Stat label="Tensions" value={stats.tensions} />
            <Stat label="Probes" value={stats.probes} />
          </dl>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          No frozen corpus version found. Freeze one first
          (<code>db/freeze.py freeze</code>).
        </section>
      )}

      <p className="text-xs text-neutral-400">
        Scaffold — the Guide (sequencer · renderer · single surface) is next.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
