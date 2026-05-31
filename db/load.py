#!/usr/bin/env python3
"""M0 loader — corpus into the DB.

Loads the normalizer's output (build/records/text_units.json) into the
`corpus_version`, `source`, and `text_unit` tables. Idempotent: re-running
replaces this corpus version's sources/text_units rather than duplicating.

Reads DATABASE_URL from the environment (source .env first).
Usage:  set -a; source .env; set +a; uv run python db/load.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import psycopg

REPO = Path(__file__).resolve().parents[1]
RECORDS = REPO / "build" / "records" / "text_units.json"


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set (run: set -a; source .env; set +a)")

    data = json.loads(RECORDS.read_text(encoding="utf-8"))
    label = data["corpus_label"]
    units = data["text_units"]
    titles = [s["title"] for s in data["sources"]]

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        # corpus_version (idempotent)
        cur.execute(
            "insert into corpus_version (label) values (%s) "
            "on conflict (label) do update set label = excluded.label returning id",
            (label,),
        )
        cv = cur.fetchone()[0]

        # clear this version's corpus rows (FK order: text_unit -> source)
        cur.execute("delete from text_unit where corpus_version = %s", (cv,))
        cur.execute("delete from source where corpus_version = %s", (cv,))

        # sources -> title:id map
        src_id: dict[str, int] = {}
        for title in titles:
            cur.execute(
                "insert into source (kind, title, corpus_version) values ('session', %s, %s) "
                "returning id",
                (title, cv),
            )
            src_id[title] = cur.fetchone()[0]

        # text_units
        with cur.copy(
            "copy text_unit (source_id, section, paragraph_index, char_start, char_end, "
            "text, corpus_version) from stdin"
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

    print(f"corpus_version '{label}' (id {cv}): {n_src} sources, {n_units} text_units loaded")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
