#!/usr/bin/env python3
import json
import os
import pathlib
import runpy

import UnityPy

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", ".")).resolve()
SCANNER = ROOT / "tools/asset-intake/diagnostics/scan-skin-stage3-2-fresh-source-v1.py"
OUTPUT = ROOT / "skin-stage3-2-container-path-shape.v1.json"
ns = runpy.run_path(str(SCANNER))


def basename(value):
    return ns["norm"](value).rsplit("/", 1)[-1]


def main():
    contract = ns["read_json"](ns["CONTRACT_PATH"])
    _, _, targets, _ = ns["build_targets"](contract)
    stems = sorted({row["discoveryBundleStem"] for row in targets})
    packages, candidates = ns["scan_package_catalog"](contract, stems)
    by_stem = {}
    for target in targets:
        by_stem.setdefault(target["discoveryBundleStem"], []).append(target)

    target_rows = []
    candidate_rows = []
    for target in targets:
        target_rows.append({
            "skinId": target["skinId"],
            "assetRole": target["assetRole"],
            "locatorKind": target["locatorKind"],
            "locatorValue": target["locatorValue"],
            "exactRuntimePath": target["exactRuntimePath"],
            "discoveryBundleStem": target["discoveryBundleStem"],
            "suffixMatches": [],
            "basenameMatches": [],
        })

    for candidate in candidates:
        raw = ns["fetch_zip_entry"](candidate["packageUrl"], candidate["entry"])
        env = UnityPy.load(raw)
        paths = [str(path).replace("\\", "/") for path in env.container.keys()]
        candidate_rows.append({
            "packagePart": candidate["packagePart"],
            "packageName": candidate["packageName"],
            "bundleBasename": candidate["bundleBasename"],
            "containerCount": len(paths),
            "sampleContainerPaths": paths[:8],
        })
        for index, target in enumerate(targets):
            if target["discoveryBundleStem"] not in candidate["matchedStems"]:
                continue
            expected = ns["norm"](target["exactRuntimePath"])
            expected_base = basename(expected)
            for container_path in paths:
                actual = ns["norm"](container_path)
                if actual == expected:
                    continue
                if actual.endswith("/" + expected):
                    target_rows[index]["suffixMatches"].append({
                        "packagePart": candidate["packagePart"],
                        "bundleBasename": candidate["bundleBasename"],
                        "containerPath": container_path,
                        "prefix": actual[:-(len(expected))].rstrip("/"),
                    })
                if basename(actual) == expected_base:
                    target_rows[index]["basenameMatches"].append({
                        "packagePart": candidate["packagePart"],
                        "bundleBasename": candidate["bundleBasename"],
                        "containerPath": container_path,
                    })

    prefix_counts = {}
    for row in target_rows:
        for match in row["suffixMatches"]:
            prefix = match["prefix"]
            prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1

    result = {
        "version": 1,
        "schemaId": "skin-stage3-2-container-path-shape/v1",
        "status": "DIAGNOSTIC_COMPLETE",
        "officialPackageCount": len(packages),
        "candidateBundleCount": len(candidates),
        "runtimePathPrefixCounts": prefix_counts,
        "targets": target_rows,
        "candidateBundles": candidate_rows,
        "guardrails": {
            "suffixMatchIsAuthority": False,
            "basenameMatchIsAuthority": False,
            "purpose": "Diagnose representation differences only. Any accepted normalization must be explicitly frozen before it can resolve a target."
        }
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": result["status"],
        "prefixCounts": prefix_counts,
        "targetsWithSuffixMatch": sum(1 for row in target_rows if row["suffixMatches"]),
        "targetsWithBasenameMatch": sum(1 for row in target_rows if row["basenameMatches"]),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
