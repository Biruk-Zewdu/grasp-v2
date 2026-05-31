"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// Silently establishes an anonymous session on first load (no signup wall). If
// auth isn't configured, or anonymous sign-ins are disabled in the dashboard,
// this no-ops and the app falls back to the client session uuid. Renders nothing.
export function AuthInit() {
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    sb.auth.getSession().then((res) => {
      if (!res.data.session) void sb.auth.signInAnonymously();
    });
  }, []);
  return null;
}
