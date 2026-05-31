// Schema-drift guard: DB (truth) <-> Drizzle mirror (99_GOTCHAS.md#g2).
// Re-introspects the live DB and compares the freshly-generated schema to the
// committed lib/db/schema.ts. If they differ, someone changed the SQL schema
// without regenerating Drizzle (or vice versa). Run `pnpm db:pull` to fix.
//
// The Python mirror is checked separately by eval/schema_drift.py (enums).
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

// load .env.local so drizzle-kit sees DATABASE_URL (CI may export it instead)
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (source .env.local)");
  process.exit(2);
}

const norm = (s) => s.replace(/\r\n/g, "\n").trimEnd();
const committed = norm(readFileSync("lib/db/schema.ts", "utf8"));

// no shell: fixed argv, no interpolation
execFileSync("pnpm", ["exec", "drizzle-kit", "pull"], {
  stdio: ["ignore", "ignore", "inherit"],
});
const fresh = norm(readFileSync("lib/db/_introspect/schema.ts", "utf8"));

if (fresh !== committed) {
  console.error(
    "SCHEMA DRIFT: live DB and lib/db/schema.ts differ.\n" +
      "  The SQL migrations (truth) changed without regenerating the Drizzle mirror.\n" +
      "  Fix: `pnpm db:pull` then commit lib/db/schema.ts."
  );
  process.exit(1);
}
console.log("schema-drift OK: DB <-> Drizzle mirror in sync");
