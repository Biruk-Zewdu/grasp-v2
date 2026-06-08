"""Schema-drift guard (Python side): DB enums <-> Pydantic mirror (99_GOTCHAS.md#g2).

The SQL migrations are the source of truth; Pydantic (/schemas) and Drizzle
(/web/lib/db) mirror them. Enums are the most drift-prone surface (used by every
table) and the easiest to silently diverge. This asserts each DB enum's ordered
value list equals the matching Pydantic enum's. The DB<->Drizzle side is checked
by web/scripts/check-schema-drift.mjs (`pnpm db:drift`).

Exit 0 = in sync; exit 1 = drift.

Usage:
  set -a; source .env; set +a
  uv run python eval/schema_drift.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from schemas import (  # noqa: E402
    Abstraction, BeliefLabel, ClaimStatus, ClaimType, EntityType,
    Paradigm, ProbeKind, RelationType, SourceKind,
)

# DB enum name -> Pydantic enum class
ENUMS = {
    "abstraction": Abstraction,
    "belief_label": BeliefLabel,
    "claim_status": ClaimStatus,
    "claim_type": ClaimType,
    "entity_type": EntityType,
    "paradigm": Paradigm,
    "probe_kind": ProbeKind,
    "relation_type": RelationType,
    "source_kind": SourceKind,
}


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (run: set -a; source .env; set +a)")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(
            "select t.typname, e.enumlabel from pg_type t "
            "join pg_enum e on e.enumtypid=t.oid "
            "join pg_namespace n on n.oid=t.typnamespace "
            "where n.nspname='public' "
            "order by t.typname, e.enumsortorder"
        )
        db_enums: dict[str, list[str]] = {}
        for name, label in cur.fetchall():
            db_enums.setdefault(name, []).append(label)

    problems: list[str] = []
    for name, model in ENUMS.items():
        db_vals = db_enums.get(name)
        py_vals = [m.value for m in model]
        if db_vals is None:
            problems.append(f"enum '{name}' missing in DB")
        elif db_vals != py_vals:
            problems.append(f"enum '{name}': DB {db_vals} != Pydantic {py_vals}")

    # any DB enum the Pydantic side forgot to mirror
    for name in db_enums:
        if name not in ENUMS:
            problems.append(f"DB enum '{name}' not mirrored in schemas/")

    if problems:
        print(f"SCHEMA DRIFT (DB <-> Pydantic) — {len(problems)}:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(f"schema-drift OK: {len(ENUMS)} enums, DB <-> Pydantic in sync")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
