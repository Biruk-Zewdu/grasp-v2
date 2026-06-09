import { notFound } from "next/navigation";
import ConceptsScreen from "../../../concepts-screen";
import { AuthInit } from "../../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

export const dynamic = "force-dynamic";

export default async function ConceptsRoute({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();
  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();
  const data = await getDashboard(versionId);
  return (
    <>
      <AuthInit />
      <ConceptsScreen versionId={versionId} title={data.title} />
    </>
  );
}
