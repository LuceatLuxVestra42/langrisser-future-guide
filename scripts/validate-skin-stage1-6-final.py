import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(rel):
    with open(ROOT / rel, "r", encoding="utf-8") as f:
        return json.load(f)


def add_check(checks, name, passed, detail=None):
    checks.append({"name": name, "pass": bool(passed), "detail": detail})


def main():
    contract = load("data/contracts/skin-stage1-input-contract.v1.json")
    s11 = load("data/validation/skin-stage1-1-final.v1.json")
    s12 = load("data/validation/skin-stage1-2-parity.v1.json")
    s13 = load("data/validation/skin-stage1-3-final.v1.json")
    s14 = load("data/validation/skin-stage1-4-final.v1.json")
    s15 = load("data/validation/skin-stage1-5-final.v1.json")
    canonical = load("data/generated/skin-stage1-canonical.v1.json")
    metadata = load("data/generated/skin-stage1-source-metadata.v1.json")
    acquisition = load("data/generated/skin-stage1-acquisition-state.v1.json")
    acquisition_policy = load("data/contracts/skin-stage1-acquisition-policy.v1.json")
    release_policy = load("data/contracts/skin-stage1-release-deferral-policy.v1.json")

    canonical_records = canonical.get("records", [])
    metadata_records = metadata.get("records", [])
    acquisition_records = acquisition.get("records", [])

    canonical_ids = [r.get("skinId") for r in canonical_records]
    metadata_ids = [r.get("skinId") for r in metadata_records]
    acquisition_ids = [r.get("skinId") for r in acquisition_records]

    encoded = [r for r in acquisition_records if r.get("state") == "ENCODED" or r.get("stage1AcquisitionState") == "ENCODED"]
    unencoded = [r for r in acquisition_records if r.get("state") == "UNENCODED" or r.get("stage1AcquisitionState") == "UNENCODED"]

    type_counts = {"2": 0, "3": 0, "4": 0}
    for r in acquisition_records:
        t = r.get("typeCode")
        if t is None and isinstance(r.get("encoded"), dict):
            t = r["encoded"].get("typeCode")
        if t in (2, 3, 4):
            type_counts[str(t)] += 1

    checks = []
    add_check(checks, "input contract accepted", contract.get("status") == "ACCEPTED", contract.get("status"))
    for label, gate, completion in [
        ("1-1", s11, "SKIN_STAGE1_1_COMPLETE"),
        ("1-2", s12, "SKIN_STAGE1_2_COMPLETE"),
        ("1-3", s13, "SKIN_STAGE1_3_COMPLETE"),
        ("1-4", s14, "SKIN_STAGE1_4_COMPLETE"),
        ("1-5", s15, "SKIN_STAGE1_5_COMPLETE"),
    ]:
        add_check(checks, f"{label} PASS", gate.get("status") == "PASS", gate.get("status"))
        add_check(checks, f"{label} completion", gate.get("completion") == completion, gate.get("completion"))

    add_check(checks, "canonical count 540", len(canonical_records) == 540, len(canonical_records))
    add_check(checks, "canonical distinct ids 540", len(set(canonical_ids)) == 540, len(set(canonical_ids)))
    add_check(checks, "metadata count 540", len(metadata_records) == 540, len(metadata_records))
    add_check(checks, "acquisition count 540", len(acquisition_records) == 540, len(acquisition_records))
    add_check(checks, "metadata ids exact canonical", set(metadata_ids) == set(canonical_ids), None)
    add_check(checks, "acquisition ids exact canonical", set(acquisition_ids) == set(canonical_ids), None)

    add_check(checks, "1-2 owner mismatch zero", s12.get("metrics", {}).get("ownerMismatchCount") == 0, s12.get("metrics", {}).get("ownerMismatchCount"))
    add_check(checks, "1-2 source order mismatch zero", s12.get("metrics", {}).get("sourceOrderMismatchCount") == 0, s12.get("metrics", {}).get("sourceOrderMismatchCount"))
    add_check(checks, "1-2 static artwork mismatch zero", s12.get("metrics", {}).get("staticArtworkMismatchCount") == 0, s12.get("metrics", {}).get("staticArtworkMismatchCount"))
    add_check(checks, "1-2 animated resource mismatch zero", s12.get("metrics", {}).get("animatedResourceMismatchCount") == 0, s12.get("metrics", {}).get("animatedResourceMismatchCount"))
    add_check(checks, "1-2 acquisition mismatch zero", s12.get("metrics", {}).get("acquisitionMismatchCount") == 0, s12.get("metrics", {}).get("acquisitionMismatchCount"))

    add_check(checks, "1-3 hero skin info resolved 540", s13.get("metrics", {}).get("heroSkinInfoResolvedCount") == 540, s13.get("metrics", {}).get("heroSkinInfoResolvedCount"))
    add_check(checks, "1-3 image resource resolved 540", s13.get("metrics", {}).get("charImageSkinResourceResolvedCount") == 540, s13.get("metrics", {}).get("charImageSkinResourceResolvedCount"))
    add_check(checks, "1-3 critical failures zero", s13.get("metrics", {}).get("criticalFailureCount") == 0, s13.get("metrics", {}).get("criticalFailureCount"))

    add_check(checks, "acquisition policy accepted", acquisition_policy.get("status") == "ACCEPTED", acquisition_policy.get("status"))
    add_check(checks, "encoded 364", len(encoded) == 364, len(encoded))
    add_check(checks, "unencoded 176", len(unencoded) == 176, len(unencoded))
    add_check(checks, "acquisition partition 540", len(encoded) + len(unencoded) == 540, len(encoded) + len(unencoded))
    add_check(checks, "type 2 count 197", type_counts["2"] == 197, type_counts["2"])
    add_check(checks, "type 3 count 1", type_counts["3"] == 1, type_counts["3"])
    add_check(checks, "type 4 count 166", type_counts["4"] == 166, type_counts["4"])
    add_check(checks, "1-4 critical failures zero", s14.get("metrics", {}).get("criticalFailureCount") == 0, s14.get("metrics", {}).get("criticalFailureCount"))

    add_check(checks, "release policy accepted", release_policy.get("status") == "ACCEPTED", release_policy.get("status"))
    add_check(checks, "release decision deferred", release_policy.get("decision") == "DEFERRED_PENDING_STAGE4_AUTHORITY", release_policy.get("decision"))
    add_check(checks, "1-5 prohibited release fields zero", s15.get("metrics", {}).get("prohibitedReleaseFieldOccurrenceCount") == 0, s15.get("metrics", {}).get("prohibitedReleaseFieldOccurrenceCount"))
    add_check(checks, "1-5 future subset zero", s15.get("metrics", {}).get("futureSubsetFileCount") == 0, s15.get("metrics", {}).get("futureSubsetFileCount"))
    add_check(checks, "1-5 release classified zero", s15.get("metrics", {}).get("releaseClassifiedSkinCount") == 0, s15.get("metrics", {}).get("releaseClassifiedSkinCount"))
    add_check(checks, "1-5 display target zero", s15.get("metrics", {}).get("displayTargetAssignedSkinCount") == 0, s15.get("metrics", {}).get("displayTargetAssignedSkinCount"))

    failures = [c for c in checks if not c["pass"]]
    status = "PASS" if not failures else "FAIL"
    completion = "SKIN_STAGE1_COMPLETE" if not failures else "SKIN_STAGE1_INCOMPLETE"

    output = {
        "version": 1,
        "stage": "skin-page-1",
        "substage": "1-6",
        "checkpoint": "stage1-final-gate",
        "status": status,
        "completion": completion,
        "purpose": "Final cross-check closing Skin Stage 1 across the accepted input contract, 540-record canonical population, upstream parity, source metadata carry-forward, acquisition-state freeze and release-selection deferral.",
        "sources": {
            "inputContract": "data/contracts/skin-stage1-input-contract.v1.json",
            "canonical": "data/generated/skin-stage1-canonical.v1.json",
            "sourceMetadata": "data/generated/skin-stage1-source-metadata.v1.json",
            "acquisitionState": "data/generated/skin-stage1-acquisition-state.v1.json",
            "acquisitionPolicy": "data/contracts/skin-stage1-acquisition-policy.v1.json",
            "releaseDeferralPolicy": "data/contracts/skin-stage1-release-deferral-policy.v1.json",
            "gates": [
                "data/validation/skin-stage1-1-final.v1.json",
                "data/validation/skin-stage1-2-parity.v1.json",
                "data/validation/skin-stage1-3-final.v1.json",
                "data/validation/skin-stage1-4-final.v1.json",
                "data/validation/skin-stage1-5-final.v1.json"
            ]
        },
        "summary": {
            "checkCount": len(checks),
            "passedCheckCount": len(checks) - len(failures),
            "failedCheckCount": len(failures),
            "canonicalSkinCount": len(canonical_records),
            "distinctCanonicalSkinIdCount": len(set(canonical_ids)),
            "sourceMetadataRecordCount": len(metadata_records),
            "acquisitionRecordCount": len(acquisition_records),
            "encodedAcquisitionCount": len(encoded),
            "unencodedAcquisitionCount": len(unencoded),
            "encodedTypeCounts": type_counts,
            "releaseClassifiedSkinCount": s15.get("metrics", {}).get("releaseClassifiedSkinCount"),
            "displayTargetAssignedSkinCount": s15.get("metrics", {}).get("displayTargetAssignedSkinCount"),
            "hardBlockingIssueCount": len(failures)
        },
        "stageResults": {
            "1-0": {"status": contract.get("status")},
            "1-1": {"status": s11.get("status"), "completion": s11.get("completion")},
            "1-2": {"status": s12.get("status"), "completion": s12.get("completion")},
            "1-3": {"status": s13.get("status"), "completion": s13.get("completion")},
            "1-4": {"status": s14.get("status"), "completion": s14.get("completion")},
            "1-5": {"status": s15.get("status"), "completion": s15.get("completion")}
        },
        "checks": checks,
        "failures": failures,
        "frozenStage1Outputs": {
            "canonicalPopulation": "540 regular Hero skins, one record per accepted skinId",
            "ownershipAndOrder": "Exact parity with accepted Hero Stage 5-5 membership and source order",
            "assetLocators": "Static image and Spine source locators preserved; web export deferred to Skin Stage 3",
            "sourceMetadata": "Explicit HeroSkinInfo/resource metadata carried forward without semantic invention",
            "acquisition": "GetPathType authority frozen as ENCODED 364 / UNENCODED 176; raw GetPathDesc is supplemental evidence only",
            "releaseSelection": "No CN/KR/future classification and no displayTarget in Stage 1; authority deferred to Skin Stage 4"
        },
        "outOfScopeAfterClosure": [
            "Asset extraction/export/web-path mapping (Skin Stage 3)",
            "CN/KR release evidence and deterministic matching (Skin Stage 4)",
            "Korean skin-name localization (Skin Stage 4)",
            "Future-page subset generation from validated KR_FUTURE status (Skin Stage 5)",
            "Hero consumer regeneration/parity (Skin Stage 6)"
        ],
        "nextAction": "Skin Stage 1 is closed. Proceed to Skin Stage 2 relation freeze/parity or Skin Stage 3 asset work without reopening the 540-record population unless an upstream authoritative correction is explicitly introduced."
    }

    out_path = ROOT / "data/validation/skin-stage1-6-final.v1.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(json.dumps(output["summary"], ensure_ascii=False, indent=2))
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
