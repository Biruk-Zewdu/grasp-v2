import Upload from "./upload";
import { AuthInit } from "./auth-init";
import { exampleVersion } from "@/lib/db/records";

// The landing surface (v2): upload → build → reveal. The learning view lives at
// /learn/[v]. An "explore an example" shortcut points at a ready example version.
export const dynamic = "force-dynamic";

export default async function Page() {
  const example = await exampleVersion().catch(() => null);
  return (
    <>
      <AuthInit />
      <Upload exampleVersionId={example?.id ?? null} />
    </>
  );
}
