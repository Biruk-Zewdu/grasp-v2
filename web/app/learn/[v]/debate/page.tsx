import { notFound, redirect } from "next/navigation";
import DebatePage from "../../../debate-page";
import { AuthInit } from "../../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

export const dynamic = "force-dynamic";

export default async function Debate({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();
  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();
  const data = await getDashboard(versionId);
  if (data.tensionId == null) redirect(`/learn/${versionId}`);
  return (
    <>
      <AuthInit />
      <DebatePage versionId={versionId} tensionId={data.tensionId} />
    </>
  );
}
