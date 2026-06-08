"""Aspiration-level check (Module G satisficing thresholds).

Computes the artifact's quality metrics and compares them to the aspiration
levels from BUILDING_BLOCKS_CATALOG.md §G. A dimension below threshold is where
M1 would run more operators. At M2 these should all pass before freeze.

  coverage          >= 0.70   sessions that contributed entities+claims+tension
  connectivity      >= 0.50   entities with >=1 relation / total entities
  depth             >= 3      distinct populated abstraction levels
  tension_coverage  >= 0.60   sessions with >=1 tension / total sessions
  formalization     >= 0.80   claims with >=1 provenance / total claims (I2)

`coverage` here is a session-level proxy; true concept-coverage needs a manual
estimate of total concepts, set at the curation gate.

Usage:
  set -a; source .env; set +a
  uv run python eval/aspirations.py            # default v1-draft
  uv run python eval/aspirations.py v1
"""
from __future__ import annotations

import os
import sys

import psycopg

DEFAULT_LABEL = "v1-draft"
THRESHOLDS = {
    "coverage": 0.70,
    "connectivity": 0.50,
    "depth": 3,
    "tension_coverage": 0.60,
    "formalization": 0.80,
}


def main(argv: list[str]) -> int:
    label = argv[1] if len(argv) > 1 else DEFAULT_LABEL
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (run: set -a; source .env; set +a)")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select id from corpus_version where label=%s", (label,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"corpus_version '{label}' not found")
        cv = row[0]

        def scalar(q: str) -> float:
            cur.execute(q, (cv,))
            return cur.fetchone()[0] or 0

        n_sources = scalar("select count(*) from source where corpus_version=%s")
        n_entities = scalar("select count(*) from entity where corpus_version=%s")
        n_claims = scalar("select count(*) from claim where corpus_version=%s")

        cur.execute(
            "select count(distinct e.id) from entity e where e.corpus_version=%s and e.id in "
            "(select from_entity from relation where corpus_version=%s "
            " union select to_entity from relation where corpus_version=%s)",
            (cv, cv, cv),
        )
        connected = cur.fetchone()[0]

        depth = scalar(
            "select count(distinct abstraction) from entity "
            "where corpus_version=%s and abstraction is not null"
        )
        cur.execute(
            "select count(distinct s) from (select unnest(session_ids) s from tension "
            "where corpus_version=%s) x", (cv,))
        sessions_with_tension = cur.fetchone()[0]
        claims_with_prov = scalar(
            "select count(*) from claim c where c.corpus_version=%s and exists "
            "(select 1 from provenance p where p.claim_id=c.id)")
        # sessions contributing entities + claims + a tension
        cur.execute(
            "select count(*) from source s where s.corpus_version=%s and "
            "exists(select 1 from entity e where s.id=any(e.source_ids)) and "
            "exists(select 1 from claim c where c.source_id=s.id) and "
            "exists(select 1 from tension t where s.id=any(t.session_ids))", (cv,))
        sessions_covered = cur.fetchone()[0]

    metrics = {
        "coverage": sessions_covered / n_sources if n_sources else 0,
        "connectivity": connected / n_entities if n_entities else 0,
        "depth": depth,
        "tension_coverage": sessions_with_tension / n_sources if n_sources else 0,
        "formalization": claims_with_prov / n_claims if n_claims else 0,
    }

    print(f"aspiration levels for '{label}':")
    all_pass = True
    for k, v in metrics.items():
        thr = THRESHOLDS[k]
        ok = v >= thr
        all_pass = all_pass and ok
        shown = f"{v:.2f}" if isinstance(v, float) else str(v)
        print(f"  {'OK ' if ok else 'LOW'}  {k:<17} {shown:>6}  (>= {thr})")
    print(f"  context: {n_sources} sources, {n_entities} entities, {n_claims} claims")
    return 0 if all_pass else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
