#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PATH = ROOT / "data/generated/skin-stage1-canonical.v1.json"
HERO_MASTER_PATH = ROOT / "data/hero-name-master.v1.json"
OUTPUT_PATH = ROOT / "data/generated/skin-stage2-1-forward-relation.v1.json"
VALIDATION_PATH = ROOT / "data/validation/skin-stage2-1-final.v1.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main():
    canonical = load_json(CANONICAL_PATH)
    hero_master = load_json(HERO_MASTER_PATH)

    canonical_records = canonical.get("records", [])
    hero_ids = {r["heroId"] for r in hero_master.get("records", [])}

    relations = []
    seen_skin_ids = set()
    duplicate_skin_ids = []
    unknown_hero_ids = []
    missing_hero_ids = []
    invalid_source_orders = []

    for r in canonical_records:
        skin_id = r.get("skinId")
        hero_id = r.get("heroId")
        source_order = r.get("sourceOrder")

        if skin_id in seen_skin_ids:
            duplicate_skin_ids.append(skin_id)
        seen_skin_ids.add(skin_id)

        if hero_id is None:
            missing_hero_ids.append(skin_id)
        elif hero_id not in hero_ids:
            unknown_hero_ids.append({"skinId": skin_id, "heroId": hero_id})

        if not isinstance(source_order, int) or source_order < 1:
            invalid_source_orders.append({"skinId": skin_id, "sourceOrder": source_order})

        relations.append({
            "skinId": skin_id,
            "heroId": hero_id,
            "sourceOrder": source_order,
        })

    output = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-1",
        "status": "GENERATED",
        "inputContract": "data/contracts/skin-stage2-input-contract.v1.json",
        "contract": "data/contracts/skin-stage2-1-forward-relation.v1.json",
        "source": "data/generated/skin-stage1-canonical.v1.json",
        "relation": "Skin -> Hero",
        "cardinality": "EXACTLY_ONE",
        "recordCount": len(relations),
        "records": relations,
    }

    checks = {
        "recordCount540": len(relations) == 540,
        "distinctSkinIdCount540": len(seen_skin_ids) == 540,
        "canonicalRecordCount540": len(canonical_records) == 540,
        "canonicalHeroCount267": len(hero_ids) == 267,
        "duplicateSkinIdZero": len(duplicate_skin_ids) == 0,
        "unknownHeroIdZero": len(unknown_hero_ids) == 0,
        "missingHeroIdZero": len(missing_hero_ids) == 0,
        "invalidSourceOrderZero": len(invalid_source_orders) == 0,
        "exactProjectionParity": all(
            rel["skinId"] == src.get("skinId")
            and rel["heroId"] == src.get("heroId")
            and rel["sourceOrder"] == src.get("sourceOrder")
            for rel, src in zip(relations, canonical_records)
        ),
    }

    validation = {
        "version": 1,
        "stage": "skin-page-2",
        "substage": "2-1",
        "checkpoint": "forward-relation-final",
        "status": "PASS" if all(checks.values()) else "FAIL",
        "completion": "SKIN_STAGE2_1_COMPLETE" if all(checks.values()) else None,
        "sources": {
            "inputContract": "data/contracts/skin-stage2-input-contract.v1.json",
            "contract": "data/contracts/skin-stage2-1-forward-relation.v1.json",
            "canonical": "data/generated/skin-stage1-canonical.v1.json",
            "heroMaster": "data/hero-name-master.v1.json",
        },
        "metrics": {
            "canonicalHeroCount": len(hero_ids),
            "canonicalSkinCount": len(canonical_records),
            "forwardRelationCount": len(relations),
            "distinctForwardSkinIdCount": len(seen_skin_ids),
            "duplicateSkinIdCount": len(duplicate_skin_ids),
            "unknownHeroIdCount": len(unknown_hero_ids),
            "missingHeroIdCount": len(missing_hero_ids),
            "invalidSourceOrderCount": len(invalid_source_orders),
        },
        "checks": checks,
        "failures": {
            "duplicateSkinIds": duplicate_skin_ids,
            "unknownHeroIds": unknown_hero_ids,
            "missingHeroIds": missing_hero_ids,
            "invalidSourceOrders": invalid_source_orders,
        },
        "frozenRules": [
            "The Stage 2-1 relation is a projection of Stage 1 canonical skinId, heroId and sourceOrder only.",
            "Skin -> Hero cardinality is EXACTLY_ONE.",
            "No raw ConfigData ownership or ordering rediscovery is performed.",
            "No alternate sorting or sourceOrder renumbering is permitted.",
        ],
        "nextAction": "Skin 2-2: build the 267-entry Hero -> ordered Skin reverse index from this accepted forward relation."
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    VALIDATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    VALIDATION_PATH.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not all(checks.values()):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
