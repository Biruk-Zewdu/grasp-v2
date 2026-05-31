// Public Supabase config for anonymous auth. The anon key is DESIGNED for the
// browser (it's gated by RLS), so these are NEXT_PUBLIC_* — not secrets. They are
// referenced as static literals so Next can inline them into the client bundle.
// When unset, the app runs exactly as before: no auth, identity falls back to the
// client session uuid (see lib/server/identity.ts).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}
