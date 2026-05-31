import { defineConfig } from "drizzle-kit";

// Drizzle MIRRORS the SQL schema (source of truth = supabase/migrations/*.sql).
// `pnpm db:pull` introspects the live DB into lib/db/schema.ts. Never hand-edit
// that file; regenerate it. The schema-drift check (eval/schema_drift) guards
// against the three mirrors diverging (99_GOTCHAS.md#g2).
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/_introspect",
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ["public"],
});
