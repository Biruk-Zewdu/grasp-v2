import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

// The verified anon-auth uid for this request, from the session cookie. Uses
// getUser() (which validates the JWT with the auth server) — not getSession,
// which would trust an unverified cookie. Returns null when auth isn't
// configured or no session exists, so the caller falls back to the client
// session uuid (see identity.ts).
export async function verifiedUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServer();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
