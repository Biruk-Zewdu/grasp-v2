#!/usr/bin/env python3
"""M1 validator — the substitute for the API's structured-output guarantee.

Validates a session's hand-authored knowledge records (build/records/session_N/
records.json) BEFORE they are loaded. Three layers:

  1. Field/enum validation  — each record is built into its Pydantic model
     (schemas/), so bad enums, missing fields, etc. are rejected.
  2. Cross-record references — every relation/claim/tension/probe key resolves
     to an entity/claim/tension defined in the same file (no dangling refs).
  3. Invariants             — I2 (provenance >=1), I3 (tension two-sided),
     I4 (generalizes => abstraction(from) > abstraction(to)), probe target,
     and that every provenance anchor (source, paragraph_index) resolves to a
     real text_unit in build/records/text_units.json.

Records carry local STRING keys (resolved to DB ids by the loader). To reuse
the Pydantic validators we assign each keyed record a synthetic int id.

Usage:
  python3 build/validate.py                      # validate every session_*/records.json
  python3 build/validate.py build/records/session_1
Exit code 0 = all valid; 1 = at least one error (details printed).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from pydantic import ValidationError  # noqa: E402

from schemas import (  # noqa: E402
    Claim,
    Entity,
    Probe,
    Provenance,
    Relation,
    Tension,
)

RECORDS_DIR = REPO / "build" / "records"
TEXT_UNITS = RECORDS_DIR / "text_units.json"

# Abstraction ordering for I4 (higher generalizes lower).
ABSTRACTION_RANK = {
    "foundational": 4,
    "paradigmatic": 3,
    "mechanism": 2,
    "instance": 1,
    "example": 0,
}
CV_PLACEHOLDER = 1  # synthetic corpus_version for field validation only


def _load_text_unit_index() -> dict[tuple[str, int], bool]:
    """(source_title, paragraph_index) -> exists, from the normalizer output."""
    data = json.loads(TEXT_UNITS.read_text(encoding="utf-8"))
    idx: dict[tuple[str, int], bool] = {}
    for u in data["text_units"]:
        idx[(u["source_title"], u["paragraph_index"])] = True
    return idx


def validate_session(path: Path, tu_index: dict[tuple[str, int], bool]) -> list[str]:
    """Return a list of human-readable errors ([] => valid)."""
    errors: list[str] = []
    rec_file = path / "records.json" if path.is_dir() else path
    data = json.loads(rec_file.read_text(encoding="utf-8"))
    src_title = data["source_title"]

    def err(msg: str) -> None:
        errors.append(f"[{rec_file.relative_to(REPO)}] {msg}")

    # --- entities: field validation + key map + abstraction lookup ---
    ent_key_id: dict[str, int] = {}
    ent_abstraction: dict[str, str | None] = {}
    for i, e in enumerate(data.get("entities", []), start=1):
        key = e.get("key")
        if not key:
            err(f"entity #{i} missing 'key'")
            continue
        if key in ent_key_id:
            err(f"duplicate entity key '{key}'")
        ent_key_id[key] = i
        ent_abstraction[key] = e.get("abstraction")
        try:
            Entity(
                name=e["name"], type=e["type"], definition=e.get("definition"),
                abstraction=e.get("abstraction"), paradigm=e.get("paradigm"),
                source_ids=[1], corpus_version=CV_PLACEHOLDER,
            )
        except (ValidationError, KeyError) as ex:
            err(f"entity '{key}' invalid: {ex}")

    # --- relations: refs + I4 + field validation ---
    for i, r in enumerate(data.get("relations", []), start=1):
        f, t = r.get("from"), r.get("to")
        if f not in ent_key_id:
            err(f"relation #{i} 'from' references unknown entity '{f}'")
        if t not in ent_key_id:
            err(f"relation #{i} 'to' references unknown entity '{t}'")
        if f in ent_key_id and t in ent_key_id:
            try:
                Relation(
                    from_entity=ent_key_id[f], rel_type=r["rel_type"],
                    to_entity=ent_key_id[t], evidence=r.get("evidence"),
                    source_ids=[1], corpus_version=CV_PLACEHOLDER,
                )
            except (ValidationError, KeyError) as ex:
                err(f"relation #{i} ({f} {r.get('rel_type')} {t}) invalid: {ex}")
                continue
            if r.get("rel_type") in ("generalizes", "specializes"):
                hi, lo = (f, t) if r["rel_type"] == "generalizes" else (t, f)
                ra, rb = ent_abstraction.get(hi), ent_abstraction.get(lo)
                if ra in ABSTRACTION_RANK and rb in ABSTRACTION_RANK:
                    if ABSTRACTION_RANK[ra] <= ABSTRACTION_RANK[rb]:
                        err(f"relation #{i} violates I4: '{hi}' ({ra}) must be "
                            f"more abstract than '{lo}' ({rb})")
        # provenance anchor for the relation's evidence (optional para)
        if "para" in r and (src_title, r["para"]) not in tu_index:
            err(f"relation #{i} para {r['para']} has no text_unit in '{src_title}'")

    # --- claims: refs + provenance anchors + I2 + field validation ---
    claim_key_id: dict[str, int] = {}
    for i, c in enumerate(data.get("claims", []), start=1):
        key = c.get("key")
        if not key:
            err(f"claim #{i} missing 'key'")
            continue
        if key in claim_key_id:
            err(f"duplicate claim key '{key}'")
        claim_key_id[key] = i
        for ck in c.get("concept_keys", []):
            if ck not in ent_key_id:
                err(f"claim '{key}' references unknown concept '{ck}'")
        prov_models = []
        for p in c.get("provenance", []):
            if "para" not in p:
                err(f"claim '{key}' provenance missing 'para' anchor")
                continue
            if (src_title, p["para"]) not in tu_index:
                err(f"claim '{key}' para {p['para']} has no text_unit in '{src_title}'")
            try:
                prov_models.append(Provenance(
                    source_kind="session", text_unit_id=p["para"] + 1,
                    source_ref=None, asserted_by=p.get("asserted_by"),
                ))
            except ValidationError as ex:
                err(f"claim '{key}' provenance invalid: {ex}")
        try:
            Claim(
                proposition=c["proposition"],
                concept_ids=[ent_key_id[k] for k in c.get("concept_keys", []) if k in ent_key_id],
                claim_type=c["claim_type"], thinker=c.get("thinker"),
                paradigm=c["paradigm"], conditions=c.get("conditions"),
                status=c.get("status", "default"), corpus_version=CV_PLACEHOLDER,
                provenance=prov_models,  # I2: min_length=1 enforced here
            )
        except (ValidationError, KeyError) as ex:
            err(f"claim '{key}' invalid: {ex}")

    # --- tensions: refs + I3 (via model) ---
    tension_key_id: dict[str, int] = {}
    for i, tn in enumerate(data.get("tensions", []), start=1):
        key = tn.get("key")
        if key:
            tension_key_id[key] = i
        for side in ("claim_a", "claim_b"):
            if tn.get(side) not in claim_key_id:
                err(f"tension #{i} {side} references unknown claim '{tn.get(side)}'")
        ca, cb = claim_key_id.get(tn.get("claim_a")), claim_key_id.get(tn.get("claim_b"))
        if ca and cb:
            try:
                Tension(
                    claim_a=ca, claim_b=cb, dimension=tn.get("dimension"),
                    conditions_a=tn.get("conditions_a", ""),
                    conditions_b=tn.get("conditions_b", ""),
                    session_ids=[1], corpus_version=CV_PLACEHOLDER,
                )
            except ValidationError as ex:
                err(f"tension #{i} invalid (I3?): {ex}")

    # --- probes: target + refs (via model) ---
    for i, pb in enumerate(data.get("probes", []), start=1):
        for ck in pb.get("concept_keys", []):
            if ck not in ent_key_id:
                err(f"probe #{i} references unknown concept '{ck}'")
        tk = pb.get("tension_key")
        if tk is not None and tk not in tension_key_id:
            err(f"probe #{i} references unknown tension '{tk}'")
        try:
            Probe(
                kind=pb["kind"], prompt=pb["prompt"],
                concept_ids=[ent_key_id[k] for k in pb.get("concept_keys", []) if k in ent_key_id],
                tension_id=(tension_key_id.get(tk) if tk else None),
                expected_signals=pb.get("expected_signals", []),
                corpus_version=CV_PLACEHOLDER,
            )
        except (ValidationError, KeyError) as ex:
            err(f"probe #{i} invalid: {ex}")

    return errors


def main(argv: list[str]) -> int:
    tu_index = _load_text_unit_index()
    if len(argv) > 1:
        targets = [Path(argv[1])]
        if not targets[0].is_absolute():
            targets[0] = REPO / targets[0]
    else:
        targets = sorted(p for p in RECORDS_DIR.glob("session_*") if p.is_dir())

    if not targets:
        print("no session records found to validate")
        return 0

    total_errors = 0
    for t in targets:
        rec_file = t / "records.json" if t.is_dir() else t
        if not rec_file.exists():
            print(f"SKIP {t} (no records.json)")
            continue
        errs = validate_session(t, tu_index)
        if errs:
            total_errors += len(errs)
            print(f"FAIL {rec_file.relative_to(REPO)} — {len(errs)} error(s):")
            for e in errs:
                print(f"  - {e}")
        else:
            data = json.loads(rec_file.read_text(encoding="utf-8"))
            print(f"OK   {rec_file.relative_to(REPO)} — "
                  f"{len(data.get('entities', []))} entities, "
                  f"{len(data.get('relations', []))} relations, "
                  f"{len(data.get('claims', []))} claims, "
                  f"{len(data.get('tensions', []))} tensions, "
                  f"{len(data.get('probes', []))} probes")
    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
