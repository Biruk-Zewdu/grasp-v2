import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Serve-time DB client. Server-only — never import from a client component.
// `prepare: false` keeps us safe behind Supabase's connection pooler.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Pool tuning for Supabase poolers: keep our own client tiny so we never exhaust
// the pooler's per-client cap (session pooler = 15). `max: 3` + a short idle
// timeout returns connections promptly instead of piling up across dev
// hot-reloads / serverless invocations — the cause of EMAXCONNSESSION. We also
// cache the client on globalThis in dev so hot-reload reuses one pool, not many.
// `prepare: false` is required behind the pooler. (Prefer the TRANSACTION pooler,
// port 6543, in prod.)
const g = globalThis as unknown as { _graspPg?: ReturnType<typeof postgres> };
const client =
  g._graspPg ?? postgres(connectionString, { prepare: false, max: 3, idle_timeout: 20 });
if (process.env.NODE_ENV !== "production") g._graspPg = client;
export const db = drizzle(client, { schema });
export { schema };
