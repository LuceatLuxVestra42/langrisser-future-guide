#!/usr/bin/env python3
import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PATH = ROOT / "data/generated/skin-stage1-canonical.v1.json"
HERO_SKIN_PATH = ROOT / "data/configdata/ConfigDataHeroSkinInfo.json"
RESOURCE_PATH = ROOT / "data/configdata/ConfigDataCharImageSkinResourceInfo.json"
PARITY_PATH = ROOT / "data/validation/skin-stage1-2-parity.v1.json"
OUTPUT_PATH = ROOT / "data/generated/skin-stage1-source-metadata.v1.json"
VALIDATION_PATH = ROOT / "data/validation/skin-stage1-3-final.v1.json"


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")


def index_unique(rows, key):
    out = {}
    dup = []
    for row in rows:
        value = row.get(key)
        if value in out:
            dup.append(value)
        else:
            out[value] = row
    return out, sorted(set(dup))


canonical_doc = load(CANONICAL_PATH)
hero_skin_rows = load(HERO_SKIN_PATH)
resource_rows = load(RESOURCE_PATH)
parity = load(PARITY_PATH)

canonical = canonical_doc.get("records", [])
hero_by_id, duplicate_hero_skin_ids = index_unique(hero_skin_rows, "ID")
resource_by_id, duplicate_resource_ids = index_unique(resource_rows, "ID")

failures = {
    "missingHeroSkinInfoSkinIds": [],
    "missingCharImageSkinResourceSkinIds": [],
    "ownerMismatchSkinIds": [],
    "nameMismatchSkinIds": [],
    "imageMismatchSkinIds": [],
    "spineMismatchSkinIds": [],
    "acquisitionMismatchSkinIds": [],
    "duplicateHeroSkinInfoIds": duplicate_hero_skin_ids,
    "duplicateCharImageSkinResourceIds": duplicate_resource_ids,
}

records = []
model_binding_total = 0
model_binding_skin_count = 0
model_binding_resource_ids = set()
field_coverage = Counter()
get_path_type_present_count = 0
get_path_desc_present_count = 0

for rec in canonical:
    skin_id = rec["skinId"]
    hero_id = rec["heroId"]
    hero_skin = hero_by_id.get(skin_id)
    if hero_skin is None:
        failures["missingHeroSkinInfoSkinIds"].append(skin_id)
        continue

    if hero_skin.get("SpecifiedHero") != hero_id:
        failures["ownerMismatchSkinIds"].append(skin_id)

    if hero_skin.get("Name") != rec.get("identity", {}).get("nameCn"):
        failures["nameMismatchSkinIds"].append(skin_id)

    resource_id = hero_skin.get("CharImageSkinResource_ID")
    resource = resource_by_id.get(resource_id)
    if resource is None:
        failures["missingCharImageSkinResourceSkinIds"].append(skin_id)
        continue

    if resource.get("Image") != rec.get("assets", {}).get("sourceImagePath"):
        failures["imageMismatchSkinIds"].append(skin_id)
    if resource.get("SpineAssetPath") != rec.get("assets", {}).get("sourceSpinePath"):
        failures["spineMismatchSkinIds"].append(skin_id)

    has_get_path_type = "GetPathType" in hero_skin
    has_get_path_desc = "GetPathDesc" in hero_skin
    if has_get_path_type:
        get_path_type_present_count += 1
    if has_get_path_desc:
        get_path_desc_present_count += 1

    acquisition = rec.get("acquisition", {})
    raw_type = hero_skin.get("GetPathType") if has_get_path_type else None
    expected_state = "ENCODED" if raw_type in (2, 3, 4) else "UNENCODED"
    if acquisition.get("state") != expected_state or acquisition.get("typeCode") != (raw_type if expected_state == "ENCODED" else None):
        failures["acquisitionMismatchSkinIds"].append(skin_id)

    raw_bindings = hero_skin.get("SpecifiedModelSkinResource") or []
    model_bindings = []
    for binding in raw_bindings:
        job_connection_id = binding.get("JobConnectionId")
        skin_resource_id = binding.get("SkinResourceId")
        model_bindings.append({
            "jobConnectionId": job_connection_id,
            "skinResourceId": skin_resource_id,
        })
        model_binding_total += 1
        if skin_resource_id is not None:
            model_binding_resource_ids.add(skin_resource_id)
    if model_bindings:
        model_binding_skin_count += 1

    display_source = {
        "nameCn": hero_skin.get("Name"),
        "descCn": hero_skin.get("Desc"),
        "iconPath": hero_skin.get("Icon"),
        "roundHeadImagePath": hero_skin.get("RoundHeadImage"),
        "smallHeadImagePath": hero_skin.get("SmallHeadImage"),
        "cardHeadImagePath": hero_skin.get("CardHeadImage"),
        "enablePreview": hero_skin.get("EnablePreview"),
    }
    for key, value in display_source.items():
        if value is not None and value != "":
            field_coverage[key] += 1

    records.append({
        "skinId": skin_id,
        "heroId": hero_id,
        "sourceOrder": rec["sourceOrder"],
        "sourceClass": rec["sourceClass"],
        "populationStatus": rec["populationStatus"],
        "heroSkinSource": {
            "heroSkinInfoId": hero_skin.get("ID"),
            "specifiedHeroId": hero_skin.get("SpecifiedHero"),
            "charImageSkinResourceId": resource_id,
            "modelBindings": model_bindings,
        },
        "displaySource": display_source,
        "artworkSource": {
            "charImageSkinResourceId": resource.get("ID"),
            "resourceNameCn": resource.get("Name"),
            "sourceImagePath": resource.get("Image"),
            "sourceSpinePath": resource.get("SpineAssetPath"),
        },
        "acquisitionSource": {
            "getPathTypePresent": has_get_path_type,
            "getPathType": raw_type,
            "getPathDescPresent": has_get_path_desc,
            "getPathDesc": hero_skin.get("GetPathDesc") if has_get_path_desc else None,
        },
    })

