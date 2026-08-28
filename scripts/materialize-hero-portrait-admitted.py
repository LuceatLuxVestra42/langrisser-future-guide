#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def sha256_bytes(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Materialize only explicitly admitted Hero portrait PNG sources."
    )
    parser.add_argument("--staging", required=True, type=Path)
    parser.add_argument(
        "--admission-state",
        type=Path,
        default=Path("data/generated/hero-portrait-stage3-admission-state.v1.json"),
    )
    parser.add_argument(
        "--target-root",
        type=Path,
        default=Path("public/images/heroes/cards"),
    )
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args()

    admission = json.loads(args.admission_state.read_text(encoding="utf-8"))
    records = admission.get("provenRecords", [])
    args.target_root.mkdir(parents=True, exist_ok=True)

    report_records = []
    hard_errors = []

    for record in records:
        hero_id = int(record["heroId"])
        source_name = record["sourceFileName"]
        expected_size = int(record["byteLength"])
        expected_sha = record["sha256"]
        source = args.staging / source_name
        target = args.target_root / f"{hero_id}.png"

        if not source.is_file():
            hard_errors.append(f"heroId={hero_id}: missing staging source {source}")
            continue

        source_bytes = source.read_bytes()
        actual_size = len(source_bytes)
        actual_sha = hashlib.sha256(source_bytes).hexdigest()
        signature_ok = source_bytes[:8] == PNG_SIGNATURE

        if actual_size != expected_size:
            hard_errors.append(
                f"heroId={hero_id}: byteLength mismatch expected={expected_size} actual={actual_size}"
            )
            continue
        if actual_sha != expected_sha:
            hard_errors.append(
                f"heroId={hero_id}: sha256 mismatch expected={expected_sha} actual={actual_sha}"
            )
            continue
        if not signature_ok:
            hard_errors.append(f"heroId={hero_id}: invalid PNG signature")
            continue

        shutil.copyfile(source, target)
        target_sha = sha256_bytes(target)
        if target_sha != expected_sha:
            hard_errors.append(
                f"heroId={hero_id}: post-copy sha256 mismatch expected={expected_sha} actual={target_sha}"
            )
            target.unlink(missing_ok=True)
            continue

        report_records.append(
            {
                "heroId": hero_id,
                "sourceFileName": source_name,
                "targetPath": str(target).replace("\\", "/"),
                "byteLength": actual_size,
                "sha256": actual_sha,
                "result": "PASS",
            }
        )

    report = {
        "version": 1,
        "mode": "EXPLICIT_ADMITTED_SOURCE_ONLY",
        "requestedRecordCount": len(records),
        "materializedCount": len(report_records),
        "hardErrorCount": len(hard_errors),
        "status": "PASS" if not hard_errors and len(report_records) == len(records) else "FAIL",
        "records": report_records,
        "hardErrors": hard_errors,
    }

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))

    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
