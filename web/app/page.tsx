import Guide from "./guide";
import { AuthInit } from "./auth-init";
import { frozenVersion, getCatalog } from "@/lib/db/records";
import { SERVE_CORPUS_VERSION } from "@/lib/server/env";
import type { Catalog } from "@/lib/guide/types";

// The single learner-facing surface. Serve reads the live frozen artifact.
export const dynamic = "force-dynamic";

export default async function Page() {
  const v = await frozenVersion(SERVE_CORPUS_VERSION);
  const catalog: Catalog = v ? await getCatalog(v.id) : { questions: [], ideas: [] };
  return (
    <>
      <AuthInit />
      <Guide catalog={catalog} />
    </>
  );
}
