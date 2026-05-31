import "server-only";

// Anonymous-auth seam. Returns the verified Supabase anon-auth uid from the
// request's session cookie, or null when auth isn't configured (template/dev) or
// no session exists. Implemented for real in the auth slice once @supabase/ssr +
// the NEXT_PUBLIC_SUPABASE_* env are present; until then it returns null so the
// caller falls back to the client session uuid (see identity.ts).
export async function verifiedUserId(): Promise<string | null> {
  return null;
}
