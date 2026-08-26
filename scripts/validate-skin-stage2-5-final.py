#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "data/contracts/skin-stage2-5-consumer-contract.v1.json"
STAGE20_PATH = ROOT / "data/validation/skin-stage2-0-input-summary.v1.json"
STAGE21_PATH = ROOT / "data/validation/skin-stage2-1-final.v1.json"
STAGE22_PATH = ROOT / "data/validation/skin-stage2-2-final.v1.json"
RELATION_PATH = ROOT / "data/generated/skin-stage2-3-bidirectional-relation.v1.json"
STAGE23_PATH = ROOT / "data/validation/skin-stage2-3-final.v1.json"
STAGE24_PATH = ROOT / "data/validation/skin-stage2-4-final.v1.json"
OUTPUT_PATH = ROOT / "data/validation/skin-stage2-5-final.v1.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def gate_ok(obj, completion):
    return obj.get("status") == "PASS" and obj.get("completion") == completion


def main():
    contract = load_json(CONTRACT_PATH)
    stage20 = load_json(STAGE20_PATH)
    stage21 = load_json(STAGE21_PATH)
    stage22 = load_json(STAGE22_PATH)
    relation = load_json(RELATION_PATH)
    stage23 = load_json(STAGE23_PATH)
    stage24 = load_json(STAGE24_PATH)

    by_skin = relation.get("bySkinId", {})
    by_hero = relation.get("byHeroId", {})

    invalid_skin_entries = []
    for skin_key, value in by_skin.items():
        valid = (
            isinstance(skin_key, str)
            and skin_key.isdigit()
            and isinstance(value, dict)
            and set(value.keys()) == {"heroId", "sourceOrder"}
            and isinstance(value.get("heroId"), int)
            and isinstance(value.get("sourceOrder"), int)
            and value.get("sourceOrder") >= 1
        )
        if not valid:
            invalid_skin_entries.append(skin_key)

    invalid_hero_entries = []
    zero_skin_hero_ids = []
    reverse_skin_ids = []
    for hero_key, skin_ids in by_hero.items():
        valid_key = isinstance(hero_key, str) and hero_key.isdigit()
        valid_list = isinstance(skin_ids, list) and all(isinstance(skin_id, int) for skin_id in skin_ids)
        if not (valid_key and valid_list):
            invalid_hero_entries.append(hero_key)
            continue
        if len(skin_ids) == 0:
            zero_skin_hero_ids.append(int(hero_key))
        reverse_skin_ids.extend(skin_ids)

    duplicate_reverse_skin_ids = sorted(
        skin_id for skin_id in set(reverse_skin_ids) if reverse_skin_ids.count(skin_id) > 1
    )

    relation_counts = relation.get("counts", {})
    contract_source = contract.get("officialConsumerSource", {})
    consumer_lookups = contract.get("consumerLookups", {})
    contract_rules = contract.get("consumerRules", [])

    checks = {
        "consumerContractAccepted": contract.get("status") == "ACCEPTED",
        "consumerContractStage25": contract.get("stage") == "skin-page-2" and contract.get("substage") == "2-5",
        "officialConsumerPathFrozen": contract_source.get("path") == "data/generated/skin-stage2-3-bidirectional-relation.v1.json",
        "stage20Pass": gate_ok(stage20, "SKIN_STAGE2_0_COMPLETE"),
        "stage21Pass": gate_ok(stage21, "SKIN_STAGE2_1_COMPLETE"),
        "stage22Pass": gate_ok(stage22, "SKIN_STAGE2_2_COMPLETE"),
        "stage23Pass": gate_ok(stage23, "SKIN_STAGE2_3_COMPLETE"),
        "stage24Pass": gate_ok(stage24, "SKIN_STAGE2_4_COMPLETE"),
        "relationAccepted": relation.get("status") == "ACCEPTED",
        "relationCompletionStage23": relation.get("completion") == "SKIN_STAGE2_3_COMPLETE",
        "relationSkinToHeroExactlyOne": relation.get("cardinality", {}).get("skinToHero") == "EXACTLY_ONE",
        "relationHeroToSkinZeroOrMany": relation.get("cardinality", {}).get("heroToSkin") == "ZERO_OR_MANY",
        "relationCountsMetadataBySkin540": relation_counts.get("bySkinId") == 540,
        "relationCountsMetadataByHero267": relation_counts.get("byHeroId") == 267,
        "relationCountsMetadataEdge540": relation_counts.get("edgeCount") == 540,
        "actualBySkinIdCount540": len(by_skin) == 540,
        "actualByHeroIdCount267": len(by_hero) == 267,
        "actualReverseEdgeCount540": len(reverse_skin_ids) == 540,
        "distinctReverseSkinIdCount540": len(set(reverse_skin_ids)) == 540,
        "zeroSkinHeroCount32": len(zero_skin_hero_ids) == 32,
        "invalidBySkinIdEntryZero": len(invalid_skin_entries) == 0,
        "invalidByHeroIdEntryZero": len(invalid_hero_entries) == 0,
        "duplicateReverseSkinIdZero": len(duplicate_reverse_skin_ids) == 0,
        "bySkinIdLookupContractPresent": consumer_lookups.get("bySkinId", {}).get("access") == "relation.bySkinId[String(skinId)]",
        "byHeroIdLookupContractPresent": consumer_lookups.get("byHeroId", {}).get("access") == "relation.byHeroId[String(heroId)]",
        "bySkinIdContractCount540": consumer_lookups.get("bySkinId", {}).get("keyCount") == 540,
        "byHeroIdContractCount267": consumer_lookups.get("byHeroId", {}).get("keyCount") == 267,
        "consumerRulesPublished": len(contract_rules) >= 7,
        "stage24ExactBySkinParity": stage24.get("checks", {}).get("exactBySkinIdParity") is True,
        "stage24ExactByHeroParity": stage24.get("checks", {}).get("exactByHeroIdParity") is True,
        "stage24OwnerMismatchZero": stage24.get("metrics", {}).get("ownerMismatchCount") == 0,
        "stage24SourceOrderMismatchZero": stage24.get("metrics", {}).get("sourceOrderMismatchCount") == 0,
        "stage24MissingSkinZero": stage24.get("metrics", {}).get("missingSkinIdCount") == 0,
        "stage24ExtraSkinZero": stage24.get("metrics", {}).get("extraSkinIdCount") == 0,
        "stage24ReverseListMismatchZero": stage24.get("metrics", {}).get("reverseListMismatchCount") == 0,
    }

    failed_checks = [name for name, passed in checks.items() if not passed]
    passed = len(failed_checks) == 0

    validation = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-5",
        "checkpoint": "stage2-final-gate",
        "status": "PASS" if passed else "FAIL",
        "substageCompletion": "SKIN_STAGE2_5_COMPLETE" if passed else None,
        "completion": "SKIN_STAGE2_COMPLETE" if passed else None,
        "sources": {
            "consumerContract": "data/contracts/skin-stage2-5-consumer-contract.v1.json",
            "stage20": "data/validation/skin-stage2-0-input-summary.v1.json",
            "stage21": "data/validation/skin-stage2-1-final.v1.json",
            "stage22": "data/validation/skin-stage2-2-final.v1.json",
            "officialConsumerRelation": "data/generated/skin-stage2-3-bidirectional-relation.v1.json",
            "stage23": "data/validation/skin-stage2-3-final.v1.json",
            "stage24": "data/validation/skin-stage2-4-final.v1.json"
        },
        "officialConsumerSource": "data/generated/skin-stage2-3-bidirectional-relation.v1.json",
        "metrics": {
            "checkCount": len(checks),
            "passedCheckCount": sum(1 for value in checks.values() if value),
            "failedCheckCount": len(failed_checks),
            "bySkinIdCount": len(by_skin),
            "byHeroIdCount": len(by_hero),
            "reverseEdgeCount": len(reverse_skin_ids),
            "distinctReverseSkinIdCount": len(set(reverse_skin_ids)),
            "zeroSkinHeroCount": len(zero_skin_hero_ids),
            "invalidBySkinIdEntryCount": len(invalid_skin_entries),
            "invalidByHeroIdEntryCount": len(invalid_hero_entries),
            "duplicateReverseSkinIdCount": len(duplicate_reverse_skin_ids)
        },
        "checks": checks,
        "failures": {
            "failedChecks": failed_checks,
            "invalidBySkinIdEntries": invalid_skin_entries,
            "invalidByHeroIdEntries": invalid_hero_entries,
            "duplicateReverseSkinIds": duplicate_reverse_skin_ids
        },
        "frozenConsumerContract": {
            "bySkinId": "relation.bySkinId[String(skinId)] -> { heroId, sourceOrder }",
            "byHeroId": "relation.byHeroId[String(heroId)] -> ordered skinId[]",
            "skinToHeroCardinality": "EXACTLY_ONE",
            "heroToSkinCardinality": "ZERO_OR_MANY",
            "allCanonicalHeroesRepresented": True,
            "zeroSkinHeroesRemainEmptyArrays": True,
            "preserveStoredHeroSkinOrder": True,
            "rawConfigDataRelationRecalculationAllowed": False
        },
        "stage2Closure": [
            "Stage 2-0 froze accepted Stage 1 relation inputs and prohibited raw ownership/order rediscovery.",
            "Stage 2-1 materialized exactly 540 Skin -> Hero/sourceOrder forward records.",
            "Stage 2-2 materialized all 267 Hero -> ordered Skin entries, including 32 explicit empty arrays.",
            "Stage 2-3 proved exact forward/reverse bidirectional parity and published the unified relation artifact.",
            "Stage 2-4 proved exact Stage 2-3 parity back to Stage 1 canonical, which already carries accepted Hero Stage 5-5 parity.",
            "Stage 2-5 freezes the unified Stage 2-3 relation artifact as the only official downstream relation consumer source."
        ],
        "nextAction": "Skin Stage 3: inventory/extract/export/map Skin assets while reusing the frozen Stage 2 relation consumer source for owner/order joins."
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
