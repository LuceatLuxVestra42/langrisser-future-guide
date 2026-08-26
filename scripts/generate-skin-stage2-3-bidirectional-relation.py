#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORWARD_PATH = ROOT / "data/generated/skin-stage2-1-forward-relation.v1.json"
FORWARD_VALIDATION_PATH = ROOT / "data/validation/skin-stage2-1-final.v1.json"
REVERSE_PATH = ROOT / "data/generated/skin-stage2-2-reverse-index.v1.json"
REVERSE_VALIDATION_PATH = ROOT / "data/validation/skin-stage2-2-final.v1.json"
OUTPUT_PATH = ROOT / "data/generated/skin-stage2-3-bidirectional-relation.v1.json"
VALIDATION_PATH = ROOT / "data/validation/skin-stage2-3-final.v1.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    forward = load_json(FORWARD_PATH)
    forward_validation = load_json(FORWARD_VALIDATION_PATH)
    reverse = load_json(REVERSE_PATH)
    reverse_validation = load_json(REVERSE_VALIDATION_PATH)

    forward_records = forward.get("records", [])
    reverse_records = reverse.get("records", [])

    forward_skin_ids = [r.get("skinId") for r in forward_records]
    forward_skin_counts = Counter(forward_skin_ids)
    duplicate_forward_skin_ids = sorted(
        skin_id for skin_id, count in forward_skin_counts.items() if count > 1
    )

    forward_by_skin = {}
    forward_by_hero = defaultdict(list)
    for record in forward_records:
        skin_id = record.get("skinId")
        hero_id = record.get("heroId")
        source_order = record.get("sourceOrder")
        forward_by_skin[skin_id] = {
            "heroId": hero_id,
            "sourceOrder": source_order,
        }
        forward_by_hero[hero_id].append((source_order, skin_id))

    for hero_id in forward_by_hero:
        forward_by_hero[hero_id].sort(key=lambda item: item[0])

    reverse_hero_ids = [r.get("heroId") for r in reverse_records]
    reverse_hero_counts = Counter(reverse_hero_ids)
    duplicate_reverse_hero_ids = sorted(
        hero_id for hero_id, count in reverse_hero_counts.items() if count > 1
    )

    reverse_skin_ids = []
    reverse_edges = []
    reverse_by_hero = {}
    for record in reverse_records:
        hero_id = record.get("heroId")
        skin_ids = record.get("skinIds", [])
        reverse_by_hero[hero_id] = list(skin_ids)
        for skin_id in skin_ids:
            reverse_skin_ids.append(skin_id)
            reverse_edges.append((skin_id, hero_id))

    reverse_skin_counts = Counter(reverse_skin_ids)
    duplicate_reverse_skin_ids = sorted(
        skin_id for skin_id, count in reverse_skin_counts.items() if count > 1
    )

    forward_edges = [(r.get("skinId"), r.get("heroId")) for r in forward_records]
    forward_edge_set = set(forward_edges)
    reverse_edge_set = set(reverse_edges)

    missing_edges = sorted(forward_edge_set - reverse_edge_set)
    extra_edges = sorted(reverse_edge_set - forward_edge_set)

    owner_mismatches = []
    for skin_id, hero_id in reverse_edges:
        expected = forward_by_skin.get(skin_id)
        if expected is None or expected.get("heroId") != hero_id:
            owner_mismatches.append({
                "skinId": skin_id,
                "reverseHeroId": hero_id,
                "forwardHeroId": None if expected is None else expected.get("heroId"),
            })

    source_order_mismatches = []
    for record in reverse_records:
        hero_id = record.get("heroId")
        actual_skin_ids = record.get("skinIds", [])
        expected_skin_ids = [skin_id for _, skin_id in forward_by_hero.get(hero_id, [])]
        if actual_skin_ids != expected_skin_ids:
            source_order_mismatches.append({
                "heroId": hero_id,
                "expectedSkinIds": expected_skin_ids,
                "actualSkinIds": actual_skin_ids,
            })

    heroes_with_skins = sum(1 for r in reverse_records if len(r.get("skinIds", [])) > 0)
    heroes_without_skins = sum(1 for r in reverse_records if len(r.get("skinIds", [])) == 0)

    checks = {
        "upstreamStage21Pass": forward_validation.get("status") == "PASS"
        and forward_validation.get("completion") == "SKIN_STAGE2_1_COMPLETE",
        "upstreamStage22Pass": reverse_validation.get("status") == "PASS"
        and reverse_validation.get("completion") == "SKIN_STAGE2_2_COMPLETE",
        "forwardRecordCount540": len(forward_records) == 540,
        "reverseHeroEntryCount267": len(reverse_records) == 267,
        "reverseDistinctHeroIdCount267": len(set(reverse_hero_ids)) == 267,
        "heroWithSkinsCount235": heroes_with_skins == 235,
        "heroWithoutSkinsCount32": heroes_without_skins == 32,
        "reverseEdgeCount540": len(reverse_edges) == 540,
        "distinctForwardSkinIdCount540": len(set(forward_skin_ids)) == 540,
        "distinctReverseSkinIdCount540": len(set(reverse_skin_ids)) == 540,
        "duplicateForwardSkinIdZero": len(duplicate_forward_skin_ids) == 0,
        "duplicateReverseSkinIdZero": len(duplicate_reverse_skin_ids) == 0,
        "duplicateReverseHeroIdZero": len(duplicate_reverse_hero_ids) == 0,
        "ownerMismatchZero": len(owner_mismatches) == 0,
        "missingEdgeZero": len(missing_edges) == 0,
        "extraEdgeZero": len(extra_edges) == 0,
        "sourceOrderMismatchZero": len(source_order_mismatches) == 0,
        "exactEdgeSetParity": forward_edge_set == reverse_edge_set,
        "exactEdgeCardinalityParity": len(forward_edges) == len(reverse_edges) == 540,
    }

    passed = all(checks.values())

    output = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-3",
        "status": "ACCEPTED" if passed else "REJECTED",
        "completion": "SKIN_STAGE2_3_COMPLETE" if passed else None,
        "contract": "data/contracts/skin-stage2-3-bidirectional-relation.v1.json",
        "sources": {
            "forwardRelation": "data/generated/skin-stage2-1-forward-relation.v1.json",
            "reverseIndex": "data/generated/skin-stage2-2-reverse-index.v1.json",
        },
        "cardinality": {
            "skinToHero": "EXACTLY_ONE",
            "heroToSkin": "ZERO_OR_MANY",
        },
        "counts": {
            "bySkinId": len(forward_by_skin),
            "byHeroId": len(reverse_by_hero),
            "edgeCount": len(reverse_edges),
        },
        "bySkinId": {
            str(skin_id): forward_by_skin[skin_id]
            for skin_id in sorted(forward_by_skin)
        },
        "byHeroId": {
            str(record.get("heroId")): list(record.get("skinIds", []))
            for record in reverse_records
        },
    }

    validation = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-3",
        "checkpoint": "bidirectional-relation-final",
        "status": "PASS" if passed else "FAIL",
        "completion": "SKIN_STAGE2_3_COMPLETE" if passed else None,
        "sources": {
            "contract": "data/contracts/skin-stage2-3-bidirectional-relation.v1.json",
            "forwardRelation": "data/generated/skin-stage2-1-forward-relation.v1.json",
            "forwardValidation": "data/validation/skin-stage2-1-final.v1.json",
            "reverseIndex": "data/generated/skin-stage2-2-reverse-index.v1.json",
            "reverseValidation": "data/validation/skin-stage2-2-final.v1.json",
        },
        "metrics": {
            "forwardRecordCount": len(forward_records),
            "reverseHeroEntryCount": len(reverse_records),
            "reverseHeroWithSkinsCount": heroes_with_skins,
            "reverseHeroWithoutSkinsCount": heroes_without_skins,
            "reverseEdgeCount": len(reverse_edges),
            "distinctForwardSkinIdCount": len(set(forward_skin_ids)),
            "distinctReverseSkinIdCount": len(set(reverse_skin_ids)),
            "duplicateForwardSkinIdCount": len(duplicate_forward_skin_ids),
            "duplicateReverseSkinIdCount": len(duplicate_reverse_skin_ids),
            "duplicateReverseHeroIdCount": len(duplicate_reverse_hero_ids),
            "ownerMismatchCount": len(owner_mismatches),
            "missingEdgeCount": len(missing_edges),
            "extraEdgeCount": len(extra_edges),
            "sourceOrderMismatchCount": len(source_order_mismatches),
        },
        "checks": checks,
        "failures": {
            "duplicateForwardSkinIds": duplicate_forward_skin_ids,
            "duplicateReverseSkinIds": duplicate_reverse_skin_ids,
            "duplicateReverseHeroIds": duplicate_reverse_hero_ids,
            "ownerMismatches": owner_mismatches,
            "missingEdges": [
                {"skinId": skin_id, "heroId": hero_id}
                for skin_id, hero_id in missing_edges
            ],
            "extraEdges": [
                {"skinId": skin_id, "heroId": hero_id}
                for skin_id, hero_id in extra_edges
            ],
            "sourceOrderMismatches": source_order_mismatches,
        },
        "frozenConsumerPaths": {
            "bySkinId": "skinId -> { heroId, sourceOrder }",
            "byHeroId": "heroId -> ordered skinId[]",
        },
        "frozenRules": [
            "The bidirectional checkpoint is derived only from accepted Stage 2-1 and Stage 2-2 relation outputs.",
            "Skin consumers use bySkinId and Hero consumers use byHeroId; downstream code must not rediscover ownership from raw ConfigData.",
            "All 267 canonical Heroes remain present in byHeroId, including 32 empty arrays.",
            "Hero skin order remains the accepted Stage 2-1 sourceOrder and is never replaced by numeric skinId sorting.",
            "No release, localization, acquisition or asset metadata is included in the relation checkpoint.",
        ],
        "nextAction": "Skin 2-4: verify this accepted bidirectional relation checkpoint against the frozen Stage 1 canonical/Hero Stage 5-5 parity baseline."
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    VALIDATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    VALIDATION_PATH.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
