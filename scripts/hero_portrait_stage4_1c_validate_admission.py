#!/usr/bin/env python3
import argparse
import hashlib
import json
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import gdown
from PIL import Image, ImageDraw, ImageFont

MAPPING_PATH = "data/generated/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json"
STAGE2_PATH = "data/generated/hero-portrait-stage2-representative-resolution-proof.v1.json"
TARGET_STATE = "BRIDGE_PROVEN_MAPPING_NOT_ADMITTED"
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_one(row: dict, out_dir: Path, attempts: int = 3) -> dict:
    hero_id = int(row["heroId"])
    candidate = row["baseCandidates"][0]
    file_id = candidate["driveFileId"]
    file_name = candidate["driveFileName"]
    target = out_dir / f"{hero_id}.png"
    err = None
    for attempt in range(1, attempts + 1):
        try:
            if target.exists():
                target.unlink()
            result = gdown.download(id=file_id, output=str(target), quiet=True)
            if result and target.exists() and target.stat().st_size > 0:
                return {
                    "heroId": hero_id,
                    "driveFileId": file_id,
                    "sourceFileName": file_name,
                    "path": str(target),
                    "downloadAttempt": attempt,
                    "downloadResult": "PASS",
                }
            err = "gdown returned no usable file"
        except Exception as exc:  # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
        time.sleep(attempt * 0.8)
    return {
        "heroId": hero_id,
        "driveFileId": file_id,
        "sourceFileName": file_name,
        "path": str(target),
        "downloadAttempt": attempts,
        "downloadResult": "FAIL",
        "error": err,
    }


def validate_png(download: dict, source_row: dict) -> dict:
    base = {
        "heroId": int(source_row["heroId"]),
        "rarity": source_row["rarity"],
        "driveGroupPath": source_row["driveGroupPath"],
        "driveFileId": download["driveFileId"],
        "sourceFileName": download["sourceFileName"],
        "downloadResult": download["downloadResult"],
        "downloadAttempt": download["downloadAttempt"],
        "sourceProvenance": "PASS_BY_STAGE4_1B_EXACT_OWNERSHIP_PLUS_STRUCTURED_SKIN_BASE_PATH",
        "filenameTokensUsedAsOwnershipEvidence": False,
        "visualReviewState": "PENDING_BATCH_VISUAL_REVIEW",
    }
    if download["downloadResult"] != "PASS":
        base.update({
            "technicalResult": "FAIL_DOWNLOAD",
            "admissionState": "REJECTED_SOURCE",
            "error": download.get("error"),
        })
        return base

    path = Path(download["path"])
    data = path.read_bytes()
    base["byteLength"] = len(data)
    base["sha256"] = sha256_bytes(data)
    base["pngSignature"] = data[:8] == PNG_SIG
    base["mimeType"] = "image/png" if base["pngSignature"] else "application/octet-stream"
    base["mimeEvidence"] = "FILE_SIGNATURE_PLUS_PIL_DECODE"

    try:
        with Image.open(path) as img:
            fmt = img.format
            img.load()
            width, height = img.size
            bands = list(img.getbands())
            mode = img.mode
            has_alpha_band = "A" in bands
            alpha_extrema = None
            has_real_transparency = False
            visible_bbox = None
            if has_alpha_band:
                alpha = img.getchannel("A")
                alpha_extrema = list(alpha.getextrema())
                visible_bbox = alpha.getbbox()
                has_real_transparency = alpha_extrema[0] < 255 and alpha_extrema[1] > 0
            base.update({
                "decodedFormat": fmt,
                "width": width,
                "height": height,
                "mode": mode,
                "bands": bands,
                "alpha": has_alpha_band,
                "alphaExtrema": alpha_extrema,
                "realTransparency": has_real_transparency,
                "visiblePixels": visible_bbox is not None,
            })
    except Exception as exc:  # noqa: BLE001
        base.update({
            "technicalResult": "FAIL_DECODE",
            "admissionState": "REJECTED_SOURCE",
            "error": f"{type(exc).__name__}: {exc}",
        })
        return base

    checks = {
        "pngSignature": bool(base["pngSignature"]),
        "decodedPng": base.get("decodedFormat") == "PNG",
        "positiveDimensions": base.get("width", 0) > 0 and base.get("height", 0) > 0,
        "alphaPresent": bool(base.get("alpha")),
        "realTransparency": bool(base.get("realTransparency")),
        "visiblePixels": bool(base.get("visiblePixels")),
        "byteLengthPositive": base.get("byteLength", 0) > 8,
        "sha256Present": len(base.get("sha256", "")) == 64,
        "baseProvenance": base["sourceProvenance"].startswith("PASS_"),
    }
    base["checks"] = checks
    if all(checks.values()):
        base["technicalResult"] = "PASS_TECHNICAL_VISUAL_REVIEW_PENDING"
        base["admissionState"] = "REVIEW_SOURCE_IDENTITY"
    else:
        base["technicalResult"] = "FAIL_TECHNICAL_GATE"
        base["admissionState"] = "REJECTED_SOURCE"
    return base


