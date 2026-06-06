# Grasp

An AI system for studying AI ideas — an **invisible means-ends guide** that walks you to a good-enough *grasp* of an idea one clean step at a time, surfacing tensions as tables with depth on demand.

Built from first principles (Foundations of AI for Business). The intelligence lives in a typed, curated knowledge **artifact** — the model is only an instrument that renders it, never the author.

## Design & build docs

The design rationale and the build playbook live in the parent workspace (one level up):

- **Design** — `../6_design/` (start with `PRODUCT_SPEC.md`)
- **Build playbook** — `../7_build_playbook/` (start with `00_INDEX.md`)

## Repo layout

| Path | Role |
|---|---|
| `supabase/` | Supabase config + `migrations/` (SQL = the schema **source of truth**) |
| `db/` | loader / seed helpers — Python |
| `schemas/` | Pydantic models that mirror the DDL — Python |
| `build/` | The M1 artifact: agent-produced records + `validate`/`load` |
| `web/` | Next.js app — sequencer, renderer, index, UI, admin |
| `eval/` | Aspiration-level, pluralism, and schema-drift checks |

Two languages on purpose: **Python** = validate + load only; everything serve-side is **TypeScript / Next.js**. See `7_build_playbook/01_STACK.md`.

## Status

Live on Vercel over the frozen **v1** corpus. M0–M4 built; serve layer is the agentic Guide (`web/`).

## Working on it (teammates)

### Run it locally to try it out

```bash
git clone https://github.com/Biruk-Zewdu/grasp.git
cd grasp/web
cp .env.example .env.local      # then fill in the values — see below
pnpm install
pnpm dev                        # → http://localhost:3000
```

**Env values** (`web/.env.example` explains each):
- The fastest start needs **no API key** — set `SERVE_MODE=template` and the whole
  Guide runs from the frozen records at zero cost.
- For live AI answers, set `SERVE_MODE=live` and use **your own** `OPENAI_API_KEY`.
- Ask the owner for `DATABASE_URL` (or your own read-only role). Never commit `.env.local`.

Before opening a PR, make sure it's clean:

```bash
pnpm typecheck
SERVE_MODE=template pnpm build
SERVE_MODE=template pnpm exec vitest run
```

### Submitting changes (PR workflow)

`main` is protected — you can't push to it directly. Work on a branch and open a PR.

```bash
git checkout -b your-name/short-description   # one branch per change
# ...make your changes, commit...
git add -A
git commit -m "what you changed and why"
git push -u origin your-name/short-description
```

Then on GitHub: open a **Pull Request** into `main`. Vercel builds a **preview URL**
for your branch automatically (production is untouched). The owner reviews and merges.

- Keep one branch per logical change; rebase on `main` if it moves: `git fetch && git rebase origin/main`.
- Never commit secrets (`.env.local` is gitignored — keep it that way).
- ⚠️ Don't push to `main` directly.
