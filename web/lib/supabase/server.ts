import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from "./config";

// Server-side Supabase client bound to the request cookies. Returns null when
// auth isn't configured. Token refresh (writing cookies) happens in proxy.ts;
// in a Server Component setAll throws, so we swallow it there.
export async function createSupabaseServer() {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* called from a Server Component — proxy.ts refreshes the session */
        }
      },
    },
  });
}
