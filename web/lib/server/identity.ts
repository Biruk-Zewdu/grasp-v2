import "server-only";
import { verifiedUserId } from "./auth";

// The identity a request acts as. With anonymous auth configured, this is the
// Supabase anon-auth uid read from the verified session cookie (the client can't
// spoof it). Until auth is wired (or in template/dev), it falls back to the
// client-generated session uuid. Budget counters, the session row, the gap log,
// and gesture logs all key off this value — so swapping in real auth changes
// nothing downstream.
export async function getUserId(fallback: string): Promise<string> {
  const verified = await verifiedUserId();
  return verified ?? fallback;
}
