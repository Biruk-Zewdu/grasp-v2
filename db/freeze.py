#!/usr/bin/env python3
"""Freeze + version-bump (M2).

  freeze <label> [--as <new>]   Gate on pluralism, set frozen_at, promote the
                                draft label (default new = 'v1'). After this the
                                version is immutable (I5) and serve may read it.
  clone  <src> <new>            Deep-copy a version's rows into a NEW mutable
                                draft (the v1.1 path), remapping every id/array.
                                Use this to fix a frozen version: clone -> edit
                                -> re-freeze as v1.1. Never mutate a frozen one.

Usage:
  set -a; source .env; set +a
  uv run python db/freeze.py freeze v1-draft --as v1
  uv run python db/freeze.py clone v1 v1.1-draft
"""
from __future__ import annotations

import os
import sys

import psycopg


def _conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (run: set -a; source .env; set +a)")
    return psycopg.connect(url)


def _cv(cur, label: str):
    cur.execute("select id, frozen_at from corpus_version where label=%s", (label,))
    return cur.fetchone()


def _pluralism_ok(cur, cv: int) -> list[str]:
    """Inline freeze gate: every tension two-sided, both claims live."""
    bad: list[str] = []
    cur.execute(
        "select id, claim_a, claim_b, conditions_a, conditions_b, dimension "
        "from tension where corpus_version=%s", (cv,))
    rows = cur.fetchall()
    if not rows:
        bad.append("no tensions — the course is its tensions")
    for tid, ca, cb, cond_a, cond_b, dim in rows:
        if not (cond_a or "").strip() or not (cond_b or "").strip():
            bad.append(f"tension {tid}: collapsed (a side has empty conditions)")
        if not (dim or "").strip():
            bad.append(f"tension {tid}: no dimension")
        cur.execute("select count(*) from belief_node "
                    "where claim_id in (%s,%s) and label='out'", (ca, cb))
        if cur.fetchone()[0] >= 2:
            bad.append(f"tension {tid}: both sides retracted")
    return bad


def freeze(label: str, new_label: str) -> int:
    with _conn() as conn, conn.cursor() as cur:
        row = _cv(cur, label)
        if not row:
            raise SystemExit(f"corpus_version '{label}' not found")
        cv, frozen = row
        if frozen is not None:
            raise SystemExit(f"'{label}' is already frozen ({frozen})")
        bad = _pluralism_ok(cur, cv)
        if bad:
            print(f"FREEZE REFUSED — pluralism gate failed ({len(bad)}):")
            for b in bad:
                print(f"  - {b}")
            return 1
        cur.execute("select 1 from corpus_version where label=%s", (new_label,))
        if cur.fetchone():
            raise SystemExit(f"label '{new_label}' already exists; pick another")
        cur.execute(
            "update corpus_version set label=%s, frozen_at=now(), "
            "notes=coalesce(notes,'')||' frozen from '||%s where id=%s "
            "returning frozen_at",
            (new_label, label, cv))
        ts = cur.fetchone()[0]
        conn.commit()
    print(f"FROZEN: '{label}' -> '{new_label}' (id {cv}) at {ts}. Immutable (I5); "
          f"serve may now read it. To edit, clone it.")
    return 0


