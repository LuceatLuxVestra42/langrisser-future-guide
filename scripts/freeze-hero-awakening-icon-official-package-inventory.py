#!/usr/bin/env python3
import argparse
import hashlib
import json
import pathlib
import urllib.error
import urllib.request

REPO_ROOT = pathlib.Path.cwd()
OUTPUT = REPO_ROOT / "data/generated/hero-awakening-icon-official-package-inventory.v1.json"
INSTALL_VERSION = "1.1.113"
BASE = f"http://mhmnzupdate.zlongame.com/MHMNZ/InstallVersion/InstallPage_{INSTALL_VERSION}"
MAX_PART = 90
MISS_BREAK = 8
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
PREDECESSOR_COMMIT = "c890920ad64dbee1210e10390b864eb576f47e46"
VERIFIER_CONTRACT = "data/contracts/hero-awakening-icon-official-verifier.v1.json"


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def head_size(url: str):
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"}, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            length = response.headers.get("Content-Length")
            if length is None:
                raise RuntimeError(f"Content-Length missing: {url}")
            return int(length)
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 404):
            return None
        raise


def scan_packages():
    packages = []
    seen = False
    trailing_misses = 0
    stopped_after_part = MAX_PART
    for part in range(1, MAX_PART + 1):
        package_name = f"InstallPage_{INSTALL_VERSION}_{part}.zip"
        url = f"{BASE}/{package_name}"
        size = head_size(url)
        if size is None:
            if seen:
                trailing_misses += 1
                if trailing_misses >= MISS_BREAK:
                    stopped_after_part = part
                    break
            continue
        seen = True
        trailing_misses = 0
        packages.append({"part": part, "packageName": package_name, "url": url, "contentLength": size})
    return packages, stopped_after_part, trailing_misses


def build_artifact(packages, stopped_after_part, trailing_misses):
    if not packages:
        raise RuntimeError("No official installer packages discovered")
    parts = [row["part"] for row in packages]
    gaps = [part for part in range(min(parts), max(parts) + 1) if part not in set(parts)]
    canonical = json.dumps(packages, ensure_ascii=False, separators=(",", ":"))
    return {
        "version": 1,
        "schemaId": "hero-awakening-icon-official-package-inventory/v1",
        "status": "FROZEN",
        "completion": "COMPLETE",
        "semanticReopen": False,
        "predecessor": {
            "stage": "A6_2_OFFICIAL_VERIFIER_CONTRACT",
            "commit": PREDECESSOR_COMMIT,
            "contract": VERIFIER_CONTRACT,
        },
        "source": {
            "kind": "OFFICIAL_INSTALLER",
            "installVersion": INSTALL_VERSION,
            "base": BASE,
            "probeMethod": "HTTP HEAD Content-Length only",
            "maxPart": MAX_PART,
            "missBreak": MISS_BREAK,
        },
        "summary": {
            "officialPackageCount": len(packages),
            "firstPart": min(parts),
            "lastPart": max(parts),
            "internalGapCount": len(gaps),
            "internalMissingParts": gaps,
            "scanStoppedAfterPart": stopped_after_part,
            "trailingMissCountAtStop": trailing_misses,
        },
        "packageInventorySha256": sha256_text(canonical),
        "packageInventoryHashContract": "sha256(UTF-8 compact JSON of packages, preserve array/key insertion order)",
        "packages": packages,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    packages, stopped_after_part, trailing_misses = scan_packages()
    artifact = build_artifact(packages, stopped_after_part, trailing_misses)
    serialized = json.dumps(artifact, ensure_ascii=False, indent=2) + "\n"

    if args.write:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(serialized, encoding="utf-8")
    else:
        if not OUTPUT.exists():
            raise RuntimeError(f"Frozen package inventory missing: {OUTPUT}")
        frozen = json.loads(OUTPUT.read_text(encoding="utf-8"))
        if frozen != artifact:
            raise RuntimeError("Frozen package inventory drifted from current official installer HEAD scan")

    print(json.dumps({
        "status": "PASS",
        "checkpoint": "AWAKENING_ICON_A6_3_OFFICIAL_PACKAGE_INVENTORY",
        "installVersion": INSTALL_VERSION,
        "officialPackageCount": artifact["summary"]["officialPackageCount"],
        "firstPart": artifact["summary"]["firstPart"],
        "lastPart": artifact["summary"]["lastPart"],
        "internalGapCount": artifact["summary"]["internalGapCount"],
        "scanStoppedAfterPart": artifact["summary"]["scanStoppedAfterPart"],
        "packageInventorySha256": artifact["packageInventorySha256"],
        "semanticReopen": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