def font(size: int):
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def make_contact_sheets(records: list[dict], image_dir: Path, review_dir: Path, per_sheet: int = 30):
    review_dir.mkdir(parents=True, exist_ok=True)
    title_font = font(18)
    small_font = font(14)
    thumb_w, thumb_h = 220, 280
    label_h = 48
    cols = 6
    rows = 5
    cell_w, cell_h = thumb_w + 20, thumb_h + label_h + 20
    ordered = sorted([r for r in records if r.get("technicalResult", "").startswith("PASS_")], key=lambda r: int(r["heroId"]))
    sheets = []
    for sheet_idx in range(0, len(ordered), per_sheet):
        batch = ordered[sheet_idx:sheet_idx + per_sheet]
        canvas = Image.new("RGB", (cols * cell_w, rows * cell_h), "white")
        draw = ImageDraw.Draw(canvas)
        for i, rec in enumerate(batch):
            r, c = divmod(i, cols)
            x, y = c * cell_w + 10, r * cell_h + 10
            src = image_dir / f"{rec['heroId']}.png"
            with Image.open(src) as im:
                rgba = im.convert("RGBA")
                rgba.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                bg = Image.new("RGBA", rgba.size, "white")
                bg.alpha_composite(rgba)
                rgb = bg.convert("RGB")
                px = x + (thumb_w - rgb.width) // 2
                py = y + (thumb_h - rgb.height) // 2
                canvas.paste(rgb, (px, py))
            draw.rectangle((x, y, x + thumb_w, y + thumb_h), outline="black", width=1)
            label = f"Hero {rec['heroId']} | {rec['rarity']}\n{rec['width']}x{rec['height']} | {rec['alphaExtrema']}"
            draw.multiline_text((x, y + thumb_h + 4), label, fill="black", font=small_font, spacing=2)
        number = sheet_idx // per_sheet + 1
        out = review_dir / f"hero-stage4-1c-contact-{number:02d}.jpg"
        canvas.save(out, "JPEG", quality=88, optimize=True)
        sheets.append({"sheet": number, "path": out.name, "heroIds": [int(r["heroId"]) for r in batch]})
    index = {"version": 1, "sheetCount": len(sheets), "recordsPerSheet": per_sheet, "sheets": sheets}
    (review_dir / "contact-sheet-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=".")
    ap.add_argument("--work-dir", required=True)
    ap.add_argument("--review-dir", required=True)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    repo = Path(args.repo_root)
    work_dir = Path(args.work_dir)
    review_dir = Path(args.review_dir)
    work_dir.mkdir(parents=True, exist_ok=True)

    mapping = load_json(repo / MAPPING_PATH)
    stage2 = load_json(repo / STAGE2_PATH)
    rows = [r for r in mapping["records"] if r.get("mappingState") == TARGET_STATE]
    if len(rows) != 203:
        raise SystemExit(f"expected 203 mapped-not-admitted rows, got {len(rows)}")

    rows_by_hero = {int(r["heroId"]): r for r in rows}
    downloads = []
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(download_one, row, work_dir): int(row["heroId"]) for row in rows}
        for fut in as_completed(futs):
            downloads.append(fut.result())

    records = [validate_png(d, rows_by_hero[int(d["heroId"])]) for d in sorted(downloads, key=lambda x: int(x["heroId"]))]

    sha_to_heroes = defaultdict(list)
    for rec in records:
        if rec.get("sha256"):
            sha_to_heroes[rec["sha256"]].append(int(rec["heroId"]))
    for rec in stage2.get("records", []):
        if rec.get("sha256"):
            sha_to_heroes[rec["sha256"]].append(int(rec["heroId"]))
    duplicate_groups = {sha: sorted(set(ids)) for sha, ids in sha_to_heroes.items() if len(set(ids)) > 1}
    duplicate_heroes = {h for ids in duplicate_groups.values() for h in ids}
    for rec in records:
        if int(rec["heroId"]) in duplicate_heroes and rec.get("technicalResult", "").startswith("PASS_"):
            rec["technicalResult"] = "PASS_TECHNICAL_DUPLICATE_BYTES_REVIEW"
            rec["admissionState"] = "REVIEW_SOURCE_IDENTITY"
            rec["duplicateByteHeroIds"] = next(ids for ids in duplicate_groups.values() if int(rec["heroId"]) in ids)

    contact_index = make_contact_sheets(records, work_dir, review_dir)

    state_counts = defaultdict(int)
    technical_counts = defaultdict(int)
    for rec in records:
        state_counts[rec["admissionState"]] += 1
        technical_counts[rec["technicalResult"]] += 1

    summary = {
        "mappedNotAdmittedInputCount": len(rows),
        "downloadPassCount": sum(1 for r in records if r.get("downloadResult") == "PASS"),
        "technicalPassCount": sum(1 for r in records if r.get("technicalResult", "").startswith("PASS_")),
        "technicalFailureCount": sum(1 for r in records if r.get("technicalResult", "").startswith("FAIL_")),
        "duplicateShaGroupCount": len(duplicate_groups),
        "duplicateHeroCount": len(duplicate_heroes),
        "contactSheetCount": contact_index["sheetCount"],
        "admissionStateCounts": dict(sorted(state_counts.items())),
        "technicalResultCounts": dict(sorted(technical_counts.items())),
        "finalAdmissionPerformed": False,
    }
    status = "PASS_TECHNICAL_VISUAL_REVIEW_PENDING" if summary["technicalFailureCount"] == 0 else "PASS_WITH_REVIEW_TECHNICAL_EXCEPTIONS"
    output = {
        "version": 1,
        "stage": "hero-portrait-stage4-1c-mapped-source-admission",
        "phase": "TECHNICAL_VALIDATION",
        "status": status,
        "sourceMapping": MAPPING_PATH,
        "stage3Contract": "data/contracts/hero-portrait-stage3-extraction-contract.v1.json",
        "policy": {
            "ownershipRecomputed": False,
            "downloadByImmutableDriveFileId": True,
            "imageBodyUsedOnlyForAdmissionValidation": True,
            "filenameTokensAuthoritative": False,
            "baseProvenance": "Stage 4-1B exact ownership + same group structured 스킨/기본 path",
            "visualBatchReviewRequiredBeforeAdmission": True,
            "losslessMaterializationPerformed": False,
        },
        "summary": summary,
        "duplicateShaGroups": duplicate_groups,
        "records": records,
    }
    out_path = repo / "data/validation/hero-portrait-stage4-1c-technical-admission.v1.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary_path = repo / "data/validation/hero-portrait-stage4-1c-technical-admission-summary.v1.json"
    summary_path.write_text(json.dumps({"version": 1, "status": status, "summary": summary, "duplicateShaGroups": duplicate_groups}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, **summary}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
