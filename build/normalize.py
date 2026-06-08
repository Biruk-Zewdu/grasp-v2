#!/usr/bin/env python3
"""M0 — corpus normalizer.

Reads the parsed session notes and splits each into addressable *text units*
(paragraphs) with char offsets and a best-effort section label, so provenance
can later point precisely at a passage.

Output: build/records/text_units.json  (the loader maps source_title -> source_id
and assigns corpus_version when the DB is up). Pure stdlib; deterministic.

Usage:  python build/normalize.py [CORPUS_DIR]
Default CORPUS_DIR = ../2_session_notes relative to the repo (kept in the
ai_for_business workspace, not copied into the repo).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HEADING = re.compile(r"^(?:\d+(?:\.\d+)*\.?\s+\S|[A-Z][A-Z ]{6,}$)")  # "2.1 Foo" or ALLCAPS
PARA_SPLIT = re.compile(r"\n[ \t]*\n")
NOISE = re.compile(r"^\d+$")  # lone page numbers

REPO = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = Path(__file__).resolve().parents[2] / "2_session_notes"
OUT = REPO / "build" / "records" / "text_units.json"


def section_for(block: str, current: str | None) -> str | None:
    first = block.lstrip().splitlines()[0] if block.strip() else ""
    return first.strip() if HEADING.match(first.strip()) else current


def units_for(text: str):
    units, section, idx, pos = [], None, 0, 0
    for raw in PARA_SPLIT.split(text):
        start = text.find(raw, pos)
        pos = start + len(raw)
        stripped = raw.strip()
        if not stripped or NOISE.match(stripped):
            continue
        section = section_for(raw, section)
        units.append({
            "section": section,
            "paragraph_index": idx,
            "char_start": start,
            "char_end": start + len(raw),
            "text": stripped,
        })
        idx += 1
    return units


def main() -> int:
    corpus = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CORPUS
    files = sorted(corpus.glob("session_*.md"))
    if not files:
        print(f"no session_*.md found in {corpus}", file=sys.stderr)
        return 1

    sources, text_units = [], []
    for f in files:
        text = f.read_text(encoding="utf-8")
        us = units_for(text)
        sources.append({"title": f.stem, "kind": "session", "n_units": len(us)})
        for u in us:
            text_units.append({"source_title": f.stem, **u})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(
        {"corpus_label": "v1-draft", "sources": sources, "text_units": text_units},
        ensure_ascii=False, indent=2,
    ), encoding="utf-8")

    print(f"sources: {len(sources)}  text_units: {len(text_units)}  -> {OUT.relative_to(REPO)}")
    for s in sources:
        print(f"  {s['title']:45} {s['n_units']:4} units")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
