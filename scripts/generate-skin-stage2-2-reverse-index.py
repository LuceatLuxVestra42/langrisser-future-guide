#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORWARD_PATH = ROOT / "data/generated/skin-stage2-1-forward-relation.v1.json"
FORWARD_VALIDATION_PATH = ROOT / "data/validation/skin-stage2-1-final.v1.json"
HERO_MASTER_PATH = ROOT / "data/hero-name-master.v1.json"
OUTPUT_PATH = ROOT / "data/generated/skin-stage2-2-reverse-index.v1.json"
VALIDATION_PATH = ROOT / "data/validation/skin-stage2-2-final.v1.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    forward = load_json(FORWARD_PATH)
    forward_validation = load_json(FORWARD_VALIDATION_PATH)
    hero_master = load_json(HERO_MASTER_PATH)

    forward_records = forward.get("records", [])
    hero_records = hero_master.get("records", [])
    hero_ids_in_order = [r.get("heroId") for r in hero_records]
    hero_id_set = set(hero_ids_in_order)

    grouped = defaultdict(list)
    unknown_forward_hero_ids = []
    duplicate_forward_skin_ids = []
    invalid_forward_records = []
    seen_forward_skin_ids = set()

    for input_index, r in enumerate(forward_records):
        skin_id = r.get("skinId")
        hero_id = r.get("heroId")
        source_order = r.get("sourceOrder")

        if not isinstance(skin_id, int) or not isinstance(hero_id, int) or not isinstance(source_order, int) or source_order < 1:
            invalid_forward_records.append({
                "inputIndex": input_index,
                "skinId": skin_id,
                "heroId": hero_id,
                "sourceOrder": source_order,
            })

        if skin_id in seen_forward_skin_ids:
            duplicate_forward_skin_ids.append(skin_id)
        seen_forward_skin_ids.add(skin_id)

        if hero_id not in hero_id_set:
            unknown_forward_hero_ids.append({"skinId": skin_id, "heroId": hero_id})
            continue

        grouped[hero_id].append({
            "skinId": skin_id,
            "sourceOrder": source_order,
            "inputIndex": input_index,
        })

    records = []
    expected_order_by_hero = {}
    for hero_id in hero_ids_in_order:
        ordered_edges = sorted(
            grouped.get(hero_id, []),
            key=lambda edge: (edge["sourceOrder"], edge["inputIndex"]),
        )
        skin_ids = [edge["skinId"] for edge in ordered_edges]
        expected_order_by_hero[hero_id] = skin_ids
        records.append({
            "heroId": hero_id,
            "skinIds": skin_ids,
        })

    reverse_edges = [
        (skin_id, record["heroId"])
        for record in records
        for skin_id in record["skinIds"]
    ]
    forward_edges = [(r.get("skinId"), r.get("heroId")) for r in forward_records]

    forward_counter = Counter(forward_edges)
    reverse_counter = Counter(reverse_edges)
    missing_counter = forward_counter - reverse_counter
    extra_counter = reverse_counter - forward_counter

    missing_edges = [
        {"skinId": skin_id, "heroId": hero_id, "count": count}
        for (skin_id, hero_id), count in sorted(missing_counter.items(), key=lambda x: (x[0][1], x[0][0]))
    ]
    extra_edges = [
        {"skinId": skin_id, "heroId": hero_id, "count": count}
        for (skin_id, hero_id), count in sorted(extra_counter.items(), key=lambda x: (x[0][1], x[0][0]))
    ]

    reverse_skin_owners = defaultdict(list)
    for skin_id, hero_id in reverse_edges:
        reverse_skin_owners[skin_id].append(hero_id)

    duplicate_reverse_skin_ids = sorted(
        skin_id for skin_id, owners in reverse_skin_owners.items() if len(owners) > 1
    )

    forward_owner_by_skin = {}
    for r in forward_records:
        skin_id = r.get("skinId")
        hero_id = r.get("heroId")
        if skin_id not in forward_owner_by_skin:
            forward_owner_by_skin[skin_id] = hero_id

    owner_mismatches = []
    for skin_id, owners in sorted(reverse_skin_owners.items()):
        expected_owner = forward_owner_by_skin.get(skin_id)
        for actual_owner in owners:
            if expected_owner != actual_owner:
                owner_mismatches.append({
                    "skinId": skin_id,
                    "expectedHeroId": expected_owner,
                    "actualHeroId": actual_owner,
                })

    source_order_mismatches = []
    for record in records:
        hero_id = record["heroId"]
        if record["skinIds"] != expected_order_by_hero[hero_id]:
            source_order_mismatches.append({
                "heroId": hero_id,
                "expectedSkinIds": expected_order_by_hero[hero_id],
                "actualSkinIds": record["skinIds"],
            })

    hero_with_skins = [r["heroId"] for r in records if r["skinIds"]]
    hero_without_skins = [r["heroId"] for r in records if not r["skinIds"]]
    reverse_skin_ids = [skin_id for skin_id, _ in reverse_edges]
    distinct_reverse_skin_ids = set(reverse_skin_ids)
    distinct_hero_ids = set(hero_ids_in_order)

    output = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-2",
        "status": "GENERATED",
        "inputContract": "data/contracts/skin-stage2-input-contract.v1.json",
        "contract": "data/contracts/skin-stage2-2-reverse-index.v1.json",
        "source": "data/generated/skin-stage2-1-forward-relation.v1.json",
        "heroKeyspace": "data/hero-name-master.v1.json",
        "relation": "Hero -> ordered Skin",
        "cardinality": "ZERO_OR_MANY",
        "ordering": "ascending Stage 2-1 sourceOrder",
        "recordCount": len(records),
        "edgeCount": len(reverse_edges),
        "records": records,
    }

    checks = {
        "upstreamStage21Pass": (
            forward_validation.get("status") == "PASS"
            and forward_validation.get("completion") == "SKIN_STAGE2_1_COMPLETE"
        ),
        "forwardRecordCount540": len(forward_records) == 540,
        "heroMasterRecordCount267": len(hero_records) == 267,
        "heroEntryCount267": len(records) == 267,
        "distinctHeroIdCount267": len(distinct_hero_ids) == 267,
        "heroWithSkinsCount235": len(hero_with_skins) == 235,
        "heroWithoutSkinsCount32": len(hero_without_skins) == 32,
        "reverseEdgeCount540": len(reverse_edges) == 540,
        "distinctReverseSkinIdCount540": len(distinct_reverse_skin_ids) == 540,
        "unknownForwardHeroIdZero": len(unknown_forward_hero_ids) == 0,
        "duplicateForwardSkinIdZero": len(duplicate_forward_skin_ids) == 0,
        "duplicateReverseSkinIdZero": len(duplicate_reverse_skin_ids) == 0,
        "invalidForwardRecordZero": len(invalid_forward_records) == 0,
        "forwardReverseOwnerMismatchZero": len(owner_mismatches) == 0,
        "forwardReverseMissingEdgeZero": len(missing_edges) == 0,
        "forwardReverseExtraEdgeZero": len(extra_edges) == 0,
        "sourceOrderMismatchZero": len(source_order_mismatches) == 0,
        "exactEdgeMultisetParity": forward_counter == reverse_counter,
        "allCanonicalHeroesRepresented": [r["heroId"] for r in records] == hero_ids_in_order,
    }

    validation = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-2",
        "checkpoint": "reverse-index-final",
        "status": "PASS" if all(checks.values()) else "FAIL",
        "completion": "SKIN_STAGE2_2_COMPLETE" if all(checks.values()) else None,
        "sources": {
            "inputContract": "data/contracts/skin-stage2-input-contract.v1.json",
            "contract": "data/contracts/skin-stage2-2-reverse-index.v1.json",
            "forwardRelation": "data/generated/skin-stage2-1-forward-relation.v1.json",
            "forwardValidation": "data/validation/skin-stage2-1-final.v1.json",
            "heroMaster": "data/hero-name-master.v1.json"
        },
        "metrics": {
            "canonicalHeroCount": len(hero_records),
            "reverseHeroEntryCount": len(records),
            "reverseHeroWithSkinsCount": len(hero_with_skins),
            "reverseHeroWithoutSkinsCount": len(hero_without_skins),
            "forwardEdgeCount": len(forward_edges),
            "reverseEdgeCount": len(reverse_edges),
            "distinctReverseSkinIdCount": len(distinct_reverse_skin_ids),
            "unknownForwardHeroIdCount": len(unknown_forward_hero_ids),
            "duplicateForwardSkinIdCount": len(duplicate_forward_skin_ids),
            "duplicateReverseSkinIdCount": len(duplicate_reverse_skin_ids),
            "invalidForwardRecordCount": len(invalid_forward_records),
            "forwardReverseOwnerMismatchCount": len(owner_mismatches),
            "forwardReverseMissingEdgeCount": sum(x["count"] for x in missing_edges),
            "forwardReverseExtraEdgeCount": sum(x["count"] for x in extra_edges),
            "sourceOrderMismatchCount": len(source_order_mismatches),
        },
        "checks": checks,
        "informational": {
            "heroesWithoutRegularSkins": hero_without_skins,
        },
        "failures": {
            "unknownForwardHeroIds": unknown_forward_hero_ids,
            "duplicateForwardSkinIds": duplicate_forward_skin_ids,
            "duplicateReverseSkinIds": duplicate_reverse_skin_ids,
            "invalidForwardRecords": invalid_forward_records,
            "ownerMismatches": owner_mismatches,
            "missingEdges": missing_edges,
            "extraEdges": extra_edges,
            "sourceOrderMismatches": source_order_mismatches,
        },
        "frozenRules": [
            "The Stage 2-2 reverse index is derived only from the accepted Stage 2-1 forward relation and the canonical 267-Hero keyspace.",
            "Hero -> Skin cardinality is ZERO_OR_MANY and every canonical Hero is represented exactly once.",
            "Heroes with no regular skins remain explicit entries with an empty skinIds array.",
            "Per-Hero skinIds preserve ascending Stage 2-1 sourceOrder and are not re-sorted by any alternate field.",
            "No raw ConfigData ownership or ordering rediscovery is performed."
        ],
        "nextAction": "Skin 2-3: prove full forward/reverse relation parity and publish the accepted bidirectional relation checkpoint for downstream consumers."
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    VALIDATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    VALIDATION_PATH.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
