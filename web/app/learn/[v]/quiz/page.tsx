import { notFound, redirect } from "next/navigation";
import QuizScreen from "../../../quiz-screen";
import { AuthInit } from "../../../auth-init";
import { getDashboard, versionStatus } from "@/lib/db/records";

export const dynamic = "force-dynamic";

export default async function QuizRoute({ params }: { params: Promise<{ v: string }> }) {
  const { v } = await params;
  const versionId = Number(v);
  if (!Number.isInteger(versionId)) notFound();
  const status = await versionStatus(versionId).catch(() => null);
  if (!status || status.status !== "ready") notFound();
  const data = await getDashboard(versionId);
  if (!data.hasAssessment) redirect(`/learn/${versionId}`);
  return (
    <>
      <AuthInit />
      <QuizScreen versionId={versionId} title={data.title} />
    </>
  );
}
