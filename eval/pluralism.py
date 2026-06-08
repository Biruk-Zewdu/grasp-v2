#!/usr/bin/env python3
"""Pluralism check — the freeze gate (M2).

Asserts that no `tension` has collapsed to one side: both conditions present,
both claims exist, and the tension is not left with both sides retracted
('out'). This is the data-side guard for the design's core rule — tensions are
preserved, never resolved (99_GOTCHAS.md#g11). Serve's renderer guards the
presentation; this guards the artifact.

Exit 0 = green (safe to freeze); exit 1 = at least one violation.

Usage:
  set -a; source .env; set +a
  uv run python eval/pluralism.py            # default v1-draft
  uv run python eval/pluralism.py v1
"""
from __future__ import annotations

import os
import sys

import psycopg

DEFAULT_LABEL = "v1-draft"


def main(argv: list[str]) -> int:
    label = argv[1] if len(argv) > 1 else DEFAULT_LABEL
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (run: set -a; source .env; set +a)")

    violations: list[str] = []
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select id from corpus_version where label=%s", (label,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"corpus_version '{label}' not found")
        cv = row[0]

        cur.execute(
            "select id, claim_a, claim_b, conditions_a, conditions_b, dimension "
            "from tension where corpus_version=%s order by id",
            (cv,),
        )
        tensions = cur.fetchall()
        if not tensions:
            violations.append("no tensions in this version — the course is its tensions")

        for tid, ca, cb, cond_a, cond_b, dim in tensions:
            if not (cond_a or "").strip() or not (cond_b or "").strip():
                violations.append(f"tension {tid}: a side has empty conditions (collapsed)")
            if not (dim or "").strip():
                violations.append(f"tension {tid}: no dimension of disagreement")
            # both claims must exist
            cur.execute("select id from claim where id in (%s,%s)", (ca, cb))
            if len({r[0] for r in cur.fetchall()}) != 2:
                violations.append(f"tension {tid}: a referenced claim is missing")
                continue
            # not both sides retracted
            cur.execute(
                "select count(*) from belief_node where claim_id in (%s,%s) and label='out'",
                (ca, cb),
            )
            if cur.fetchone()[0] >= 2:
                violations.append(f"tension {tid}: both sides retracted ('out') — nothing left")

    if violations:
        print(f"PLURALISM FAIL ({label}) — {len(violations)} violation(s):")
        for v in violations:
            print(f"  - {v}")
        return 1
    print(f"PLURALISM OK ({label}) — {len(tensions)} tensions, all two-sided and live")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
