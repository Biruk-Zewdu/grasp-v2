import { notFound } from "next/navigation";
import Guide from "../../guide";
import { AuthInit } from "../../auth-init";
import { getCatalog, versionStatus } from "@/lib/db/records";
import type { Catalog } from "@/lib/guide/types";

// The learning view over a specific artifact version (Phase D): the Guide, the
// lesson rail, and assessments all read THIS version id — uploaded or example.
// Everything downstream (renderTension, provenance) is already version-parameterized.
export const dynamic = "force-dynamic";

export default async function LearnPage({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();

  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();

  const catalog: Catalog = await getCatalog(versionId);
  return (
    <>
      <AuthInit />
      <Guide catalog={catalog} versionId={versionId} />
    </>
  );
}
