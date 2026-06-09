import { notFound } from "next/navigation";
import Sheet from "../../../sheet";
import { AuthInit } from "../../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

// The study sheet — built from the learner's journey through First Principles.
export const dynamic = "force-dynamic";

export default async function SheetPage({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();

  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();

  const data = await getDashboard(versionId);
  const allSubtopics = data.subtopics.map((s) => ({ id: s.id, title: s.title }));
  return (
    <>
      <AuthInit />
      <Sheet versionId={versionId} title={data.title} allSubtopics={allSubtopics} />
    </>
  );
}
