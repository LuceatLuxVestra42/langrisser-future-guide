#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "data/generated/skin-stage1-canonical.v1.json"
SOURCE_METADATA = ROOT / "data/generated/skin-stage1-source-metadata.v1.json"
STAGE13 = ROOT / "data/validation/skin-stage1-3-final.v1.json"
POLICY = ROOT / "data/contracts/skin-stage1-acquisition-policy.v1.json"
OUT = ROOT / "data/generated/skin-stage1-acquisition-state.v1.json"
VALIDATION = ROOT / "data/validation/skin-stage1-4-final.v1.json"


def load(path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


canonical = load(CANONICAL)
source_metadata = load(SOURCE_METADATA)
stage13 = load(STAGE13)
policy = load(POLICY)

canonical_records = canonical["records"]
metadata_by_skin = {r["skinId"]: r for r in source_metadata["records"]}
mappings = {int(k): v for k, v in policy["encodedMappings"].items()}

records = []
missing_metadata = []
state_mismatches = []
type_mismatches = []
label_mismatches = []
invalid_encoded_codes = []
raw_desc_presence_mismatches = []

state_counts = Counter()
code_counts = Counter()
evidence_counts = Counter()
unencoded_with_desc_ids = []
unencoded_without_desc_ids = []

for c in canonical_records:
    skin_id = c["skinId"]
    meta = metadata_by_skin.get(skin_id)
    if meta is None:
        missing_metadata.append(skin_id)
        continue

    canonical_acq = c["acquisition"]
    source_acq = meta["acquisitionSource"]
    state = canonical_acq["state"]
    state_counts[state] += 1

    get_path_type_present = bool(source_acq["getPathTypePresent"])
    get_path_type = source_acq["getPathType"]
    get_path_desc_present = bool(source_acq["getPathDescPresent"])
    get_path_desc = source_acq["getPathDesc"]

    if get_path_desc_present != (get_path_desc is not None):
        raw_desc_presence_mismatches.append(skin_id)

    if state == "ENCODED":
        code = canonical_acq["typeCode"]
        code_counts[code] += 1
        if not get_path_type_present:
            state_mismatches.append({"skinId": skin_id, "issue": "ENCODED_WITHOUT_SOURCE_GETPATHTYPE"})
        if get_path_type != code:
            type_mismatches.append({"skinId": skin_id, "canonical": code, "source": get_path_type})
        if code not in mappings:
            invalid_encoded_codes.append({"skinId": skin_id, "typeCode": code})
        else:
            expected = mappings[code]
            if canonical_acq.get("labelCn") != expected["labelCn"] or canonical_acq.get("labelKr") != expected["labelKr"]:
                label_mismatches.append({
                    "skinId": skin_id,
                    "typeCode": code,
                    "canonicalLabelCn": canonical_acq.get("labelCn"),
                    "canonicalLabelKr": canonical_acq.get("labelKr"),
                    "expectedLabelCn": expected["labelCn"],
                    "expectedLabelKr": expected["labelKr"],
                })
        evidence_counts["encodedWithDesc" if get_path_desc_present else "encodedWithoutDesc"] += 1
        encoded = {
            "typeCode": code,
            "labelCn": canonical_acq.get("labelCn"),
            "labelKr": canonical_acq.get("labelKr"),
        }
    elif state == "UNENCODED":
        if get_path_type_present or get_path_type is not None:
            state_mismatches.append({
                "skinId": skin_id,
                "issue": "UNENCODED_WITH_SOURCE_GETPATHTYPE",
                "source": get_path_type,
            })
        if any(canonical_acq.get(k) is not None for k in ("typeCode", "labelCn", "labelKr")):
            type_mismatches.append({
                "skinId": skin_id,
                "canonical": canonical_acq,
                "source": source_acq,
            })
        evidence_counts["unencodedWithDesc" if get_path_desc_present else "unencodedWithoutDesc"] += 1
        if get_path_desc_present:
            unencoded_with_desc_ids.append(skin_id)
        else:
            unencoded_without_desc_ids.append(skin_id)
        encoded = None
    else:
        state_mismatches.append({"skinId": skin_id, "issue": f"UNKNOWN_STATE:{state}"})
        encoded = None

    records.append({
        "skinId": skin_id,
        "heroId": c["heroId"],
        "stage1AcquisitionState": state,
        "encoded": encoded,
        "supplementalEvidence": {
            "getPathDescPresent": get_path_desc_present,
            "getPathDescRaw": get_path_desc,
            "role": "SUPPLEMENTAL_EVIDENCE_ONLY",
            "mayChangeStage1State": False,
            "mayAssignAcquisitionCategory": False,
        },
    })

expected_code_counts = {code: value["expectedCount"] for code, value in mappings.items()}
all_failure_count = sum([
    len(missing_metadata),
    len(state_mismatches),
    len(type_mismatches),
    len(label_mismatches),
    len(invalid_encoded_codes),
    len(raw_desc_presence_mismatches),
])

output = {
    "version": 1,
    "stage": "skin-page-1",
    "substage": "1-4",
    "status": "GENERATED",
    "purpose": "Freeze Stage 1 acquisition states from accepted GetPathType semantics while carrying GetPathDesc only as non-authoritative supplemental evidence.",
    "sources": {
        "canonical": str(CANONICAL.relative_to(ROOT)),
        "sourceMetadata": str(SOURCE_METADATA.relative_to(ROOT)),
        "stage13": str(STAGE13.relative_to(ROOT)),
        "policy": str(POLICY.relative_to(ROOT)),
    },
    "recordCount": len(records),
    "records": records,
}

dump(OUT, output)

checks = {
    "stage13Pass": stage13.get("status") == "PASS" and stage13.get("completion") == "SKIN_STAGE1_3_COMPLETE",
    "policyAccepted": policy.get("status") == "ACCEPTED",
    "canonicalSkinCount540": len(canonical_records) == 540,
    "outputRecordCount540": len(records) == 540,
    "missingMetadataZero": len(missing_metadata) == 0,
    "stateMismatchZero": len(state_mismatches) == 0,
    "typeMismatchZero": len(type_mismatches) == 0,
    "labelMismatchZero": len(label_mismatches) == 0,
    "invalidEncodedCodeZero": len(invalid_encoded_codes) == 0,
    "rawDescPresenceMismatchZero": len(raw_desc_presence_mismatches) == 0,
    "encodedCount364": state_counts["ENCODED"] == 364,
    "unencodedCount176": state_counts["UNENCODED"] == 176,
    "statePartition540": state_counts["ENCODED"] + state_counts["UNENCODED"] == 540,
    "type2Count197": code_counts[2] == 197,
    "type3Count1": code_counts[3] == 1,
    "type4Count166": code_counts[4] == 166,
    "encodedCodeDistributionExact": dict(code_counts) == expected_code_counts,
    "getPathDescTotal512": sum(evidence_counts.values()) == 540 and (evidence_counts["encodedWithDesc"] + evidence_counts["unencodedWithDesc"]) == 512,
    "unencodedDescEvidenceDoesNotResolveState": all(r["stage1AcquisitionState"] == "UNENCODED" for r in records if r["skinId"] in set(unencoded_with_desc_ids)),
}

status = "PASS" if all(checks.values()) and all_failure_count == 0 else "FAIL"
validation = {
    "version": 1,
    "stage": "skin-page-1",
    "substage": "1-4",
    "checkpoint": "acquisition-state-freeze",
    "status": status,
    "completion": "SKIN_STAGE1_4_COMPLETE" if status == "PASS" else "SKIN_STAGE1_4_BLOCKED",
    "sources": output["sources"],
    "output": str(OUT.relative_to(ROOT)),
    "metrics": {
        "canonicalSkinCount": len(canonical_records),
        "outputRecordCount": len(records),
        "encodedCount": state_counts["ENCODED"],
        "unencodedCount": state_counts["UNENCODED"],
        "encodedTypeCounts": {str(k): code_counts[k] for k in sorted(code_counts)},
        "getPathDescPresentCount": evidence_counts["encodedWithDesc"] + evidence_counts["unencodedWithDesc"],
        "getPathDescAbsentCount": evidence_counts["encodedWithoutDesc"] + evidence_counts["unencodedWithoutDesc"],
        "encodedWithGetPathDescCount": evidence_counts["encodedWithDesc"],
        "encodedWithoutGetPathDescCount": evidence_counts["encodedWithoutDesc"],
        "unencodedWithGetPathDescCount": evidence_counts["unencodedWithDesc"],
        "unencodedWithoutGetPathDescCount": evidence_counts["unencodedWithoutDesc"],
        "criticalFailureCount": all_failure_count,
    },
    "checks": checks,
    "failures": {
        "missingMetadataSkinIds": missing_metadata,
        "stateMismatches": state_mismatches,
        "typeMismatches": type_mismatches,
        "labelMismatches": label_mismatches,
        "invalidEncodedCodes": invalid_encoded_codes,
        "rawDescPresenceMismatchSkinIds": raw_desc_presence_mismatches,
    },
    "evidencePartitions": {
        "unencodedWithGetPathDescSkinIds": unencoded_with_desc_ids,
        "unencodedWithoutGetPathDescSkinIds": unencoded_without_desc_ids,
    },
    "rulesFrozen": [
        "GetPathType is the sole Stage 1 authority for ENCODED versus UNENCODED acquisition state.",
        "Only canonical GetPathType codes 2, 3 and 4 are admitted as ENCODED in the 540-skin population.",
        "A missing GetPathType remains UNENCODED even when GetPathDesc contains descriptive acquisition text.",
        "GetPathDesc is preserved verbatim as supplemental evidence and is not parsed into a category in Stage 1.",
        "Score, skin ID patterns, asset paths, filenames and store UI order are not acquisition authorities.",
        "Later verified enrichment must preserve the Stage 1 source state separately from any supplemental display history."
    ],
    "nextAction": "Skin 1-5: do not select future skins yet; freeze release-status fields/unknown states only after an authoritative CN/KR release metadata source is established in Skin Stage 4."
}

dump(VALIDATION, validation)

if status != "PASS":
    raise SystemExit(1)
