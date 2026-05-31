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
| `db/` | SQL migrations (the schema **source of truth**) + load helpers |
| `schemas/` | Pydantic models that mirror the DDL — Python |
| `build/` | The M1 artifact: agent-produced records + `validate`/`load` |
| `web/` | Next.js app — sequencer, renderer, index, UI, admin |
| `eval/` | Aspiration-level, pluralism, and schema-drift checks |

Two languages on purpose: **Python** = validate + load only; everything serve-side is **TypeScript / Next.js**. See `7_build_playbook/01_STACK.md`.

## Status

Scaffold only — no implementation yet. Build order is the playbook's phase docs: **M0 → M1 → M2 → M3 → M4**.
