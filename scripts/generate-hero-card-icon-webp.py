from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

MANIFEST_PATH = Path("data/generated/hero-card-icon-assets.v1.json")
SOURCE_DIR = Path("public/images/heroes/card-icons")
DELIVERY_DIR = Path("public/images/heroes/card-icons-webp")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    records = manifest.get("records") or []
    if len(records) != 267:
        raise SystemExit(f"expected 267 manifest records, found {len(records)}")

    DELIVERY_DIR.mkdir(parents=True, exist_ok=True)
    for stale in DELIVERY_DIR.glob("*.webp"):
        stale.unlink()

    total_png = 0
    total_webp = 0
    ids: set[int] = set()

    for row in records:
        hero_id = int(row["heroId"])
        if hero_id in ids:
            raise SystemExit(f"duplicate Hero ID: {hero_id}")
        ids.add(hero_id)

        source_path = Path(row["expectedFilePath"])
        expected_source = SOURCE_DIR / f"{hero_id}.png"
        if source_path != expected_source or not source_path.is_file():
            raise SystemExit(f"Hero {hero_id} source PNG mismatch: {source_path}")
        if sha256(source_path) != row["sha256"]:
            raise SystemExit(f"Hero {hero_id} source PNG hash mismatch")
        if source_path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            raise SystemExit(f"Hero {hero_id} is not a real PNG")

        target_path = DELIVERY_DIR / f"{hero_id}.webp"
        with Image.open(source_path) as image:
            image.load()
            if image.size != (int(row["width"]), int(row["height"])):
                raise SystemExit(f"Hero {hero_id} source dimensions mismatch")
            image.save(target_path, format="WEBP", lossless=True, method=6, exact=True)

        total_png += source_path.stat().st_size
        total_webp += target_path.stat().st_size
        row["webDeliveryFormat"] = "image/webp"
        row["webDeliveryPath"] = f"/images/heroes/card-icons-webp/{hero_id}.webp"
        row["webDeliveryFilePath"] = f"public/images/heroes/card-icons-webp/{hero_id}.webp"
        row["webDeliverySha256"] = sha256(target_path)
        row["webDeliveryByteLength"] = target_path.stat().st_size

    if len(list(DELIVERY_DIR.glob("*.webp"))) != 267:
        raise SystemExit("WebP output count mismatch")

    manifest.setdefault("source", {})["webDeliveryRoot"] = "/images/heroes/card-icons-webp"
    manifest.setdefault("source", {})["webDeliveryLocalRoot"] = "public/images/heroes/card-icons-webp"
    manifest.setdefault("sourcePolicy", {})["pngAuthoritativeSourceRetained"] = True
    manifest.setdefault("sourcePolicy", {})["webDeliveryFormat"] = "LOSSLESS_WEBP"
    manifest.setdefault("summary", {})["webDeliveryCount"] = 267
    manifest["summary"]["webDeliveryTotalBytes"] = total_webp
    manifest["summary"]["sourcePngTotalBytes"] = total_png
    manifest["summary"]["webDeliverySavingsPercent"] = round((1 - total_webp / total_png) * 100, 2)

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS_HERO_CARD_ICON_WEBP_GENERATION",
        "heroCount": len(records),
        "sourcePngBytes": total_png,
        "webpBytes": total_webp,
        "savingsPercent": manifest["summary"]["webDeliverySavingsPercent"],
    }))


if __name__ == "__main__":
    main()
