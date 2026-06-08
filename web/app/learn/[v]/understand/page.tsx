import { notFound } from "next/navigation";
import Reader from "../../../reader";
import { AuthInit } from "../../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

// The revamped "Understand" surface: a lesson reader over the document's sections.
// Lands on real teaching material (not an empty chat). The free-form conversational
// Guide still lives at /learn/[v]/guide for open exploration.
export const dynamic = "force-dynamic";

export default async function UnderstandPage({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();

  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();

  const data = await getDashboard(versionId);
  if (!data.subtopics.length) {
    // No decomposition → fall back to the conversational guide.
    const { redirect } = await import("next/navigation");
    redirect(`/learn/${versionId}/guide`);
  }
  return (
    <>
      <AuthInit />
      <Reader versionId={versionId} title={data.title} subtopics={data.subtopics} />
    </>
  );
}
