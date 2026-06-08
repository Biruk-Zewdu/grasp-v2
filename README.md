# Grasp v2 — upload → grasp

The upload-driven version of [Grasp](https://github.com/Biruk-Zewdu/grasp). A student
**uploads a PDF**; the system runs course-derived **operators** to turn it into a typed,
grounded, possibly-contested knowledge artifact, then **teaches it** — a generated lesson,
an interactive guide, and a before/after assessment.

> v1 (the hand-curated, frozen-corpus version) stays live and untouched at its own URL.
> v2 is a **separate project** with its own repo, deployment, and database.

**The full design + plan is in [`V2_DESIGN.md`](V2_DESIGN.md).** Read it first.

## Thesis (unchanged)
Intelligence is in the **design** — the extraction operators, the typed schema, validation,
and the verbatim tension-preservation guard — not the model weights. The LLM is the
instrument that executes operators over a knowledge representation.

## Layout
| Path | Role |
|---|---|
| `web/` | Next.js serve app (Guide, lesson, assessment, upload, reveal) — copied from v1, diverging |
| `build/` | The extraction operators: PDF → typed artifact (Python) |
| `supabase/migrations/` | Schema source of truth (loosened: tension optional) |
| `db/` · `schemas/` · `eval/` | Loader/belief helpers · Pydantic mirror · evals |

## Status
Scaffolding. Build order = `V2_DESIGN.md` §7 phases **A → G** (A–G is the demo).
