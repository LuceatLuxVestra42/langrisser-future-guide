#!/usr/bin/env python3
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PATHS = {
    "inputContract": ROOT / "data/contracts/skin-stage1-input-contract.v1.json",
    "canonical": ROOT / "data/generated/skin-stage1-canonical.v1.json",
    "stage11": ROOT / "data/validation/skin-stage1-1-final.v1.json",
    "upstream": ROOT / "data/hero-page-stage5-5-3.v1.json",
    "sourceTrace": ROOT / "data/validation/hero-page-stage5-5-2-source-trace.v1.json",
    "heroFinalGate": ROOT / "data/validation/hero-page-stage5-5-5-final.v1.json",
    "output": ROOT / "data/validation/skin-stage1-2-parity.v1.json",
}


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def same(a, b):
    return a == b


def find_check(final_gate, name):
    for check in final_gate.get("checks", []):
        if check.get("name") == name:
            return check
    return None


contract = load(PATHS["inputContract"])
canonical = load(PATHS["canonical"])
stage11 = load(PATHS["stage11"])
upstream = load(PATHS["upstream"])
source_trace = load(PATHS["sourceTrace"])
hero_final = load(PATHS["heroFinalGate"])

upstream_records = upstream.get("records", [])
canonical_records = canonical.get("records", [])

expected_by_skin = {}
upstream_duplicate_skin_ids = []
upstream_hero_skin_counts = Counter()
for hero in upstream_records:
    hero_id = hero.get("heroId")
    skins = hero.get("skins", [])
    upstream_hero_skin_counts[hero_id] = len(skins)
    for skin in skins:
        skin_id = skin.get("skinId")
        if skin_id in expected_by_skin:
            upstream_duplicate_skin_ids.append(skin_id)
        expected_by_skin[skin_id] = {
            "skinId": skin_id,
            "heroId": hero_id,
            "sourceOrder": skin.get("order"),
            "sourceClass": "REGULAR_HERO_SKIN",
            "identity": {
                "nameCn": skin.get("nameCn"),
                "nameKr": skin.get("nameKr"),
            },
            "assets": {
                "sourceImagePath": skin.get("sourceImagePath"),
                "sourceSpinePath": skin.get("sourceSpinePath"),
            },
            "acquisition": skin.get("acquisition"),
            "populationStatus": "CANONICAL",
        }

canonical_by_skin = {}
canonical_duplicate_skin_ids = []
canonical_hero_skin_counts = Counter()
for record in canonical_records:
    skin_id = record.get("skinId")
    if skin_id in canonical_by_skin:
        canonical_duplicate_skin_ids.append(skin_id)
    canonical_by_skin[skin_id] = record
    canonical_hero_skin_counts[record.get("heroId")] += 1

upstream_ids = set(expected_by_skin)
canonical_ids = set(canonical_by_skin)
missing_skin_ids = sorted(upstream_ids - canonical_ids)
extra_skin_ids = sorted(canonical_ids - upstream_ids)

owner_mismatches = []
order_mismatches = []
identity_mismatches = []
image_mismatches = []
spine_mismatches = []
acquisition_mismatches = []
source_class_mismatches = []
population_status_mismatches = []

for skin_id in sorted(upstream_ids & canonical_ids):
    expected = expected_by_skin[skin_id]
    actual = canonical_by_skin[skin_id]
    if actual.get("heroId") != expected["heroId"]:
        owner_mismatches.append({"skinId": skin_id, "expected": expected["heroId"], "actual": actual.get("heroId")})
    if actual.get("sourceOrder") != expected["sourceOrder"]:
        order_mismatches.append({"skinId": skin_id, "expected": expected["sourceOrder"], "actual": actual.get("sourceOrder")})
    if not same(actual.get("identity"), expected["identity"]):
        identity_mismatches.append({"skinId": skin_id, "expected": expected["identity"], "actual": actual.get("identity")})
    assets = actual.get("assets") or {}
    if assets.get("sourceImagePath") != expected["assets"]["sourceImagePath"]:
        image_mismatches.append({"skinId": skin_id, "expected": expected["assets"]["sourceImagePath"], "actual": assets.get("sourceImagePath")})
    if assets.get("sourceSpinePath") != expected["assets"]["sourceSpinePath"]:
        spine_mismatches.append({"skinId": skin_id, "expected": expected["assets"]["sourceSpinePath"], "actual": assets.get("sourceSpinePath")})
    if not same(actual.get("acquisition"), expected["acquisition"]):
        acquisition_mismatches.append({"skinId": skin_id, "expected": expected["acquisition"], "actual": actual.get("acquisition")})
    if actual.get("sourceClass") != "REGULAR_HERO_SKIN":
        source_class_mismatches.append({"skinId": skin_id, "actual": actual.get("sourceClass")})
    if actual.get("populationStatus") != "CANONICAL":
        population_status_mismatches.append({"skinId": skin_id, "actual": actual.get("populationStatus")})

