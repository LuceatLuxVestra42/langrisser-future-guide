#!/usr/bin/env python3
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

EXPECTED = {"STATIC": 540, "CHAR_SPINE": 540, "MODEL_PRIMARY": 789}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    runner = repo_root / "scripts" / "skin-stage3-4-extract-unitypy.py"
    if not runner.is_file():
        raise RuntimeError(f"runner not found: {runner}")

    with tempfile.TemporaryDirectory(prefix="skin-stage3-4-unitypy-selftest-") as td:
        root = Path(td)
        bundle_root = root / "bundles"
        out_root = root / "out"
        fake_pkg = root / "fakepkg"
        bundle_root.mkdir()
        fake_pkg.mkdir()

        bundles = {
            "static-test.b": (b"STATIC_BUNDLE", "CAB-static"),
            "char-test.b": (b"CHAR_BUNDLE", "CAB-char"),
            "model-test.b": (b"MODEL_BUNDLE", "CAB-model"),
        }
        for name, (payload, _) in bundles.items():
            (bundle_root / name).write_bytes(payload)

        requests = []
        counters = {kind: 0 for kind in EXPECTED}
        for kind, count in EXPECTED.items():
            if kind == "STATIC":
                bundle = "static-test.b"
                runtime_base = "assets/gameproject/runtimeassets/ui/icon/heroskin_abs/skin"
            elif kind == "CHAR_SPINE":
                bundle = "char-test.b"
                runtime_base = "assets/gameproject/runtimeassets/spine/char/selftest_abs"
            else:
                bundle = "model-test.b"
                runtime_base = "assets/gameproject/runtimeassets/spine/general/selftest_abs"
            cab = bundles[bundle][1]
            bundle_sha = sha(bundle_root / bundle)
            for i in range(count):
                counters[kind] += 1
                rid = f"selftest:{kind.lower()}:{i}"
                ext = ".png" if kind == "STATIC" else ".prefab"
                runtime_path = f"{runtime_base}/{kind.lower()}_{i}{ext}"
                requests.append({
                    "requestId": rid,
                    "targetId": rid,
                    "kind": kind,
                    "skinId": i + 1,
                    "skinResourceId": i + 1 if kind == "MODEL_PRIMARY" else None,
                    "frozenPath": runtime_path.removeprefix("assets/gameproject/runtimeassets/"),
                    "runtimePath": runtime_path,
                    "qaClass": "RESOLVED_EXACT_SINGLE_BUNDLE",
                    "extractionClass": {"STATIC": "STATIC_IMAGE_SOURCE_OBJECT", "CHAR_SPINE": "CHAR_SPINE_PREFAB_OBJECT", "MODEL_PRIMARY": "MODEL_PRIMARY_PREFAB_OBJECT"}[kind],
                    "sourceProvenance": [{"bundle": bundle, "bundleSha256": bundle_sha, "embeddedCab": cab, "embeddedCabSha256": "a" * 64, "runtimePathByteOffset": 123}],
                    "selectedExtractionSource": {"bundle": bundle, "bundleSha256": bundle_sha, "embeddedCab": cab, "embeddedCabSha256": "a" * 64},
                    "sourceSelectionPolicy": "SOLE_EXACT_BUNDLE_CAB",
                })

        plan = {"schemaVersion": 1, "stage": "skin-page-3", "substage": "3-4", "status": "READY_FOR_SELECTIVE_OBJECT_EXTRACTION", "predecessor": {"qaFinalFreezeReady": True}, "counts": {"extractionRequestCount": len(requests), **counters}, "requests": requests}
        plan_path = root / "plan.json"
        result_path = root / "result.json"
        plan_path.write_text(json.dumps(plan), encoding="utf-8")

        fake_module = r'''
import json, os
from pathlib import Path
__version__ = "selftest"
class Type:
    def __init__(self, name): self.name = name
class Parent:
    def __init__(self): self.files = {}
class AssetsFile:
    def __init__(self, cab):
        # Reproduce the real-runtime compatibility case: direct name is empty,
        # but the parent bundle retains the exact child key.
        self.name = ""
        self.parent = Parent()
        self.parent.files[cab] = self
class FakeImage:
    def save(self, path, format=None): Path(path).write_bytes(b"\\x89PNG\\r\\n\\x1a\\nSELFTEST")
class Parsed:
    def __init__(self): self.image = FakeImage()
class Obj:
    def __init__(self, kind, cab, path_id):
        self.type = Type("Texture2D" if kind == "STATIC" else "GameObject")
        self.assets_file = AssetsFile(cab)
        self.path_id = path_id
        self.byte_size = 16
    def parse_as_object(self): return Parsed()
    def get_raw_data(self): return b"SERIALIZED_OBJECT"
class Env:
    def __init__(self, container): self.container = container
def load(bundle_path):
    plan = json.loads(Path(os.environ["FAKE_UNITYPY_PLAN"]).read_text(encoding="utf-8"))
    bundle = Path(bundle_path).name
    container = {}
    path_id = 1
    for req in plan["requests"]:
        src = req["selectedExtractionSource"]
        if src["bundle"] != bundle: continue
        container[req["runtimePath"]] = Obj(req["kind"], src["embeddedCab"], path_id)
        path_id += 1
    return Env(container)
'''
        (fake_pkg / "UnityPy.py").write_text(fake_module, encoding="utf-8")
        env = os.environ.copy()
        env["PYTHONPATH"] = str(fake_pkg) + os.pathsep + env.get("PYTHONPATH", "")
        env["FAKE_UNITYPY_PLAN"] = str(plan_path)
        proc = subprocess.run([sys.executable, str(runner), str(plan_path), str(bundle_root), str(out_root), str(result_path)], env=env, text=True, capture_output=True)
        if proc.returncode != 0:
            raise RuntimeError(f"runner failed rc={proc.returncode}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if result.get("finalReadyForValidation") is not True or result.get("counts", {}).get("extractedCount") != 1869 or result.get("counts", {}).get("errorCount") != 0 or result.get("counts", {}).get("extractedByKind") != EXPECTED:
            raise RuntimeError(f"unexpected result summary: {result.get('counts')}")
        for record in result["records"]:
            if record.get("status") != "EXTRACTED":
                raise RuntimeError(f"non-extracted record: {record.get('requestId')}")
            primaries = [a for a in record["artifacts"] if a.get("role") == "PRIMARY_OBJECT"]
            if len(primaries) != 1:
                raise RuntimeError(f"primary artifact cardinality fail: {record.get('requestId')}")
            for artifact in record["artifacts"]:
                fp = out_root / artifact["relativePath"]
                if not fp.is_file() or fp.stat().st_size != artifact["sizeBytes"] or sha(fp) != artifact["sha256"]:
                    raise RuntimeError(f"artifact hash/size fail: {record.get('requestId')} {artifact['relativePath']}")

        print("PASS_SKIN_STAGE3_4_UNITYPY_RUNNER_SELFTEST")
        print(json.dumps({"checks": 6, "failures": 0, "requests": 1869, "byKind": EXPECTED, "cabNameFallback": "parent.files identity"}, indent=2))
        return 0

if __name__ == "__main__":
    raise SystemExit(main())
