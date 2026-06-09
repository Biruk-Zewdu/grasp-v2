import { notFound } from "next/navigation";
import Guide from "../../../guide";
import { AuthInit } from "../../../auth-init";
import { getCatalog, versionStatus } from "@/lib/db/records";
import type { Catalog } from "@/lib/guide/types";

// The conversational Guide over a version, reached from the dashboard hub. An
// optional ?q= seeds the first question (e.g. a study-path subtopic click).
export const dynamic = "force-dynamic";

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ v: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { v } = await params;
  const { q } = await searchParams;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();

  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();

  const catalog: Catalog = await getCatalog(versionId);
  return (
    <>
      <AuthInit />
      <Guide catalog={catalog} versionId={versionId} initialQuestion={q ?? null} />
    </>
  );
}
