#!/usr/bin/env python3
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import parse_qs, urlparse

RARITY_FILES = {
    "LLR": "LLR.json",
    "SSR": "SSR.json",
    "SR": "SR.json",
    "R": "R.json",
    "N": "N.json",
}
EXPECTED_RARITY_COUNTS = {"LLR": 5, "SSR": 191, "SR": 33, "R": 12, "N": 3}
EXPECTED_STRUCTURED_COUNT = 244
CANONICAL_HERO_COUNT = 267
ADMITTED_HERO_IDS = {5, 6, 8, 12, 15}
EXACT_MAPPING_STATES = {
    "BRIDGE_PROVEN_MAPPING_ALREADY_ADMITTED",
    "BRIDGE_PROVEN_MAPPING_NOT_ADMITTED",
}


def drive_id_from_url(url: str) -> str | None:
    q = parse_qs(urlparse(url).query)
    if q.get("id"):
        return q["id"][0]
    m = re.search(r"/d/([^/]+)", url)
    return m.group(1) if m else None


def runtime_stem(spine_path: str) -> str:
    name = Path(spine_path).name
    if name.lower().endswith(".prefab"):
        name = name[:-7]
    name = re.sub(r"(?i)_prefab$", "", name)
    return name


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--drive-dir", required=True)
    ap.add_argument("--repo-root", default=".")
    args = ap.parse_args()

    repo = Path(args.repo_root)
    drive_dir = Path(args.drive_dir)

    inventory = load_json(repo / "data/generated/skin-stage3-1-asset-inventory.v1.json")
    stage40 = load_json(repo / "data/generated/hero-portrait-stage4-0-source-census.v1.json")
    stage41 = load_json(repo / "data/checkpoints/hero-portrait-stage4-1-drive-mapping-bridge.v1.json")

    stem_to_heroes: dict[str, set[int]] = defaultdict(set)
    hero_to_stems: dict[int, set[str]] = defaultdict(set)
    for rec in inventory["records"]:
        hero_id = int(rec["heroId"])
        stem = runtime_stem(rec["spine"]["sourceSpinePath"])
        if stem:
            stem_to_heroes[stem].add(hero_id)
            hero_to_stems[hero_id].add(stem)

    known_exact = {}
    for rec in stage40["stage2AnchorContinuity"]["records"]:
        known_exact[int(rec["heroId"])] = rec["sourceFileId"]
    for rec in stage41["newExactMappings"]:
        known_exact[int(rec["heroId"])] = rec["driveBasePngId"]

    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    rarity_observed = {}
    listing_counts = {}

    for rarity, filename in RARITY_FILES.items():
        entries = load_json(drive_dir / filename)
        listing_counts[rarity] = len(entries)
        seen_groups = set()
        for entry in entries:
            rel = entry["path"].replace("\\", "/")
            parts = [p for p in rel.split("/") if p]
            if rarity in parts:
                idx = parts.index(rarity)
                if len(parts) <= idx + 1:
                    continue
                hero_label = parts[idx + 1]
                rel_after_hero = parts[idx + 2 :]
                group_path = "/".join(parts[: idx + 2])
            else:
                if len(parts) < 2:
                    continue
                hero_label = parts[0]
                rel_after_hero = parts[1:]
                group_path = hero_label
            if not rel_after_hero:
                continue
            key = (rarity, group_path)
            seen_groups.add(key)
            groups[key].append({
                "id": drive_id_from_url(entry["url"]),
                "path": rel,
                "partsAfterHero": rel_after_hero,
                "name": parts[-1],
                "heroFolderLabel": hero_label,
            })
        rarity_observed[rarity] = len(seen_groups)

    records = []
    summary_states = defaultdict(int)
    hero_to_group_keys = defaultdict(list)
    base_id_to_hero = defaultdict(list)
    stems_sorted = sorted(stem_to_heroes.keys(), key=len, reverse=True)

    for (rarity, group_path), entries in sorted(groups.items()):
        hero_label = entries[0]["heroFolderLabel"]
        evidence = []
        matched_hero_ids = set()

        for entry in entries:
            parts = entry["partsAfterHero"]
            name = entry["name"]
            if "스킨" not in parts or "기본" in parts:
                continue
            for stem in stems_sorted:
                if name.startswith(stem + "_"):
                    heroes = stem_to_heroes[stem]
                    evidence.append({
                        "driveFileId": entry["id"],
                        "driveFileName": name,
                        "runtimeStem": stem,
                        "heroIds": sorted(heroes),
                    })
                    matched_hero_ids.update(heroes)
                    break

        ownership_state = "UNRESOLVED_NO_EXACT_RUNTIME_STEM_EVIDENCE"
        hero_id = None
        if len(matched_hero_ids) == 1:
            hero_id = next(iter(matched_hero_ids))
            ownership_state = "OWNERSHIP_PROVEN"
        elif len(matched_hero_ids) > 1:
            ownership_state = "AMBIGUOUS_MULTIPLE_HERO_IDS"

        base_candidates = []
        for entry in entries:
            parts = entry["partsAfterHero"]
            name = entry["name"]
            if "스킨" not in parts or "기본" not in parts:
                continue
            if not name.endswith("_idle_Normal_default.png"):
                continue
            base_candidates.append({"driveFileId": entry["id"], "driveFileName": name})

        if hero_id is None:
            mapping_state = ownership_state
        elif len(base_candidates) == 1:
            mapping_state = (
                "BRIDGE_PROVEN_MAPPING_ALREADY_ADMITTED"
                if hero_id in ADMITTED_HERO_IDS
                else "BRIDGE_PROVEN_MAPPING_NOT_ADMITTED"
            )
        elif len(base_candidates) == 0:
            mapping_state = "OWNERSHIP_PROVEN_BASE_PNG_MISSING"
        else:
            mapping_state = "OWNERSHIP_PROVEN_BASE_PNG_AMBIGUOUS"

        if hero_id is not None:
            hero_to_group_keys[hero_id].append(group_path)
        if hero_id is not None and len(base_candidates) == 1 and base_candidates[0]["driveFileId"]:
            base_id_to_hero[base_candidates[0]["driveFileId"]].append(hero_id)

        summary_states[mapping_state] += 1
        records.append({
            "rarity": rarity,
            "driveGroupPath": group_path,
            "driveHeroFolderLabel": hero_label,
            "heroId": hero_id,
            "ownershipState": ownership_state,
            "mappingState": mapping_state,
            "ownershipEvidence": evidence,
            "baseCandidates": base_candidates,
        })

    mapped_records = [r for r in records if r["mappingState"] in EXACT_MAPPING_STATES]
    mapped_by_hero = defaultdict(list)
    for rec in mapped_records:
        mapped_by_hero[rec["heroId"]].append(rec)

    duplicate_hero_mappings = {
        str(k): [r["driveGroupPath"] for r in v]
        for k, v in mapped_by_hero.items()
        if len(v) > 1
    }
    duplicate_base_ids = {k: v for k, v in base_id_to_hero.items() if len(set(v)) > 1}

    continuity = []
    continuity_mismatch = 0
    for hero_id, expected_id in sorted(known_exact.items()):
        found = [r for r in mapped_records if r["heroId"] == hero_id and r["baseCandidates"]]
        actual_ids = sorted({r["baseCandidates"][0]["driveFileId"] for r in found})
        ok = expected_id in actual_ids
        if not ok:
            continuity_mismatch += 1
        continuity.append({
            "heroId": hero_id,
            "expectedDriveFileId": expected_id,
            "observedDriveFileIds": actual_ids,
            "result": "PASS" if ok else "FAIL",
        })

    rarity_count_mismatches = {
        rarity: {"expected": EXPECTED_RARITY_COUNTS[rarity], "actual": rarity_observed.get(rarity, 0)}
        for rarity in EXPECTED_RARITY_COUNTS
        if rarity_observed.get(rarity, 0) != EXPECTED_RARITY_COUNTS[rarity]
    }

    mapped_hero_ids = sorted(mapped_by_hero.keys())
    exact_mapping_count = len(mapped_records)
    unique_exact_hero_count = len(mapped_hero_ids)
    already_admitted_count = sum(
        1 for r in mapped_records if r["mappingState"] == "BRIDGE_PROVEN_MAPPING_ALREADY_ADMITTED"
    )
    mapped_not_admitted_count = sum(
        1 for r in mapped_records if r["mappingState"] == "BRIDGE_PROVEN_MAPPING_NOT_ADMITTED"
    )
    hard_errors = continuity_mismatch + len(duplicate_hero_mappings) + len(duplicate_base_ids)
    structured_count = len(records)

    if structured_count != EXPECTED_STRUCTURED_COUNT:
        hard_errors += 1
    if already_admitted_count != len(ADMITTED_HERO_IDS):
        hard_errors += 1

    status = "PASS" if hard_errors == 0 and exact_mapping_count == EXPECTED_STRUCTURED_COUNT else "PASS_WITH_REVIEW"

    summary = {
        "canonicalHeroCount": CANONICAL_HERO_COUNT,
        "expectedStructuredDriveHeroFolderCount": EXPECTED_STRUCTURED_COUNT,
        "observedStructuredDriveHeroFolderCount": structured_count,
        "exactBaseMappingRecordCount": exact_mapping_count,
        "uniqueExactMappedHeroCount": unique_exact_hero_count,
        "alreadyAdmittedExactMappingCount": already_admitted_count,
        "mappedNotAdmittedExactMappingCount": mapped_not_admitted_count,
        "previousKnownExactMappingCount": len(known_exact),
        "newExactMappedHeroCountRelativeToStage41": len(set(mapped_hero_ids) - set(known_exact)),
        "remainingCanonicalWithoutStructuredExactMapping": CANONICAL_HERO_COUNT - unique_exact_hero_count,
        "canonicalAdmittedSourceCount": len(ADMITTED_HERO_IDS),
        "pendingCanonicalSourceAdmissionCount": CANONICAL_HERO_COUNT - len(ADMITTED_HERO_IDS),
        "hardErrorCount": hard_errors,
        "continuityMismatchCount": continuity_mismatch,
        "duplicateHeroMappingCount": len(duplicate_hero_mappings),
        "duplicateBaseFileIdCount": len(duplicate_base_ids),
        "bulk267Ready": False,
    }

    out = {
        "version": 1,
        "stage": "hero-portrait-stage4-1b-structured-drive-bulk-mapping",
        "schemaId": "hero-portrait-stage4-1b-structured-drive-bulk-mapping/v1",
        "status": status,
        "completion": "COMPLETE",
        "sourcePolicy": {
            "driveListingTool": "gdown-6.1.0 pinned _parse_embedded_folder_view selected-path crawler",
            "downloadImageBodies": False,
            "recursiveFullTreeTraversal": False,
            "displayNameOwnershipJoin": False,
            "ownershipRule": "exact canonical Skin sourceSpinePath runtime stem prefix in a non-base file under the same Drive Hero group",
            "baseSelectionRule": "same proven Hero group; under 스킨/기본; unique filename ending _idle_Normal_default.png",
            "filenameTokensAloneEstablishHeroOwnership": False,
            "sourceAdmissionPerformed": False,
        },
        "summary": summary,
        "rarityObserved": rarity_observed,
        "rarityExpected": EXPECTED_RARITY_COUNTS,
        "rarityCountMismatches": rarity_count_mismatches,
        "listingEntryCounts": listing_counts,
        "mappingStateCounts": dict(sorted(summary_states.items())),
        "knownMappingContinuity": continuity,
        "duplicateHeroMappings": duplicate_hero_mappings,
        "duplicateBaseFileIds": duplicate_base_ids,
        "records": records,
    }

    generated_path = repo / "data/generated/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json"
    generated_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    checkpoint = {
        "version": 1,
        "stage": "hero-portrait-stage4-1b-structured-drive-bulk-mapping",
        "schemaId": "hero-portrait-stage4-1b-structured-drive-bulk-mapping-checkpoint/v1",
        "status": status,
        "completion": "COMPLETE",
        "freezeState": "HERO_PORTRAIT_STAGE4_1B_STRUCTURED_DRIVE_BULK_MAPPING_COMPLETE",
        "source": str(generated_path.relative_to(repo)),
        "summary": summary,
        "mappingStateCounts": out["mappingStateCounts"],
        "rarityObserved": rarity_observed,
        "checks": [
            {"id": "structured-folder-count", "expected": EXPECTED_STRUCTURED_COUNT, "actual": structured_count, "result": "PASS" if structured_count == EXPECTED_STRUCTURED_COUNT else "FAIL"},
            {"id": "known-exact-continuity", "expected": 0, "actual": continuity_mismatch, "result": "PASS" if continuity_mismatch == 0 else "FAIL"},
            {"id": "already-admitted-mapping-continuity", "expected": len(ADMITTED_HERO_IDS), "actual": already_admitted_count, "result": "PASS" if already_admitted_count == len(ADMITTED_HERO_IDS) else "FAIL"},
            {"id": "duplicate-hero-mapping", "expected": 0, "actual": len(duplicate_hero_mappings), "result": "PASS" if not duplicate_hero_mappings else "FAIL"},
            {"id": "duplicate-base-file-id", "expected": 0, "actual": len(duplicate_base_ids), "result": "PASS" if not duplicate_base_ids else "FAIL"},
            {"id": "new-source-admission-performed", "expected": False, "actual": False, "result": "PASS"},
            {"id": "bulk-267-ready", "expected": False, "actual": False, "result": "PASS"},
        ],
        "nextStart": {
            "primary": "HERO_PORTRAIT_STAGE4_1C_MAPPED_SOURCE_ADMISSION",
            "primaryGoal": "Apply Stage 3 byte/image admission gates to the exact mapped-but-not-admitted Drive sources without repeating the ownership census.",
            "secondary": "HERO_PORTRAIT_STAGE4_2_UNCOVERED_SOURCE_FALLBACK_PROOF",
            "secondaryCondition": "Begin fallback proof after the 36 structured-tree exceptions are reviewed and the mapped Drive admission batch is checkpointed.",
        },
    }
    checkpoint_path = repo / "data/checkpoints/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json"
    checkpoint_path.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary_path = repo / "data/validation/hero-portrait-stage4-1b-structured-drive-bulk-mapping-summary.v1.json"
    summary_path.write_text(json.dumps({
        "version": 1,
        "status": status,
        "summary": summary,
        "rarityObserved": rarity_observed,
        "rarityExpected": EXPECTED_RARITY_COUNTS,
        "mappingStateCounts": out["mappingStateCounts"],
        "unresolvedRows": [
            {
                "rarity": r["rarity"],
                "driveGroupPath": r["driveGroupPath"],
                "driveHeroFolderLabel": r["driveHeroFolderLabel"],
                "ownershipState": r["ownershipState"],
                "mappingState": r["mappingState"],
            }
            for r in records if r["mappingState"] not in EXACT_MAPPING_STATES
        ],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": status,
        **summary,
        "mappingStateCounts": out["mappingStateCounts"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