# ----- deep clone (version-bump path) ------------------------------------- #
def clone(src_label: str, new_label: str) -> int:
    with _conn() as conn, conn.cursor() as cur:
        row = _cv(cur, src_label)
        if not row:
            raise SystemExit(f"corpus_version '{src_label}' not found")
        src = row[0]
        if _cv(cur, new_label):
            raise SystemExit(f"label '{new_label}' already exists")

        cur.execute(
            "insert into corpus_version (label, notes) values (%s,%s) returning id",
            (new_label, f"clone of {src_label}"))
        new = cur.fetchone()[0]

        def remap(table, cols, extra_setters=None):
            """Copy rows of `table` for src cv, returning {old_id:new_id}."""
            collist = ", ".join(cols)
            cur.execute(f"select id, {collist} from {table} where corpus_version=%s "
                        f"order by id", (src,))
            out: dict[int, int] = {}
            for r in cur.fetchall():
                old_id, vals = r[0], list(r[1:])
                if extra_setters:
                    vals = extra_setters(dict(zip(cols, vals)))
                placeholders = ", ".join(["%s"] * len(cols))
                cur.execute(
                    f"insert into {table} ({collist}, corpus_version) "
                    f"values ({placeholders}, %s) returning id",
                    (*vals, new))
                out[old_id] = cur.fetchone()[0]
            return out

        src_map = remap("source", ["kind", "title", "ref"])

        # text_unit (remap source_id)
        tu_map: dict[int, int] = {}
        cur.execute("select id, source_id, section, paragraph_index, char_start, "
                    "char_end, text from text_unit where corpus_version=%s", (src,))
        for tid, sid, sec, pidx, cs, ce, txt in cur.fetchall():
            cur.execute("insert into text_unit (source_id, section, paragraph_index, "
                        "char_start, char_end, text, corpus_version) "
                        "values (%s,%s,%s,%s,%s,%s,%s) returning id",
                        (src_map[sid], sec, pidx, cs, ce, txt, new))
            tu_map[tid] = cur.fetchone()[0]

        # entity (remap source_ids[])
        ent_map: dict[int, int] = {}
        cur.execute("select id, name, type, definition, abstraction, paradigm, "
                    "source_ids from entity where corpus_version=%s", (src,))
        for eid, name, typ, defn, abst, par, sids in cur.fetchall():
            cur.execute("insert into entity (name, type, definition, abstraction, "
                        "paradigm, source_ids, corpus_version) "
                        "values (%s,%s,%s,%s,%s,%s,%s) returning id",
                        (name, typ, defn, abst, par,
                         [src_map[s] for s in (sids or [])], new))
            ent_map[eid] = cur.fetchone()[0]

        # relation
        cur.execute("select from_entity, rel_type, to_entity, evidence, source_ids "
                    "from relation where corpus_version=%s", (src,))
        for fe, rt, te, ev, sids in cur.fetchall():
            cur.execute("insert into relation (from_entity, rel_type, to_entity, "
                        "evidence, source_ids, corpus_version) values (%s,%s,%s,%s,%s,%s)",
                        (ent_map[fe], rt, ent_map[te], ev,
                         [src_map[s] for s in (sids or [])], new))

        # claim (remap concept_ids[], source_id)
        claim_map: dict[int, int] = {}
        cur.execute("select id, proposition, concept_ids, claim_type, thinker, paradigm, "
                    "conditions, status, source_id from claim where corpus_version=%s", (src,))
        for cid, prop, cids, ct, th, par, cond, st, sid in cur.fetchall():
            cur.execute("insert into claim (proposition, concept_ids, claim_type, thinker, "
                        "paradigm, conditions, status, source_id, corpus_version) "
                        "values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id",
                        (prop, [ent_map[c] for c in (cids or [])], ct, th, par, cond, st,
                         src_map.get(sid) if sid else None, new))
            claim_map[cid] = cur.fetchone()[0]

        # provenance (remap claim_id, text_unit_id)
        cur.execute("select claim_id, source_kind, text_unit_id, source_ref, asserted_by "
                    "from provenance where claim_id in (select id from claim where "
                    "corpus_version=%s)", (src,))
        for clid, sk, tuid, sref, ab in cur.fetchall():
            cur.execute("insert into provenance (claim_id, source_kind, text_unit_id, "
                        "source_ref, asserted_by) values (%s,%s,%s,%s,%s)",
                        (claim_map[clid], sk, tu_map.get(tuid) if tuid else None, sref, ab))

        # belief_node (remap claim_id)
        bn_map: dict[int, int] = {}
        cur.execute("select id, claim_id, label from belief_node where claim_id in "
                    "(select id from claim where corpus_version=%s)", (src,))
        for bid, clid, lab in cur.fetchall():
            cur.execute("insert into belief_node (claim_id, label) values (%s,%s) returning id",
                        (claim_map[clid], lab))
            bn_map[bid] = cur.fetchone()[0]

        # justification (remap belief_node + antecedent_belief_ids[])
        cur.execute("select belief_node, antecedent_belief_ids, rationale from justification "
                    "where belief_node in (select id from belief_node where claim_id in "
                    "(select id from claim where corpus_version=%s))", (src,))
        for bnid, ante, rat in cur.fetchall():
            cur.execute("insert into justification (belief_node, antecedent_belief_ids, "
                        "rationale) values (%s,%s,%s)",
                        (bn_map[bnid], [bn_map[a] for a in (ante or [])], rat))

        # tension (remap claim_a/b, session_ids[])
        cur.execute("select claim_a, claim_b, dimension, conditions_a, conditions_b, "
                    "session_ids from tension where corpus_version=%s", (src,))
        for ca, cb, dim, cda, cdb, sids in cur.fetchall():
            cur.execute("insert into tension (claim_a, claim_b, dimension, conditions_a, "
                        "conditions_b, session_ids, corpus_version) values (%s,%s,%s,%s,%s,%s,%s)",
                        (claim_map[ca], claim_map[cb], dim, cda, cdb,
                         [src_map[s] for s in (sids or [])], new))

        # probe: map old tension id -> new tension id by matching (claim_a,claim_b) pairs
        cur.execute("select id, claim_a, claim_b from tension where corpus_version=%s", (src,))
        old_t = {(claim_map[a], claim_map[b]): tid for tid, a, b in cur.fetchall()}
        cur.execute("select id, claim_a, claim_b from tension where corpus_version=%s", (new,))
        new_t = {(a, b): tid for tid, a, b in cur.fetchall()}
        tension_map = {old_t[k]: new_t[k] for k in old_t if k in new_t}

        cur.execute("select kind, prompt, concept_ids, tension_id, expected_signals, "
                    "source_id from probe where corpus_version=%s", (src,))
        for kind, prompt, cids, tid, sig, sid in cur.fetchall():
            cur.execute("insert into probe (kind, prompt, concept_ids, tension_id, "
                        "expected_signals, source_id, corpus_version) "
                        "values (%s,%s,%s,%s,%s,%s,%s)",
                        (kind, prompt, [ent_map[c] for c in (cids or [])],
                         tension_map.get(tid) if tid else None, sig,
                         src_map.get(sid) if sid else None, new))
        conn.commit()
    print(f"CLONED '{src_label}' -> '{new_label}' (id {new}, mutable). "
          f"Edit, re-run belief + evals, then freeze as the next version.")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        raise SystemExit(__doc__)
    cmd = argv[1]
    if cmd == "freeze":
        label = argv[2] if len(argv) > 2 else "v1-draft"
        new = "v1"
        if "--as" in argv:
            new = argv[argv.index("--as") + 1]
        return freeze(label, new)
    if cmd == "clone":
        if len(argv) < 4:
            raise SystemExit("usage: freeze.py clone <src> <new>")
        return clone(argv[2], argv[3])
    raise SystemExit(f"unknown command '{cmd}' (freeze | clone)")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
