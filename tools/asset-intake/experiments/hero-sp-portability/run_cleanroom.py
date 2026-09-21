#!/usr/bin/env python3
import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FIXTURE = ROOT / "fixture.v1.json"
SPINE_COMMIT = "1c1936532527900f74cfb58f7002998bf157b254"
SPINE_TARBALL = f"https://codeload.github.com/EsotericSoftware/spine-runtimes/tar.gz/{SPINE_COMMIT}"

def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def run_cmd(cmd, env=None):
    print("+", " ".join(str(x) for x in cmd), flush=True)
    subprocess.run([str(x) for x in cmd], cwd=ROOT, env=env, check=True)

def ensure_cleanroom():
    for p in [ROOT, *ROOT.parents]:
        if (p / ".git").exists():
            raise RuntimeError(f"workspace is inside a Git checkout: {p}")
    for name in ["extract_render_input.py", "render_spine_geometry.py", "SpineGeometry.cs"]:
        data = (ROOT / name).read_text(encoding="utf-8")
        for token in ["git show ", "langrisser-future-guide", "public/images/heroes/sp"]:
            if token in data:
                raise RuntimeError(f"forbidden repository dependency in {name}: {token}")

def ensure_versions():
    import importlib.metadata as md
    expected = {"UnityPy": "1.25.3", "Pillow": "12.3.0", "numpy": "2.4.6"}
    actual = {name: md.version(name) for name in expected}
    if actual != expected:
        raise RuntimeError(f"direct dependency version drift: expected={expected} actual={actual}")
    dotnet = subprocess.check_output(["dotnet", "--version"], text=True).strip()
    if dotnet != "8.0.425":
        raise RuntimeError(f"dotnet SDK drift: expected=8.0.425 actual={dotnet}")

def ensure_spine_runtime():
    runtime = ROOT / ".runtime" / "spine-runtimes"
    src = runtime / "spine-csharp" / "src"
    if src.is_dir():
        return src
    print(f"downloading pinned Spine runtime {SPINE_COMMIT}", flush=True)
    with urllib.request.urlopen(SPINE_TARBALL, timeout=120) as response:
        payload = response.read()
    temp = ROOT / ".runtime" / "_spine_extract"
    if temp.exists():
        shutil.rmtree(temp)
    temp.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(payload), mode="r:gz") as tf:
        safe = []
        for member in tf.getmembers():
            part = Path(member.name)
            if part.is_absolute() or ".." in part.parts:
                raise RuntimeError(f"unsafe archive member: {member.name}")
            safe.append(member)
        tf.extractall(temp, members=safe)
    tops = [p for p in temp.iterdir() if p.is_dir()]
    if len(tops) != 1:
        raise RuntimeError(f"unexpected Spine archive roots: {tops}")
    shutil.copytree(tops[0], runtime)
    shutil.rmtree(temp)
    if not src.is_dir():
        raise RuntimeError("Spine runtime source missing after extraction")
    return src

def build_geometry(runtime_src):
    project_dir = ROOT / ".runtime" / "geometry"
    project_dir.mkdir(parents=True, exist_ok=True)
    program = project_dir / "SpineGeometry.cs"
    shutil.copy2(ROOT / "SpineGeometry.cs", program)
    project = project_dir / "SpineGeometry.csproj"
    xml = f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
    <Nullable>disable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="{runtime_src.as_posix()}/**/*.cs" />
    <Compile Include="{program.as_posix()}" />
  </ItemGroup>
</Project>
"""
    project.write_text(xml, encoding="utf-8")
    run_cmd(["dotnet", "build", project, "-c", "Release"])
    return project

def materialize(record, project):
    from PIL import Image
    hero_id = int(record["heroId"])
    env = os.environ.copy()
    env["HERO_ID"] = str(hero_id)
    env["CHAR_IMAGE_ID"] = str(record["charImageId"])
    run_cmd([sys.executable, ROOT / "extract_render_input.py"], env=env)
    out = ROOT / "out" / str(hero_id)
    inp = json.loads((out / "input.json").read_text(encoding="utf-8"))
    geometry = out / "geometry.json"
    run_cmd(["dotnet", "run", "--project", project, "-c", "Release", "--no-build", "--",
             inp["atlasPath"], inp["skeletonPath"], geometry])
    render_json = out / "render.json"
    full_png = out / "full.png"
    run_cmd([sys.executable, ROOT / "render_spine_geometry.py",
             "--geometry", geometry,
             "--texture", inp["texturePath"],
             "--output", full_png,
             "--evidence-output", render_json,
             "--hero-id", str(hero_id)])
    render = json.loads(render_json.read_text(encoding="utf-8"))
    image = Image.open(full_png).convert("RGBA")
    source_size = [image.width, image.height]
    image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    webp = out / f"{hero_id}.webp"
    image.save(webp, "WEBP", quality=90, method=6)
    check = Image.open(webp).convert("RGBA")
    amin, amax = check.getchannel("A").getextrema()
    summary = {
        "status": "PASS_CLEANROOM_SP_ARTWORK_RENDER",
        "heroId": hero_id,
        "charImageId": record["charImageId"],
        "sourceSpinePath": inp["sourceSpinePath"],
        "bundleSha256": inp["bundleSha256"],
        "spineVersion": inp["spineVersion"],
        "pose": render["render"]["pose"],
        "sourceCanvas": source_size,
        "width": check.width,
        "height": check.height,
        "hasAlpha": amin < 255,
        "alphaExtrema": [amin, amax],
        "renderableAttachmentCount": render["render"]["renderableAttachmentCount"],
        "triangleCount": render["render"]["triangleCount"],
        "sizeBytes": webp.stat().st_size,
        "sha256": sha256_file(webp),
    }
    expected = record["expected"]
    checks = {
        "width": summary["width"] == expected["width"],
        "height": summary["height"] == expected["height"],
        "renderableAttachmentCount": summary["renderableAttachmentCount"] == expected["renderableAttachmentCount"],
        "triangleCount": summary["triangleCount"] == expected["triangleCount"],
        "sha256": summary["sha256"] == expected["sha256"],
        "hasAlpha": summary["hasAlpha"],
    }
    if not all(checks.values()):
        raise RuntimeError(f"Hero {hero_id} deterministic parity failed: {checks}")
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return summary

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--hero-id", type=int, action="append", dest="hero_ids")
    args = ap.parse_args()
    ensure_cleanroom()
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    records = fixture["records"]
    wanted = set(args.hero_ids or [row["heroId"] for row in records])
    selected = [row for row in records if row["heroId"] in wanted]
    known = {row["heroId"] for row in records}
    unknown = sorted(wanted - known)
    if unknown:
        raise RuntimeError(f"unknown requested Hero IDs: {unknown}")
    if not args.execute:
        print(json.dumps({"status": "READY_NOT_EXECUTED", "heroIds": [row["heroId"] for row in selected]}))
        return
    ensure_versions()
    runtime_src = ensure_spine_runtime()
    project = build_geometry(runtime_src)
    summaries = [materialize(row, project) for row in selected]
    manifest = {
        "schemaVersion": 1,
        "status": "PASS_CLEANROOM_SP_PORTABILITY",
        "count": len(summaries),
        "heroIds": [row["heroId"] for row in summaries],
        "guardrails": fixture["guardrails"],
        "runtime": fixture["runtime"],
        "records": summaries,
    }
    out = ROOT / "out"
    out.mkdir(exist_ok=True)
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": manifest["status"], "count": manifest["count"], "heroIds": manifest["heroIds"]}))

if __name__ == "__main__":
    main()