records.sort(key=lambda r: (r["heroId"], r["sourceOrder"], r["skinId"]))

critical_failure_count = sum(len(v) for v in failures.values())
status = "PASS" if (
    parity.get("status") == "PASS"
    and parity.get("completion") == "SKIN_STAGE1_2_COMPLETE"
    and len(canonical) == 540
    and len(records) == 540
    and critical_failure_count == 0
) else "FAIL"

output = {
    "version": 1,
    "stage": "skin-page-1",
    "substage": "1-3",
    "status": "GENERATED" if status == "PASS" else "GENERATED_WITH_ERRORS",
    "purpose": "Carry forward explicit source identifiers and raw source metadata needed by later Skin asset/acquisition stages without changing the frozen 540-record canonical population.",
    "sources": {
        "canonical": str(CANONICAL_PATH.relative_to(ROOT)),
        "heroSkinInfo": str(HERO_SKIN_PATH.relative_to(ROOT)),
        "charImageSkinResourceInfo": str(RESOURCE_PATH.relative_to(ROOT)),
        "stage12Parity": str(PARITY_PATH.relative_to(ROOT)),
    },
    "recordCount": len(records),
    "records": records,
}
write(OUTPUT_PATH, output)

validation = {
    "version": 1,
    "stage": "skin-page-1",
    "substage": "1-3",
    "checkpoint": "source-metadata-carry-forward",
    "status": status,
    "completion": "SKIN_STAGE1_3_COMPLETE" if status == "PASS" else "SKIN_STAGE1_3_BLOCKED",
    "output": str(OUTPUT_PATH.relative_to(ROOT)),
    "metrics": {
        "canonicalSkinCount": len(canonical),
        "sourceMetadataRecordCount": len(records),
        "heroSkinInfoResolvedCount": len(records) + len(failures["missingCharImageSkinResourceSkinIds"]),
        "charImageSkinResourceResolvedCount": len(records),
        "modelBindingSkinCount": model_binding_skin_count,
        "modelBindingTotalCount": model_binding_total,
        "uniqueModelSkinResourceIdCount": len(model_binding_resource_ids),
        "getPathTypePresentCount": get_path_type_present_count,
        "getPathDescPresentCount": get_path_desc_present_count,
        "displayFieldCoverage": dict(field_coverage),
        "criticalFailureCount": critical_failure_count,
    },
    "checks": {
        "stage12ParityPass": parity.get("status") == "PASS" and parity.get("completion") == "SKIN_STAGE1_2_COMPLETE",
        "canonicalSkinCount540": len(canonical) == 540,
        "sourceMetadataRecordCount540": len(records) == 540,
        "heroSkinInfoIdExact": len(failures["missingHeroSkinInfoSkinIds"]) == 0,
        "ownerExact": len(failures["ownerMismatchSkinIds"]) == 0,
        "nameExact": len(failures["nameMismatchSkinIds"]) == 0,
        "resourceResolvedExact": len(failures["missingCharImageSkinResourceSkinIds"]) == 0,
        "staticArtworkExact": len(failures["imageMismatchSkinIds"]) == 0,
        "animatedResourceExact": len(failures["spineMismatchSkinIds"]) == 0,
        "acquisitionStateExact": len(failures["acquisitionMismatchSkinIds"]) == 0,
        "heroSkinInfoIdsUnique": len(duplicate_hero_skin_ids) == 0,
        "charImageSkinResourceIdsUnique": len(duplicate_resource_ids) == 0,
    },
    "failures": failures,
    "rulesFrozen": [
        "This companion dataset does not add, remove or reclassify canonical skins.",
        "HeroSkinInfo.ID, SpecifiedHero, CharImageSkinResource_ID and SpecifiedModelSkinResource are copied only from explicit ConfigData fields.",
        "HeroSkinInfo icon/head-image/description/preview fields are preserved as source metadata, not interpreted as final frontend requirements.",
        "GetPathDesc is preserved as raw source text only; it does not resolve or classify the 176 UNENCODED acquisition records by itself.",
        "ConfigDataHeroSkinInfo.Score is intentionally excluded because it is not an accepted display-order or skin-type authority.",
        "CharImageSkinResourceInfo.Image and SpineAssetPath remain source locators; extraction/export/web paths remain Skin Stage 3 work.",
        "CN/KR release dates, KR_FUTURE status, Korean skin names and displayTarget remain deferred to Skin Stage 4.",
    ],
    "nextAction": "Skin 1-4: freeze Stage 1 acquisition-state carry-forward (ENCODED/UNENCODED) and explicitly isolate raw GetPathDesc as supplemental evidence without inference.",
}
write(VALIDATION_PATH, validation)

print(json.dumps({
    "status": status,
    "canonicalSkinCount": len(canonical),
    "sourceMetadataRecordCount": len(records),
    "modelBindingTotalCount": model_binding_total,
    "getPathTypePresentCount": get_path_type_present_count,
    "getPathDescPresentCount": get_path_desc_present_count,
    "criticalFailureCount": critical_failure_count,
}, ensure_ascii=False))

if status != "PASS":
    raise SystemExit(1)
