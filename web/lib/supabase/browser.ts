"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigured } from "./config";

// Browser Supabase client (anon key, RLS-gated). Null when auth isn't configured.
let _client: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!_client) _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
}
