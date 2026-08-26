#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / "data/contracts/skin-stage1-release-deferral-policy.v1.json"
CANONICAL_PATH = ROOT / "data/generated/skin-stage1-canonical.v1.json"
STAGE_FILES = {
    "1-1": ROOT / "data/validation/skin-stage1-1-final.v1.json",
    "1-2": ROOT / "data/validation/skin-stage1-2-parity.v1.json",
    "1-3": ROOT / "data/validation/skin-stage1-3-final.v1.json",
    "1-4": ROOT / "data/validation/skin-stage1-4-final.v1.json",
}
OUTPUT_PATH = ROOT / "data/validation/skin-stage1-5-final.v1.json"
GENERATED_DIR = ROOT / "data/generated"


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def find_keys(value, prohibited, path="$", hits=None):
    if hits is None:
        hits = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key in prohibited:
                hits.append(child_path)
            find_keys(child, prohibited, child_path, hits)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            find_keys(child, prohibited, f"{path}[{i}]", hits)
    return hits


policy = load(POLICY_PATH)
canonical = load(CANONICAL_PATH)
prohibited = set(policy["prohibitedStage1Fields"])

stage_statuses = {}
for stage, path in STAGE_FILES.items():
    data = load(path)
    stage_statuses[stage] = {
        "status": data.get("status"),
        "completion": data.get("completion"),
        "pass": data.get("status") == "PASS",
    }

stage1_generated_files = sorted(
    p for p in GENERATED_DIR.glob("skin-stage1*.json") if p.is_file()
)
field_hits = []
for path in stage1_generated_files:
    data = load(path)
    for hit in find_keys(data, prohibited):
        field_hits.append({"file": str(path.relative_to(ROOT)), "path": hit})

future_subset_files = [
    str(p.relative_to(ROOT))
    for p in stage1_generated_files
    if "future" in p.name.lower()
]

records = canonical.get("records", [])
canonical_skin_ids = [r.get("skinId") for r in records]
checks = {
    "policyAccepted": policy.get("status") == "ACCEPTED",
    "policyDecisionDeferred": policy.get("decision") == "DEFERRED_PENDING_STAGE4_AUTHORITY",
    "futureSelectionDisabled": policy.get("releaseSelection", {}).get("futureSkinSelectionAllowed") is False,
    "releaseAuthorityNotEstablished": policy.get("releaseSelection", {}).get("releaseMetadataAuthorityEstablished") is False,
    "displayTargetAssignmentDisabled": policy.get("displayTarget", {}).get("assignmentAllowedInStage1") is False,
    "stage11Pass": stage_statuses["1-1"]["pass"],
    "stage12Pass": stage_statuses["1-2"]["pass"],
    "stage13Pass": stage_statuses["1-3"]["pass"],
    "stage14Pass": stage_statuses["1-4"]["pass"],
    "canonicalRecordCount540": len(records) == 540,
    "canonicalSkinIdsDistinct540": len(set(canonical_skin_ids)) == 540,
    "prohibitedReleaseFieldsZero": len(field_hits) == 0,
    "futureSubsetFilesZero": len(future_subset_files) == 0,
    "stage4CandidateVocabularyReservedOnly": policy.get("deferredReleaseVocabulary", {}).get("status") == "RESERVED_FOR_STAGE4_NOT_ASSIGNED_IN_STAGE1",
}

status = "PASS" if all(checks.values()) else "FAIL"
result = {
    "version": 1,
    "stage": "skin-page-1",
    "substage": "1-5",
    "checkpoint": "release-selection-deferral",
    "status": status,
    "completion": "SKIN_STAGE1_5_COMPLETE" if status == "PASS" else "SKIN_STAGE1_5_FAILED",
    "sources": {
        "policy": str(POLICY_PATH.relative_to(ROOT)),
        "canonical": str(CANONICAL_PATH.relative_to(ROOT)),
        "previousGates": {k: str(v.relative_to(ROOT)) for k, v in STAGE_FILES.items()},
    },
    "metrics": {
        "canonicalSkinCount": len(records),
        "distinctCanonicalSkinIdCount": len(set(canonical_skin_ids)),
        "stage1GeneratedJsonFileCount": len(stage1_generated_files),
        "prohibitedReleaseFieldOccurrenceCount": len(field_hits),
        "futureSubsetFileCount": len(future_subset_files),
        "releaseClassifiedSkinCount": 0 if len(field_hits) == 0 else None,
        "displayTargetAssignedSkinCount": 0 if len(field_hits) == 0 else None,
    },
    "previousGateStatus": stage_statuses,
    "checks": checks,
    "failures": {
        "prohibitedFieldOccurrences": field_hits,
        "futureSubsetFiles": future_subset_files,
    },
    "rulesFrozen": [
        "Skin Stage 1 does not classify any canonical skin as CN_RELEASED, KR_RELEASED, KR_FUTURE or UNKNOWN.",
        "The candidate release-state vocabulary is reserved for Skin Stage 4 and is not materialized into Stage 1 records.",
        "No displayTarget or future-page eligibility is assigned before validated CN/KR release metadata exists.",
        "Asset presence, sourceOrder, acquisition metadata, IDs and filenames are not release-state authorities.",
        "The 540-record canonical population remains consumer-agnostic through the end of Stage 1-5."
    ],
    "nextAction": "Skin 1-6: run the final Stage 1 cross-check across input contract, canonical population, parity, source metadata, acquisition freeze and release-selection deferral, then close Skin Stage 1."
}

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(json.dumps({
    "status": status,
    "canonicalSkinCount": len(records),
    "stage1GeneratedJsonFileCount": len(stage1_generated_files),
    "prohibitedReleaseFieldOccurrenceCount": len(field_hits),
    "futureSubsetFileCount": len(future_subset_files),
}, ensure_ascii=False))

if status != "PASS":
    raise SystemExit(1)
