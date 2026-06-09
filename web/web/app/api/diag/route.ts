import { NextResponse } from "next/server";
import { getOrBuildSheet } from "@/lib/sheet";
export const maxDuration = 60;
export async function GET() {
  const s = await getOrBuildSheet(2, "diag");
  return NextResponse.json({
    tldr: s?.tldr,
    conceptCount: s?.concepts.length,
    topConcepts: s?.concepts.slice(0,3).map(c => ({ name: c.name, why: c.why, hasDfn: !!c.definition })),
    keyPoints: s?.keyPoints,
  });
}
