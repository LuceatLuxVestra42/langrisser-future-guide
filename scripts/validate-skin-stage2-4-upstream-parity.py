#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PATH = ROOT / "data/generated/skin-stage1-canonical.v1.json"
STAGE1_PARITY_PATH = ROOT / "data/validation/skin-stage1-2-parity.v1.json"
BIDIRECTIONAL_PATH = ROOT / "data/generated/skin-stage2-3-bidirectional-relation.v1.json"
STAGE23_VALIDATION_PATH = ROOT / "data/validation/skin-stage2-3-final.v1.json"
HERO_MASTER_PATH = ROOT / "data/hero-name-master.v1.json"
VALIDATION_PATH = ROOT / "data/validation/skin-stage2-4-final.v1.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    canonical = load_json(CANONICAL_PATH)
    stage1_parity = load_json(STAGE1_PARITY_PATH)
    bidirectional = load_json(BIDIRECTIONAL_PATH)
    stage23_validation = load_json(STAGE23_VALIDATION_PATH)
    hero_master = load_json(HERO_MASTER_PATH)

    canonical_records = canonical.get("records", [])
    hero_records = hero_master.get("records", [])
    canonical_hero_ids = [r.get("heroId") for r in hero_records]
    canonical_hero_id_set = set(canonical_hero_ids)

    canonical_skin_ids = [r.get("skinId") for r in canonical_records]
    canonical_skin_counts = Counter(canonical_skin_ids)
    duplicate_canonical_skin_ids = sorted(
        skin_id for skin_id, count in canonical_skin_counts.items() if count > 1
    )

    expected_by_skin = {}
    grouped = defaultdict(list)
    unknown_canonical_hero_ids = []
    invalid_canonical_records = []

    for record in canonical_records:
        skin_id = record.get("skinId")
        hero_id = record.get("heroId")
        source_order = record.get("sourceOrder")

        if skin_id is None or hero_id is None or not isinstance(source_order, int) or source_order < 1:
            invalid_canonical_records.append({
                "skinId": skin_id,
                "heroId": hero_id,
                "sourceOrder": source_order,
            })
            continue

        if hero_id not in canonical_hero_id_set:
            unknown_canonical_hero_ids.append({"skinId": skin_id, "heroId": hero_id})

        expected_by_skin[str(skin_id)] = {
            "heroId": hero_id,
            "sourceOrder": source_order,
        }
        grouped[hero_id].append((source_order, skin_id))

    expected_by_hero = {str(hero_id): [] for hero_id in canonical_hero_ids}
    for hero_id, items in grouped.items():
        items.sort(key=lambda item: item[0])
        if hero_id in canonical_hero_id_set:
            expected_by_hero[str(hero_id)] = [skin_id for _, skin_id in items]

    actual_by_skin = bidirectional.get("bySkinId", {})
    actual_by_hero = bidirectional.get("byHeroId", {})

    expected_skin_keys = set(expected_by_skin)
    actual_skin_keys = set(actual_by_skin)
    missing_skin_ids = sorted(int(k) for k in expected_skin_keys - actual_skin_keys)
    extra_skin_ids = sorted(int(k) for k in actual_skin_keys - expected_skin_keys)

    owner_mismatches = []
    source_order_mismatches = []
    for skin_key in sorted(expected_skin_keys & actual_skin_keys, key=int):
        expected = expected_by_skin[skin_key]
        actual = actual_by_skin.get(skin_key, {})
        if actual.get("heroId") != expected.get("heroId"):
            owner_mismatches.append({
                "skinId": int(skin_key),
                "expectedHeroId": expected.get("heroId"),
                "actualHeroId": actual.get("heroId"),
            })
        if actual.get("sourceOrder") != expected.get("sourceOrder"):
            source_order_mismatches.append({
                "skinId": int(skin_key),
                "expectedSourceOrder": expected.get("sourceOrder"),
                "actualSourceOrder": actual.get("sourceOrder"),
            })

    expected_hero_keys = set(expected_by_hero)
    actual_hero_keys = set(actual_by_hero)
    missing_hero_entries = sorted(int(k) for k in expected_hero_keys - actual_hero_keys)
    extra_hero_entries = sorted(int(k) for k in actual_hero_keys - expected_hero_keys)

    reverse_list_mismatches = []
    for hero_key in sorted(expected_hero_keys & actual_hero_keys, key=int):
        expected = expected_by_hero[hero_key]
        actual = actual_by_hero.get(hero_key)
        if actual != expected:
            reverse_list_mismatches.append({
                "heroId": int(hero_key),
                "expectedSkinIds": expected,
                "actualSkinIds": actual,
            })

    heroes_with_skins = sum(1 for skin_ids in expected_by_hero.values() if skin_ids)
    heroes_without_skins = sum(1 for skin_ids in expected_by_hero.values() if not skin_ids)
    canonical_edge_count = sum(len(skin_ids) for skin_ids in expected_by_hero.values())
    actual_edge_count = sum(len(skin_ids) for skin_ids in actual_by_hero.values() if isinstance(skin_ids, list))

    stage1_metrics = stage1_parity.get("metrics", {})
    checks = {
        "stage1ParityPass": stage1_parity.get("status") == "PASS"
        and stage1_parity.get("completion") == "SKIN_STAGE1_2_COMPLETE",
        "stage1HeroCount267": stage1_metrics.get("canonicalHeroCount") == 267,
        "stage1SkinCount540": stage1_metrics.get("canonicalSkinCount") == 540,
        "stage1DistinctSkinCount540": stage1_metrics.get("distinctCanonicalSkinIdCount") == 540,
        "stage1OwnerMismatchZero": stage1_metrics.get("ownerMismatchCount") == 0,
        "stage1SourceOrderMismatchZero": stage1_metrics.get("sourceOrderMismatchCount") == 0,
        "stage23Pass": stage23_validation.get("status") == "PASS"
        and stage23_validation.get("completion") == "SKIN_STAGE2_3_COMPLETE",
        "stage23Accepted": bidirectional.get("status") == "ACCEPTED"
        and bidirectional.get("completion") == "SKIN_STAGE2_3_COMPLETE",
        "canonicalHeroCount267": len(canonical_hero_ids) == 267,
        "distinctCanonicalHeroCount267": len(canonical_hero_id_set) == 267,
        "canonicalSkinCount540": len(canonical_records) == 540,
        "distinctCanonicalSkinCount540": len(set(canonical_skin_ids)) == 540,
        "duplicateCanonicalSkinIdZero": len(duplicate_canonical_skin_ids) == 0,
        "unknownCanonicalHeroIdZero": len(unknown_canonical_hero_ids) == 0,
        "invalidCanonicalRecordZero": len(invalid_canonical_records) == 0,
        "bySkinIdCount540": len(actual_by_skin) == 540,
        "byHeroIdCount267": len(actual_by_hero) == 267,
        "heroesWithSkins235": heroes_with_skins == 235,
        "heroesWithoutSkins32": heroes_without_skins == 32,
        "canonicalEdgeCount540": canonical_edge_count == 540,
        "actualEdgeCount540": actual_edge_count == 540,
        "missingSkinIdZero": len(missing_skin_ids) == 0,
        "extraSkinIdZero": len(extra_skin_ids) == 0,
        "ownerMismatchZero": len(owner_mismatches) == 0,
        "sourceOrderMismatchZero": len(source_order_mismatches) == 0,
        "missingHeroEntryZero": len(missing_hero_entries) == 0,
        "extraHeroEntryZero": len(extra_hero_entries) == 0,
        "reverseListMismatchZero": len(reverse_list_mismatches) == 0,
        "exactBySkinIdParity": actual_by_skin == expected_by_skin,
        "exactByHeroIdParity": actual_by_hero == expected_by_hero,
    }

    passed = all(checks.values())

    validation = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-4",
        "checkpoint": "stage1-upstream-parity-final",
        "status": "PASS" if passed else "FAIL",
        "completion": "SKIN_STAGE2_4_COMPLETE" if passed else None,
        "sources": {
            "contract": "data/contracts/skin-stage2-4-upstream-parity.v1.json",
            "stage1Canonical": "data/generated/skin-stage1-canonical.v1.json",
            "stage1UpstreamParity": "data/validation/skin-stage1-2-parity.v1.json",
            "stage2BidirectionalRelation": "data/generated/skin-stage2-3-bidirectional-relation.v1.json",
            "stage2BidirectionalValidation": "data/validation/skin-stage2-3-final.v1.json",
            "heroKeyspace": "data/hero-name-master.v1.json"
        },
        "verificationBoundary": {
            "heroStage55DirectRead": False,
            "rawConfigDataRead": False,
            "reason": "Skin Stage 1-2 is the accepted frozen proof of Hero Stage 5-5 membership/owner/sourceOrder parity; Stage 2-4 reuses that checkpoint and verifies Stage 2-3 against Stage 1 canonical."
        },
        "metrics": {
            "canonicalHeroCount": len(canonical_hero_ids),
            "canonicalSkinCount": len(canonical_records),
            "distinctCanonicalSkinIdCount": len(set(canonical_skin_ids)),
            "bySkinIdCount": len(actual_by_skin),
            "byHeroIdCount": len(actual_by_hero),
            "heroesWithSkins": heroes_with_skins,
            "heroesWithoutSkins": heroes_without_skins,
            "canonicalEdgeCount": canonical_edge_count,
            "actualEdgeCount": actual_edge_count,
            "duplicateCanonicalSkinIdCount": len(duplicate_canonical_skin_ids),
            "unknownCanonicalHeroIdCount": len(unknown_canonical_hero_ids),
            "invalidCanonicalRecordCount": len(invalid_canonical_records),
            "missingSkinIdCount": len(missing_skin_ids),
            "extraSkinIdCount": len(extra_skin_ids),
            "ownerMismatchCount": len(owner_mismatches),
            "sourceOrderMismatchCount": len(source_order_mismatches),
            "missingHeroEntryCount": len(missing_hero_entries),
            "extraHeroEntryCount": len(extra_hero_entries),
            "reverseListMismatchCount": len(reverse_list_mismatches)
        },
        "checks": checks,
        "failures": {
            "duplicateCanonicalSkinIds": duplicate_canonical_skin_ids,
            "unknownCanonicalHeroIds": unknown_canonical_hero_ids,
            "invalidCanonicalRecords": invalid_canonical_records,
            "missingSkinIds": missing_skin_ids,
            "extraSkinIds": extra_skin_ids,
            "ownerMismatches": owner_mismatches,
            "sourceOrderMismatches": source_order_mismatches,
            "missingHeroEntries": missing_hero_entries,
            "extraHeroEntries": extra_hero_entries,
            "reverseListMismatches": reverse_list_mismatches
        },
        "frozenConclusion": [
            "Stage 2-3 preserves the exact 540-skin Stage 1 canonical membership set.",
            "Every Stage 2-3 bySkinId heroId and sourceOrder remains identical to Stage 1 canonical.",
            "Every Stage 2-3 byHeroId list is exactly the Stage 1 canonical grouping in frozen sourceOrder across all 267 canonical Heroes, including 32 empty lists.",
            "Because Skin Stage 1-2 already proves exact owner/sourceOrder parity to Hero Stage 5-5, this closes the Stage 2 relation chain without reopening Hero Stage 5-5 or raw ConfigData."
        ],
        "nextAction": "Skin 2-5: publish the official relation consumer contract and final Stage 2 gate."
    }

    VALIDATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    VALIDATION_PATH.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