hero_ids = sorted(set(upstream_hero_skin_counts) | set(canonical_hero_skin_counts))
hero_skin_count_mismatches = [
    {"heroId": hero_id, "upstream": upstream_hero_skin_counts.get(hero_id, 0), "canonical": canonical_hero_skin_counts.get(hero_id, 0)}
    for hero_id in hero_ids
    if upstream_hero_skin_counts.get(hero_id, 0) != canonical_hero_skin_counts.get(hero_id, 0)
]

encoded_ids = sorted(
    r.get("skinId") for r in canonical_records
    if (r.get("acquisition") or {}).get("state") == "ENCODED"
)
unencoded_ids = sorted(
    r.get("skinId") for r in canonical_records
    if (r.get("acquisition") or {}).get("state") == "UNENCODED"
)

skin_structural_check = find_check(hero_final, "5-5-2 skin structural coverage")
structural = (skin_structural_check or {}).get("detail") or {}
hero_final_unencoded_ids = sorted(structural.get("getPathTypeMissingSkinIds", []))

source_skin = ((source_trace.get("fields") or {}).get("skins") or {})
source_artwork = source_skin.get("artwork") or {}
source_ordering = source_skin.get("ordering") or {}
source_acquisition = source_skin.get("acquisition") or {}

upstream_guard_checks = {
    "inputContractAccepted": contract.get("status") == "ACCEPTED",
    "stage11Pass": stage11.get("status") == "PASS" and stage11.get("completion") == "SKIN_STAGE1_1_COMPLETE",
    "heroFinalGatePass": hero_final.get("status") == "PASS" and hero_final.get("completion") == "STAGE_5_5_COMPLETE",
    "heroFinalCanonical267": (hero_final.get("summary") or {}).get("canonicalHeroCount") == 267,
    "heroFinalSkin540": (hero_final.get("summary") or {}).get("totalRegularSkinCount") == 540,
    "sourceMembershipJoinFrozen": source_skin.get("join") == "ConfigDataHeroInfo.Skins_ID[] -> ConfigDataHeroSkinInfo.ID",
    "sourceArtworkJoinFrozen": source_artwork.get("join") == "ConfigDataHeroSkinInfo.CharImageSkinResource_ID -> ConfigDataCharImageSkinResourceInfo.ID",
    "sourceOrderFrozen": source_ordering.get("source") == "ConfigDataHeroInfo.Skins_ID[] array position",
    "sourceAcquisitionFrozen": source_acquisition.get("source") == "ConfigDataHeroSkinInfo.GetPathType",
    "upstreamRecordCount267": upstream.get("recordCount") == 267 and len(upstream_records) == 267,
    "canonicalRecordCount540": canonical.get("recordCount") == 540 and len(canonical_records) == 540,
    "upstreamSkinCount540": len(expected_by_skin) == 540,
    "finalStructuralSkinRefs540": structural.get("totalSkinRefs") == 540 and structural.get("resolvedSkinRefs") == 540,
    "finalStructuralUnresolvedZero": len(structural.get("unresolvedSkinRefs", [])) == 0,
    "finalStructuralOwnerMismatchZero": len(structural.get("specifiedHeroMismatches", [])) == 0,
    "finalStructuralSharedZero": len(structural.get("sharedSkinRefs", [])) == 0,
    "finalStructuralDuplicateZero": len(structural.get("duplicateSkinRecordIds", [])) == 0,
    "unencodedSetMatchesHeroFinal": unencoded_ids == hero_final_unencoded_ids,
}

mismatch_counts = {
    "missingSkinIdCount": len(missing_skin_ids),
    "extraSkinIdCount": len(extra_skin_ids),
    "upstreamDuplicateSkinIdCount": len(upstream_duplicate_skin_ids),
    "canonicalDuplicateSkinIdCount": len(canonical_duplicate_skin_ids),
    "ownerMismatchCount": len(owner_mismatches),
    "sourceOrderMismatchCount": len(order_mismatches),
    "identityMismatchCount": len(identity_mismatches),
    "staticArtworkMismatchCount": len(image_mismatches),
    "animatedResourceMismatchCount": len(spine_mismatches),
    "acquisitionMismatchCount": len(acquisition_mismatches),
    "sourceClassMismatchCount": len(source_class_mismatches),
    "populationStatusMismatchCount": len(population_status_mismatches),
    "heroSkinCountMismatchCount": len(hero_skin_count_mismatches),
}

pass_state = all(upstream_guard_checks.values()) and all(v == 0 for v in mismatch_counts.values()) and len(encoded_ids) == 364 and len(unencoded_ids) == 176

