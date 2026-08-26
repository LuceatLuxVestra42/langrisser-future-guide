#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "data/hero-page-stage5-5-3.v1.json"
CONTRACT = ROOT / "data/contracts/skin-stage1-input-contract.v1.json"
OUTPUT = ROOT / "data/generated/skin-stage1-canonical.v1.json"
VALIDATION = ROOT / "data/validation/skin-stage1-1-final.v1.json"


def load_json(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    upstream = load_json(UPSTREAM)
    contract = load_json(CONTRACT)
    baseline = contract["acceptedBaseline"]

    hero_records = upstream.get("records", [])
    flat = []
    heroes_with_skins = 0
    heroes_without_skins = 0

    for hero in hero_records:
        hero_id = hero["heroId"]
        skins = hero.get("skins", [])
        if skins:
            heroes_with_skins += 1
        else:
            heroes_without_skins += 1

        for skin in skins:
            flat.append({
                "skinId": skin["skinId"],
                "heroId": hero_id,
                "sourceOrder": skin["order"],
                "sourceClass": "REGULAR_HERO_SKIN",
                "identity": {
                    "nameCn": skin.get("nameCn"),
                    "nameKr": skin.get("nameKr")
                },
                "assets": {
                    "sourceImagePath": skin.get("sourceImagePath"),
                    "sourceSpinePath": skin.get("sourceSpinePath")
                },
                "acquisition": skin.get("acquisition"),
                "populationStatus": "CANONICAL"
            })

    skin_ids = [r["skinId"] for r in flat]
    duplicate_skin_ids = sorted(k for k, v in Counter(skin_ids).items() if v > 1)
    missing_image = [r["skinId"] for r in flat if not r["assets"]["sourceImagePath"]]
    missing_spine = [r["skinId"] for r in flat if not r["assets"]["sourceSpinePath"]]
    invalid_order = [r["skinId"] for r in flat if not isinstance(r["sourceOrder"], int) or r["sourceOrder"] < 1]
    invalid_class = [r["skinId"] for r in flat if r["sourceClass"] != "REGULAR_HERO_SKIN"]
    invalid_population = [r["skinId"] for r in flat if r["populationStatus"] != "CANONICAL"]

    acquisition_states = Counter((r.get("acquisition") or {}).get("state") for r in flat)

    expected_hero_count = baseline["canonicalHeroCount"]
    expected_skin_count = baseline["canonicalRegularSkinCount"]
    expected_encoded = baseline["acquisitionEncodedCount"]
    expected_unencoded = baseline["acquisitionUnencodedCount"]

    checks = {
        "upstreamRecordCount267": len(hero_records) == expected_hero_count == upstream.get("recordCount"),
        "canonicalSkinCount540": len(flat) == expected_skin_count,
        "distinctSkinIdCount540": len(set(skin_ids)) == baseline["distinctSkinIdCount"],
        "duplicateSkinIdsZero": len(duplicate_skin_ids) == 0,
        "missingStaticArtworkZero": len(missing_image) == 0,
        "missingAnimatedResourceZero": len(missing_spine) == 0,
        "invalidSourceOrderZero": len(invalid_order) == 0,
        "sourceClassAllRegularHeroSkin": len(invalid_class) == 0,
        "populationStatusAllCanonical": len(invalid_population) == 0,
        "acquisitionEncoded364": acquisition_states.get("ENCODED", 0) == expected_encoded,
        "acquisitionUnencoded176": acquisition_states.get("UNENCODED", 0) == expected_unencoded,
        "acquisitionStateTotal540": sum(acquisition_states.values()) == expected_skin_count,
        "heroSkinPartition267": heroes_with_skins + heroes_without_skins == expected_hero_count
    }

    status = "PASS" if all(checks.values()) else "FAIL"

    output = {
        "version": 1,
        "stage": "skin-page-1",
        "substage": "1-1",
        "status": "GENERATED" if status == "PASS" else "INVALID",
        "inputContract": "data/contracts/skin-stage1-input-contract.v1.json",
        "upstream": "data/hero-page-stage5-5-3.v1.json",
        "populationDefinition": "Accepted regular Hero skins from Hero Stage 5-5, flattened one record per skin without changing membership, owner, source order, asset locators or acquisition semantics.",
        "recordCount": len(flat),
        "records": flat
    }

    validation = {
        "version": 1,
        "stage": "skin-page-1",
        "substage": "1-1",
        "checkpoint": "canonical-population",
        "status": status,
        "completion": "SKIN_STAGE1_1_COMPLETE" if status == "PASS" else "BLOCKED",
        "sources": [
            "data/contracts/skin-stage1-input-contract.v1.json",
            "data/hero-page-stage5-5-3.v1.json"
        ],
        "output": "data/generated/skin-stage1-canonical.v1.json",
        "metrics": {
            "canonicalHeroCount": len(hero_records),
            "heroesWithSkins": heroes_with_skins,
            "heroesWithNoSkins": heroes_without_skins,
            "canonicalSkinCount": len(flat),
            "distinctSkinIdCount": len(set(skin_ids)),
            "duplicateSkinIdCount": len(duplicate_skin_ids),
            "missingStaticArtworkCount": len(missing_image),
            "missingAnimatedResourceCount": len(missing_spine),
            "invalidSourceOrderCount": len(invalid_order),
            "acquisitionEncodedCount": acquisition_states.get("ENCODED", 0),
            "acquisitionUnencodedCount": acquisition_states.get("UNENCODED", 0)
        },
        "failures": {
            "duplicateSkinIds": duplicate_skin_ids,
            "missingStaticArtworkSkinIds": missing_image,
            "missingAnimatedResourceSkinIds": missing_spine,
            "invalidSourceOrderSkinIds": invalid_order,
            "invalidSourceClassSkinIds": invalid_class,
            "invalidPopulationStatusSkinIds": invalid_population
        },
        "checks": checks,
        "rulesFrozen": [
            "One canonical record per accepted regular skinId.",
            "heroId and sourceOrder are copied from the accepted Hero Stage 5-5 consumer; no ownership/order inference is performed.",
            "sourceImagePath and sourceSpinePath remain source asset locators, not web-serving URLs.",
            "Missing acquisition encoding remains UNENCODED and is not inferred.",
            "No future/KR release displayTarget classification is performed in Skin Stage 1-1.",
            "No SP illustration or Soldier skin is admitted to this canonical population."
        ],
        "nextAction": "Skin 1-2: run owner/order/resource parity checks against the frozen upstream relation contract without redefining the 540-record population."
    }

    dump_json(OUTPUT, output)
    dump_json(VALIDATION, validation)

    print(json.dumps(validation["metrics"], ensure_ascii=False, sort_keys=True))
    if status != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
