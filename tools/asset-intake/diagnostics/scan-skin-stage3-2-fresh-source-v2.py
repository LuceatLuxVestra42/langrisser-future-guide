#!/usr/bin/env python3
import json
import os
import pathlib
import runpy

import UnityPy

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
V1 = ROOT / "tools/asset-intake/diagnostics/scan-skin-stage3-2-fresh-source-v1.py"
OUTPUT = ROOT / "skin-stage3-2-fresh-source-inventory.v1.json"
ns = runpy.run_path(str(V1))


def runtime_relative(container_path, root_prefix):
    actual = ns["norm"](container_path)
    prefix = ns["norm"](root_prefix)
    if actual == prefix:
        return ""
    required = prefix + "/"
    if not actual.startswith(required):
        return None
    return actual[len(required):]


def inspect_candidates(contract, candidates, targets):
    root_prefix = contract["resolutionPolicy"]["unityContainerRootPrefix"]
    by_stem = {}
    target_index = {}
    for index, target in enumerate(targets):
        by_stem.setdefault(target["discoveryBundleStem"], []).append((index, target))
        target_index[index] = target

    hits_by_target = {index: [] for index in range(len(targets))}
    bundle_reports = []
    cache = {}
    for candidate in candidates:
        key = (candidate["packagePart"], candidate["entry"]["name"])
        if key not in cache:
            raw = ns["fetch_zip_entry"](candidate["packageUrl"], candidate["entry"])
            env = UnityPy.load(raw)
            container = [(path, obj) for path, obj in env.container.items()]
            cache[key] = (raw, container)
        raw, container = cache[key]
        report = {
            "packagePart": candidate["packagePart"],
            "packageName": candidate["packageName"],
            "bundleEntry": candidate["entry"]["name"],
            "bundleBasename": candidate["bundleBasename"],
            "bundleBytes": len(raw),
            "bundleSha256": ns["sha256"](raw),
            "containerCount": len(container),
            "matchedStems": candidate["matchedStems"],
            "exactHitCount": 0,
        }
        for stem in candidate["matchedStems"]:
            for index, target in by_stem[stem]:
                expected = ns["norm"](target["exactRuntimePath"])
                for container_path, obj in container:
                    relative = runtime_relative(container_path, root_prefix)
                    if relative != expected:
                        continue
                    hit = {
                        "packagePart": candidate["packagePart"],
                        "packageName": candidate["packageName"],
                        "bundleEntry": candidate["entry"]["name"],
                        "bundleBasename": candidate["bundleBasename"],
                        "bundleBytes": len(raw),
                        "bundleSha256": ns["sha256"](raw),
                        "containerPath": str(container_path).replace("\\", "/"),
                        "normalizedRuntimePath": relative,
                        "unityContainerRootPrefix": root_prefix,
                        **ns["object_meta"](obj),
                    }
                    hits_by_target[index].append(hit)
                    report["exactHitCount"] += 1
        bundle_reports.append(report)

    classified = []
    for index, target in target_index.items():
        hits = hits_by_target[index]
        if len(hits) == 0:
            status = "NO_EXACT_HIT"
        elif len(hits) == 1:
            status = "EXACT_HIT_SINGLE_SOURCE"
        else:
            content_keys = {
                (hit.get("rawObjectBytes"), hit.get("rawObjectSha256"))
                for hit in hits
                if hit.get("rawObjectSha256")
            }
            status = (
                "EXACT_HIT_MULTIPLE_EQUIVALENT_OBJECTS"
                if len(content_keys) == 1 and content_keys
                else "EXACT_HIT_MULTIPLE_SOURCES"
            )
        classified.append({**target, "status": status, "exactHitCount": len(hits), "hits": hits})
    return classified, bundle_reports


