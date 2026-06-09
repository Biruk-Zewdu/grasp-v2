import { notFound } from "next/navigation";
import Sheet from "../../../sheet";
import { AuthInit } from "../../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

// The exam-prep study sheet page.
export const dynamic = "force-dynamic";

export default async function SheetPage({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();

  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();

  const data = await getDashboard(versionId);
  return (
    <>
      <AuthInit />
      <Sheet versionId={versionId} title={data.title} />
    </>
  );
}
