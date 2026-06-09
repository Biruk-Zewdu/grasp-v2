import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Serve-time DB client. Server-only — never import from a client component.
// `prepare: false` keeps us safe behind Supabase's connection pooler.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Serverless-safe pooling. On Vercel each function invocation handles ONE request,
// so we want ONE connection per warm instance, reused across invocations — not a
// fresh pool each time (which piled up and exhausted the pooler → intermittent
// 500/404s under concurrency). We cache the client on globalThis in BOTH dev and
// prod so a warm Lambda reuses its single connection. `max: 1` keeps each instance
// to one connection; `idle_timeout` returns it promptly. `prepare: false` is
// required behind the pooler. Use the TRANSACTION pooler (port 6543) on Vercel —
// it's built for many short-lived serverless connections.
const g = globalThis as unknown as { _graspPg?: ReturnType<typeof postgres> };
const client =
  g._graspPg ?? postgres(connectionString, { prepare: false, max: 1, idle_timeout: 20 });
g._graspPg = client;
export const db = drizzle(client, { schema });
export { schema };
