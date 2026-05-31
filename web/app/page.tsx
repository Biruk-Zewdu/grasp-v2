import Guide from "./guide";
import { AuthInit } from "./auth-init";

// The single learner-facing surface. Serve reads the live frozen artifact.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <AuthInit />
      <Guide />
    </>
  );
}
