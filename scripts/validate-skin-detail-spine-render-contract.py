import hashlib
import importlib.metadata
import json
import pathlib
import platform
import subprocess
import sys

from PIL import Image


ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "data/contracts/skin-detail-spine-render-contract.v1.json"
SUMMARY_PATH = ROOT / "skin-detail-spine-stage2-render-summary.json"
ARTIFACT_ROOT = ROOT / "skin-detail-spine-stage2-artifacts"
OUTPUT_PATH = ROOT / "skin-detail-spine-stage2-contract-validation.json"


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def git_blob_sha(path):
    return subprocess.check_output(
        ["git", "hash-object", str(path)], cwd=ROOT, text=True
    ).strip()


def one_file(directory, pattern):
    rows = sorted(directory.glob(pattern))
    if len(rows) != 1:
        raise AssertionError(f"{directory}: expected exactly one {pattern}, got {len(rows)}")
    return rows[0]


def package_version(name):
    return importlib.metadata.version(name)


def main():
    contract = json.loads(CONTRACT_PATH.read_text("utf-8"))
    summary = json.loads(SUMMARY_PATH.read_text("utf-8"))
    failures = []
    checks = []

    def check(label, actual, expected):
        ok = actual == expected
        checks.append({"label": label, "ok": ok, "actual": actual, "expected": expected})
        if not ok:
            failures.append(label)

    check("summary.schemaVersion", summary.get("schemaVersion"), 2)
    check("summary.runtimeSourceCommit", summary.get("runtimeSourceCommit"), contract["runtime"]["spineRuntimeCommit"])
    check("summary.textAssetExtraction", summary.get("textAssetExtraction"), contract["sourceRules"]["textAssetExtraction"])
    check("python.version", platform.python_version(), contract["runtime"]["python"])
    for package, expected in contract["runtime"]["pythonPackages"].items():
        check(f"pythonPackage.{package}", package_version(package), expected)

    producer = contract["producer"]
    producer_fields = [
        ("baseProbePath", "baseProbeGitBlobSha"),
        ("rawTextAssetWrapperPath", "rawTextAssetWrapperGitBlobSha"),
        ("textureResolverPath", "textureResolverGitBlobSha"),
        ("geometryExporterPath", "geometryExporterGitBlobSha"),
        ("cpuRendererPath", "cpuRendererGitBlobSha"),
    ]
    for path_field, sha_field in producer_fields:
        path = ROOT / producer[path_field]
        check(f"producer.{path_field}.gitBlobSha", git_blob_sha(path), producer[sha_field])

    accepted_rows = {
        str(row["skinId"]): row
        for row in summary.get("records", [])
        if row.get("render") == "render-idle0.png"
    }
    check(
        "representative.skinIds",
        sorted(int(x) for x in accepted_rows),
        sorted(contract["representativeRegression"]["requiredSkinIds"]),
    )

    for sid, expected in contract["representativeRegression"]["expected"].items():
        directory = ARTIFACT_ROOT / sid
        row = accepted_rows.get(sid)
        if row is None:
            failures.append(f"skin.{sid}.summaryRow")
            continue

        skel = one_file(directory, "*.skel.bin")
        atlas = one_file(directory, "*.atlas.bin")
        texture = one_file(directory, "atlas-page-texture2d-*.png")
        render = directory / "render-idle0.png"

        check(f"skin.{sid}.skelSha256", sha256_file(skel), expected["skelSha256"])
        check(f"skin.{sid}.atlasSha256", sha256_file(atlas), expected["atlasSha256"])
        check(f"skin.{sid}.texturePngSha256", sha256_file(texture), expected["texturePngSha256"])
        check(f"skin.{sid}.canvas", row.get("size"), expected["canvas"])
        check(f"skin.{sid}.alphaBounds", row.get("alphaBounds"), expected["alphaBounds"])
        check(f"skin.{sid}.drawItemCount", row.get("drawItemCount"), expected["drawItemCount"])
        check(f"skin.{sid}.attachmentTypeCounts", row.get("attachmentTypeCounts"), expected["attachmentTypeCounts"])
        check(f"skin.{sid}.blendModeCounts", row.get("blendModeCounts"), expected["blendModeCounts"])
        check(f"skin.{sid}.skeletonVersion", row.get("skeletonVersion"), contract["runtime"]["expectedSkeletonVersion"])
        check(f"skin.{sid}.animationName", row.get("animationName"), contract["poseRules"]["animationName"])

        image = Image.open(render).convert("RGBA")
        rgba_sha = hashlib.sha256(image.tobytes()).hexdigest()
        check(f"skin.{sid}.rgbaPixelSha256", rgba_sha, expected["rgbaPixelSha256"])
        check(f"skin.{sid}.decodedCanvas", list(image.size), expected["canvas"])
        check(f"skin.{sid}.decodedAlphaBounds", list(image.getchannel("A").getbbox()), expected["alphaBounds"])

    result = {
        "schemaVersion": 1,
        "stage": "skin-detail-spine-stage2",
        "substage": "render-contract-representative-regression",
        "status": "PASS" if not failures else "FAIL",
        "contractPath": CONTRACT_PATH.relative_to(ROOT).as_posix(),
        "checkCount": len(checks),
        "failureCount": len(failures),
        "failures": failures,
        "checks": checks,
        "guardrails": {
            "bulk540Rendered": False,
            "frontendChanged": False,
            "publicSkinAssetsChanged": False,
            "classFusionTouched": False,
        },
    }
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"status": result["status"], "checkCount": len(checks), "failureCount": len(failures)}, ensure_ascii=False))
    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
