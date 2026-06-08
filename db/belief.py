#!/usr/bin/env python3
"""M2 belief-layer populator — wrap each claim in the TMS.

For every claim in a corpus version, create a belief_node (label 'in') and a
justification. Antecedents are derived to form an acyclic dependency structure:

  - definitional claims are PREMISES (empty antecedents) — they rest on their
    provenance, not on other claims;
  - every other claim (causal/conditional/contradictory/...) DEPENDS ON the
    definitional claims that define the concepts it is about (shared concept_ids).

This is what lets a contradiction be traced to the assumption that caused it
(M6) and lets curation retract a claim by flipping its belief_node to 'out'
(I1: never delete). Idempotent per corpus version.

Usage:
  set -a; source .env; set +a
  uv run python db/belief.py            # default version v1-draft
  uv run python db/belief.py v1
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

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("select id, frozen_at from corpus_version where label=%s", (label,))
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"corpus_version '{label}' not found")
        cv, frozen = row
        if frozen is not None:
            raise SystemExit(f"'{label}' is frozen ({frozen}); belief layer is immutable (I5)")

        cur.execute(
            "select id, claim_type, concept_ids from claim where corpus_version=%s order by id",
            (cv,),
        )
        claims = cur.fetchall()
        by_id = {cid: (ctype, set(concepts or [])) for cid, ctype, concepts in claims}

        # definitional claims keyed by the concepts they define (the premises)
        def_by_concept: dict[int, list[int]] = {}
        for cid, ctype, concepts in claims:
            if ctype == "definitional":
                for k in (concepts or []):
                    def_by_concept.setdefault(k, []).append(cid)

        # pass 1: belief_node per claim (upsert), build claim_id -> belief_node id
        bn: dict[int, int] = {}
        for cid, _, _ in claims:
            cur.execute(
                "insert into belief_node (claim_id, label) values (%s,'in') "
                "on conflict (claim_id) do update set label=belief_node.label returning id",
                (cid,),
            )
            bn[cid] = cur.fetchone()[0]

        # idempotent: clear justifications for these belief_nodes before re-inserting
        cur.execute(
            "delete from justification where belief_node = any(%s)",
            (list(bn.values()),),
        )

        # pass 2: one justification per belief_node
        n_premise = n_derived = 0
        for cid, ctype, concepts in claims:
            concepts = set(concepts or [])
            antecedent_claims: set[int] = set()
            if ctype != "definitional":
                for k in concepts:
                    for dcid in def_by_concept.get(k, []):
                        if dcid != cid:
                            antecedent_claims.add(dcid)
            antecedent_bn = sorted(bn[a] for a in antecedent_claims)
            if antecedent_bn:
                rationale = f"{ctype} claim; rests on the definitions of its concepts"
                n_derived += 1
            else:
                rationale = f"{ctype} claim; premise grounded in its provenance"
                n_premise += 1
            cur.execute(
                "insert into justification (belief_node, antecedent_belief_ids, rationale) "
                "values (%s, %s, %s)",
                (bn[cid], antecedent_bn, rationale),
            )
        conn.commit()

        cur.execute("select count(*) from belief_node where claim_id in "
                    "(select id from claim where corpus_version=%s)", (cv,))
        n_bn = cur.fetchone()[0]

    print(f"belief layer for '{label}' (id {cv}): {n_bn} belief_nodes, "
          f"{n_premise} premises, {n_derived} derived justifications")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
