import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Serve-time DB client. Server-only — never import from a client component.
// `prepare: false` keeps us safe behind Supabase's connection pooler.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
export { schema };