output = {
    "version": 1,
    "stage": "skin-page-1",
    "substage": "1-2",
    "checkpoint": "upstream-parity",
    "status": "PASS" if pass_state else "FAIL",
    "completion": "SKIN_STAGE1_2_COMPLETE" if pass_state else "SKIN_STAGE1_2_BLOCKED",
    "purpose": "Verify that the 540-record Skin canonical master preserves the frozen Hero Stage 5-5 regular-skin membership, owner, source order, asset locators and acquisition semantics without reopening or redefining the upstream joins.",
    "sources": {k: str(v.relative_to(ROOT)) for k, v in PATHS.items() if k != "output"},
    "frozenRelations": {
        "membership": source_skin.get("join"),
        "ownerCrossCheck": source_skin.get("ownerCrossCheck"),
        "artwork": source_artwork.get("join"),
        "orderingSource": source_ordering.get("source"),
        "acquisitionSource": source_acquisition.get("source"),
    },
    "metrics": {
        "canonicalHeroCount": len(upstream_records),
        "heroesWithSkins": sum(1 for c in upstream_hero_skin_counts.values() if c > 0),
        "heroesWithNoSkins": sum(1 for c in upstream_hero_skin_counts.values() if c == 0),
        "upstreamSkinCount": len(expected_by_skin),
        "canonicalSkinCount": len(canonical_records),
        "distinctCanonicalSkinIdCount": len(canonical_ids),
        "acquisitionEncodedCount": len(encoded_ids),
        "acquisitionUnencodedCount": len(unencoded_ids),
        **mismatch_counts,
        "upstreamStructuralUnresolvedCount": len(structural.get("unresolvedSkinRefs", [])),
        "upstreamStructuralOwnerMismatchCount": len(structural.get("specifiedHeroMismatches", [])),
        "upstreamStructuralSharedSkinRefCount": len(structural.get("sharedSkinRefs", [])),
        "upstreamStructuralDuplicateSkinRecordCount": len(structural.get("duplicateSkinRecordIds", [])),
    },
    "checks": {
        **upstream_guard_checks,
        "skinIdSetExact": len(missing_skin_ids) == 0 and len(extra_skin_ids) == 0,
        "ownerParityExact": len(owner_mismatches) == 0,
        "sourceOrderParityExact": len(order_mismatches) == 0,
        "identityParityExact": len(identity_mismatches) == 0,
        "staticArtworkParityExact": len(image_mismatches) == 0,
        "animatedResourceParityExact": len(spine_mismatches) == 0,
        "acquisitionParityExact": len(acquisition_mismatches) == 0,
        "sourceClassFrozen": len(source_class_mismatches) == 0,
        "populationStatusFrozen": len(population_status_mismatches) == 0,
        "heroSkinPartitionExact": len(hero_skin_count_mismatches) == 0,
        "acquisitionEncoded364": len(encoded_ids) == 364,
        "acquisitionUnencoded176": len(unencoded_ids) == 176,
    },
    "failures": {
        "missingSkinIds": missing_skin_ids,
        "extraSkinIds": extra_skin_ids,
        "upstreamDuplicateSkinIds": sorted(set(upstream_duplicate_skin_ids)),
        "canonicalDuplicateSkinIds": sorted(set(canonical_duplicate_skin_ids)),
        "ownerMismatches": owner_mismatches,
        "sourceOrderMismatches": order_mismatches,
        "identityMismatches": identity_mismatches,
        "staticArtworkMismatches": image_mismatches,
        "animatedResourceMismatches": spine_mismatches,
        "acquisitionMismatches": acquisition_mismatches,
        "sourceClassMismatches": source_class_mismatches,
        "populationStatusMismatches": population_status_mismatches,
        "heroSkinCountMismatches": hero_skin_count_mismatches,
    },
    "rulesFrozen": [
        "Skin Stage 1-2 is a parity gate, not a new population census.",
        "Hero ownership is inherited from the accepted Hero Stage 5-5 per-Hero skins[] container and must remain identical for every skinId.",
        "sourceOrder must remain identical to the accepted Hero Stage 5-5 skin order; no alternate sorting is permitted.",
        "sourceImagePath and sourceSpinePath must remain byte-for-byte identical source asset locators.",
        "Acquisition objects, including UNENCODED/null values, must remain identical; no supplemental inference is introduced here.",
        "The 540 canonical skinId set must have no additions, removals or duplicates relative to the accepted upstream output.",
        "SP illustrations, Soldier skins, KR/CN release status, displayTarget and web-export paths remain out of scope."
    ],
    "nextAction": "Skin 1-3: carry forward already-confirmed source metadata needed by later asset/release stages without altering the 540 canonical population."
}

PATHS["output"].parent.mkdir(parents=True, exist_ok=True)
with PATHS["output"].open("w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(json.dumps({
    "status": output["status"],
    "completion": output["completion"],
    "metrics": output["metrics"],
}, ensure_ascii=False, indent=2))

if not pass_state:
    raise SystemExit(1)
