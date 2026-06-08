import { notFound } from "next/navigation";
import Dashboard from "../../dashboard";
import { AuthInit } from "../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

// The document dashboard hub (the StudyFetch-leaning landing after a build): a
// home for this document with a grid of named tools over the study path. The
// conversational Guide lives at /learn/[v]/guide.
export const dynamic = "force-dynamic";

export default async function LearnPage({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();

  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();

  const data = await getDashboard(versionId);
  return (
    <>
      <AuthInit />
      <Dashboard data={data} />
    </>
  );
}
