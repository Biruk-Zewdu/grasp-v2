# grasp-v2 setup — the one manual step

Everything in v2 is automated **except provisioning the new Supabase project**
(I can't create a cloud project / read its credentials for you). Once you do this
once, the rest of the pipeline runs.

## 1. Create the brand-new Supabase project
- supabase.com → **New project** (separate from v1's `olfyzwvmsylrzecebxss`).
- Create with: Data API **off**, auto-RLS **on** (same as v1).
- Note the **project ref** + **region**.

## 2. Get the connection string (Session pooler, IPv4)
- Settings → Database → **Connection string → Session pooler** (`aws-1-<region>.pooler.supabase.com:5432`, user `postgres.<ref>`).
- **Percent-encode** the password (`@`→`%40`, `/`→`%2F`).
- Put it in `web/.env.local` as `DATABASE_URL` (copy from `web/.env.example`).

## 3. Apply the schema
```bash
cd grasp-v2
set -a && source web/.env.local && set +a
printf 'Y\n' | supabase db push --db-url "$DATABASE_URL"
```
This applies the v1 base migrations **+ the v2 loosening** (`20260609000000_v2_upload.sql`):
tension optional, free-text paradigm labels, corpus_version origin/owner/status,
and the new `subtopic` / `lesson` / `assessment*` tables.

## 4. (optional) Re-sync the Drizzle mirror
The Drizzle schema (`web/lib/db/schema.ts`) was hand-updated to match the migration so
the app compiles before the DB exists. Once the DB is live, reconcile authoritatively:
```bash
cd web && pnpm db:pull   # introspect the live DB → regenerate the mirror
pnpm db:drift            # confirm DB ↔ Drizzle agree
```

## 5. Run
```bash
cd web && pnpm install && pnpm dev   # http://localhost:3000
```

> Until step 1–3 are done, `pnpm dev` runs but DB reads fail (no corpus). Template-mode
> UI + typecheck/build all work without the DB.