def main():
    contract = ns["read_json"](ns["CONTRACT_PATH"])
    readiness, model_map, targets, model_blob = ns["build_targets"](contract)
    stems = sorted({row["discoveryBundleStem"] for row in targets})
    packages, candidates = ns["scan_package_catalog"](contract, stems)
    classified, bundle_reports = inspect_candidates(contract, candidates, targets)

    status_counts = {}
    role_counts = {}
    for row in classified:
        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
        role_counts.setdefault(row["assetRole"], {"targets": 0, "withExactHit": 0})
        role_counts[row["assetRole"]]["targets"] += 1
        if row["exactHitCount"] > 0:
            role_counts[row["assetRole"]]["withExactHit"] += 1

    all_have_hit = all(row["exactHitCount"] > 0 for row in classified)
    unresolved_multi = [
        row for row in classified
        if row["exactHitCount"] > 1 and row["status"] != "EXACT_HIT_MULTIPLE_EQUIVALENT_OBJECTS"
    ]
    blockers = []
    if not all_have_hit:
        blockers.append("ONE_OR_MORE_FROZEN_LOCATORS_HAVE_NO_EXACT_OFFICIAL_INSTALLER_HIT")
    if unresolved_multi:
        blockers.append("ONE_OR_MORE_FROZEN_LOCATORS_HAVE_MULTIPLE_NON_EQUIVALENT_EXACT_SOURCES")

    result = {
        "version": 1,
        "schemaId": "skin-stage3-2-fresh-source-inventory/v1",
        "status": "PASS_FRESH_SOURCE_INVENTORY" if not blockers else "PASS_FRESH_SOURCE_INVENTORY_WITH_BLOCKERS",
        "completion": "FRESH_OFFICIAL_INSTALLER_EXACT_PATH_INVENTORY_COMPLETE",
        "sourceContract": str(ns["CONTRACT_PATH"].relative_to(ROOT)).replace("\\", "/"),
        "currentAuthority": {
            "readinessStatus": readiness["status"],
            "representativeSkinIds": contract["currentAuthority"]["representativeSkinIds"],
            "locatorCount": len(targets),
            "projectStatusPromoted": False,
        },
        "freshSource": {
            "installVersion": contract["freshSource"]["installVersion"],
            "base": contract["freshSource"]["base"],
            "officialPackageCount": len(packages),
            "lastExistingPackagePart": max(row["part"] for row in packages),
            "candidateBundleEntryCount": len(candidates),
            "candidateBundleUniqueCount": len({(row["packagePart"], row["entry"]["name"]) for row in candidates}),
            "discoveryBundleStems": stems,
            "unityContainerRootPrefix": contract["resolutionPolicy"]["unityContainerRootPrefix"],
        },
        "modelResourceSource": {
            "path": contract["modelResourceSource"]["path"],
            "blobSha": model_blob,
            "selectedIdCount": len(model_map),
            "selected": [{"id": key, "model": model_map[key]} for key in sorted(model_map)],
        },
        "coverage": {
            "locatorCount": len(classified),
            "locatorsWithExactHit": sum(1 for row in classified if row["exactHitCount"] > 0),
            "allLocatorsHaveExactHit": all_have_hit,
            "statusCounts": status_counts,
            "roleCounts": role_counts,
        },
        "targets": classified,
        "candidateBundles": bundle_reports,
        "packageSummary": packages,
        "blockers": blockers,
        "boundaries": {
            "historicalCompletionEvidenceImported": False,
            "legacyDriveUsedAsAuthority": False,
            "nameJoin": False,
            "idArithmetic": False,
            "stage31Recomputed": False,
            "semanticMutationCount": 0,
            "projectStatusMutationCount": 0,
            "statusSourceMutationCount": 0,
        },
        "nextStart": "Selectively materialize exact-hit official objects into a reviewable extraction root and feed them into the installed Skin Stage 3-2 Asset Intake runner. Multiple-source rows, if any, must be resolved by concrete content/provenance evidence, never by begin/current naming preference.",
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "packages": result["freshSource"]["officialPackageCount"],
        "candidateBundles": result["freshSource"]["candidateBundleEntryCount"],
        "locatorCount": result["coverage"]["locatorCount"],
        "withExactHit": result["coverage"]["locatorsWithExactHit"],
        "statusCounts": status_counts,
        "blockers": blockers,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
