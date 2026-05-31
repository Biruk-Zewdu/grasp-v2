#!/usr/bin/env python3
"""Loader — corpus (M0) and knowledge records (M1) into the DB.

Subcommands:
  corpus                 load build/records/text_units.json into corpus_version/
                         source/text_unit (M0; idempotent per corpus version).
  records <session_dir>  load a session's validated knowledge records
                         (entity/relation/claim/provenance/tension/probe) into
                         the corpus version named in the file. Idempotent per
                         source: re-running replaces that session's records.

Records carry local STRING keys; this loader resolves them to DB ids, and
resolves each provenance (source, paragraph_index) anchor to the current
text_unit id (robust to text_unit reloads). Run build/validate.py first.

Reads DATABASE_URL from the environment (source .env first).
Usage:
  set -a; source .env; set +a
  uv run python db/load.py corpus
  uv run python db/load.py records build/records/session_1
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
import os

import psycopg

REPO = Path(__file__).resolve().parents[1]
TEXT_UNITS = REPO / "build" / "records" / "text_units.json"


def _conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (run: set -a; source .env; set +a)")
    return psycopg.connect(url)


def _get_or_create_cv(cur, label: str) -> int:
    cur.execute(
        "insert into corpus_version (label) values (%s) "
        "on conflict (label) do update set label = excluded.label returning id",
        (label,),
    )
    return cur.fetchone()[0]


# --------------------------------------------------------------------------- #
# corpus (M0)
# --------------------------------------------------------------------------- #
def load_corpus() -> int:
    data = json.loads(TEXT_UNITS.read_text(encoding="utf-8"))
    label = data["corpus_label"]
    units = data["text_units"]
    titles = [s["title"] for s in data["sources"]]

    with _conn() as conn, conn.cursor() as cur:
        cv = _get_or_create_cv(cur, label)
        cur.execute("delete from text_unit where corpus_version = %s", (cv,))
        cur.execute("delete from source where corpus_version = %s", (cv,))

        src_id: dict[str, int] = {}
        for title in titles:
            cur.execute(
                "insert into source (kind, title, corpus_version) "
                "values ('session', %s, %s) returning id",
                (title, cv),
            )
            src_id[title] = cur.fetchone()[0]

        with cur.copy(
            "copy text_unit (source_id, section, paragraph_index, char_start, "
            "char_end, text, corpus_version) from stdin"
        ) as cp:
            for u in units:
                cp.write_row((
                    src_id[u["source_title"]], u.get("section"), u["paragraph_index"],
                    u["char_start"], u["char_end"], u["text"], cv,
                ))
        conn.commit()
        cur.execute("select count(*) from source where corpus_version = %s", (cv,))
        n_src = cur.fetchone()[0]
        cur.execute("select count(*) from text_unit where corpus_version = %s", (cv,))
        n_units = cur.fetchone()[0]
    print(f"corpus_version '{label}' (id {cv}): {n_src} sources, {n_units} text_units")
    return 0


# --------------------------------------------------------------------------- #
# records (M1)
# --------------------------------------------------------------------------- #
def load_records(session_dir: Path) -> int:
    rec_file = session_dir / "records.json" if session_dir.is_dir() else session_dir
    data = json.loads(rec_file.read_text(encoding="utf-8"))
    label = data["corpus_label"]
    src_title = data["source_title"]

    with _conn() as conn, conn.cursor() as cur:
        cv = _get_or_create_cv(cur, label)

        cur.execute(
            "select id from source where title = %s and corpus_version = %s",
            (src_title, cv),
        )
        row = cur.fetchone()
        if not row:
            raise SystemExit(f"source '{src_title}' not in corpus '{label}'; run 'corpus' first")
        source_id = row[0]

        # (source_id, paragraph_index) -> text_unit id  (robust provenance anchor)
        cur.execute(
            "select paragraph_index, id from text_unit where source_id = %s",
            (source_id,),
        )
        tu_id = {p: i for p, i in cur.fetchall()}

        def resolve_para(p: int) -> int:
            if p not in tu_id:
                raise SystemExit(f"no text_unit at paragraph {p} of '{src_title}'")
            return tu_id[p]

        # --- idempotent: clear this source's prior records (FK-safe order) ---
        cur.execute("delete from probe where source_id = %s", (source_id,))
        cur.execute("delete from tension where %s = any(session_ids)", (source_id,))
        cur.execute(
            "delete from provenance where claim_id in "
            "(select id from claim where source_id = %s)", (source_id,))
        cur.execute("delete from claim where source_id = %s", (source_id,))
        cur.execute("delete from relation where %s = any(source_ids)", (source_id,))

        # --- entities (upsert by UNIQUE(name, corpus_version)) ---
        ent_id: dict[str, int] = {}
        for e in data.get("entities", []):
            cur.execute(
                "insert into entity (name, type, definition, abstraction, paradigm, source_ids, corpus_version) "
                "values (%s, %s, %s, %s, %s, %s, %s) "
                "on conflict (name, corpus_version) do update set "
                "  source_ids = (select array_agg(distinct x) "
                "                from unnest(entity.source_ids || excluded.source_ids) x), "
                "  definition = coalesce(entity.definition, excluded.definition), "
                "  paradigm = coalesce(entity.paradigm, excluded.paradigm) "
                "returning id",
                (e["name"], e["type"], e.get("definition"), e.get("abstraction"),
                 e.get("paradigm"), [source_id], cv),
            )
            ent_id[e["key"]] = cur.fetchone()[0]

        # --- relations ---
        for r in data.get("relations", []):
            cur.execute(
                "insert into relation (from_entity, rel_type, to_entity, evidence, "
                "source_ids, corpus_version) values (%s, %s, %s, %s, %s, %s)",
                (ent_id[r["from"]], r["rel_type"], ent_id[r["to"]], r.get("evidence"),
                 [source_id], cv),
            )

        # --- claims + provenance ---
        claim_id: dict[str, int] = {}
        for c in data.get("claims", []):
            cur.execute(
                "insert into claim (proposition, concept_ids, claim_type, thinker, "
                "paradigm, conditions, status, source_id, corpus_version) "
                "values (%s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
                (c["proposition"], [ent_id[k] for k in c.get("concept_keys", [])],
                 c["claim_type"], c.get("thinker"), c["paradigm"], c.get("conditions"),
                 c.get("status", "default"), source_id, cv),
            )
            cid = cur.fetchone()[0]
            claim_id[c["key"]] = cid
            for p in c.get("provenance", []):
                cur.execute(
                    "insert into provenance (claim_id, source_kind, text_unit_id, "
                    "source_ref, asserted_by) values (%s, 'session', %s, %s, %s)",
                    (cid, resolve_para(p["para"]), p.get("source_ref"), p.get("asserted_by")),
                )

        # --- tensions ---
        tension_id: dict[str, int] = {}
        for tn in data.get("tensions", []):
            cur.execute(
                "insert into tension (claim_a, claim_b, dimension, conditions_a, "
                "conditions_b, session_ids, corpus_version) "
                "values (%s, %s, %s, %s, %s, %s, %s) returning id",
                (claim_id[tn["claim_a"]], claim_id[tn["claim_b"]], tn.get("dimension"),
                 tn["conditions_a"], tn["conditions_b"], [source_id], cv),
            )
            if tn.get("key"):
                tension_id[tn["key"]] = cur.fetchone()[0]
            else:
                cur.fetchone()

        # --- probes ---
        for pb in data.get("probes", []):
            tk = pb.get("tension_key")
            cur.execute(
                "insert into probe (kind, prompt, concept_ids, tension_id, "
                "expected_signals, source_id, corpus_version) "
                "values (%s, %s, %s, %s, %s, %s, %s)",
                (pb["kind"], pb["prompt"],
                 [ent_id[k] for k in pb.get("concept_keys", [])],
                 (tension_id.get(tk) if tk else None),
                 pb.get("expected_signals", []), source_id, cv),
            )

        conn.commit()
        counts = {}
        for tbl, where in (
            ("entity", "%s = any(source_ids)"), ("relation", "%s = any(source_ids)"),
            ("claim", "source_id = %s"), ("tension", "%s = any(session_ids)"),
            ("probe", "source_id = %s"),
        ):
            cur.execute(f"select count(*) from {tbl} where {where}", (source_id,))
            counts[tbl] = cur.fetchone()[0]
        cur.execute(
            "select count(*) from provenance where claim_id in "
            "(select id from claim where source_id = %s)", (source_id,))
        counts["provenance"] = cur.fetchone()[0]

    print(f"loaded '{src_title}' (source {source_id}) into '{label}': " +
          ", ".join(f"{k}={v}" for k, v in counts.items()))
    return 0


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "corpus"
    if cmd == "corpus":
        return load_corpus()
    if cmd == "records":
        if len(argv) < 3:
            raise SystemExit("usage: load.py records <session_dir>")
        path = Path(argv[2])
        if not path.is_absolute():
            path = REPO / path
        return load_records(path)
    raise SystemExit(f"unknown command '{cmd}' (use: corpus | records <dir>)")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
