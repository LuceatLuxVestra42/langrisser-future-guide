from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

SOURCE_MANIFEST_PATH = Path("data/generated/hero-card-icon-assets.v1.json")
DELIVERY_MANIFEST_PATH = Path("data/generated/hero-card-icon-web-delivery.v1.json")
SOURCE_DIR = Path("public/images/heroes/card-icons")
DELIVERY_DIR = Path("public/images/heroes/card-icons-webp")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    source = json.loads(SOURCE_MANIFEST_PATH.read_text(encoding="utf-8"))
    records = source.get("records") or []
    if source.get("freezeState") != "HERO_CARD_ICON_ASSETS_FROZEN" or len(records) != 267:
        raise SystemExit("frozen Hero card-icon source manifest is not production-ready")

    DELIVERY_DIR.mkdir(parents=True, exist_ok=True)
    for stale in DELIVERY_DIR.glob("*.webp"):
        stale.unlink()

    total_png = 0
    total_webp = 0
    ids: set[int] = set()
    delivery_records = []

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

        png_bytes = source_path.stat().st_size
        webp_bytes = target_path.stat().st_size
        total_png += png_bytes
        total_webp += webp_bytes
        delivery_records.append({
            "heroId": hero_id,
            "sourcePngPath": row["webAssetPath"],
            "sourcePngFilePath": row["expectedFilePath"],
            "sourcePngSha256": row["sha256"],
            "sourcePngByteLength": png_bytes,
            "width": int(row["width"]),
            "height": int(row["height"]),
            "webDeliveryFormat": "image/webp",
            "webDeliveryMode": "LOSSLESS",
            "webDeliveryPath": f"/images/heroes/card-icons-webp/{hero_id}.webp",
            "webDeliveryFilePath": f"public/images/heroes/card-icons-webp/{hero_id}.webp",
            "webDeliverySha256": sha256(target_path),
            "webDeliveryByteLength": webp_bytes,
        })

    if len(list(DELIVERY_DIR.glob("*.webp"))) != 267:
        raise SystemExit("WebP output count mismatch")

    savings = round((1 - total_webp / total_png) * 100, 2)
    delivery = {
        "version": 1,
        "stage": "hero-card-icon-web-delivery",
        "schemaId": "hero-card-icon-web-delivery/v1",
        "status": "PASS",
        "completion": "COMPLETE",
        "freezeState": "HERO_CARD_ICON_WEB_DELIVERY_FROZEN",
        "sourceManifest": "data/generated/hero-card-icon-assets.v1.json",
        "sourceFreezeState": source["freezeState"],
        "sourcePolicy": {
            "pngAuthoritativeSourceRetained": True,
            "webDeliveryFormat": "LOSSLESS_WEBP",
            "semanticRelationReopened": False,
            "remoteRuntimeHotlink": False,
        },
        "summary": {
            "heroCount": 267,
            "sourcePngCount": 267,
            "webDeliveryCount": 267,
            "pendingCount": 0,
            "hardErrorCount": 0,
            "sourcePngTotalBytes": total_png,
            "webDeliveryTotalBytes": total_webp,
            "webDeliverySavingsPercent": savings,
        },
        "records": delivery_records,
    }
    DELIVERY_MANIFEST_PATH.write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS_HERO_CARD_ICON_WEBP_GENERATION",
        "heroCount": len(records),
        "sourcePngBytes": total_png,
        "webpBytes": total_webp,
        "savingsPercent": savings,
    }))


if __name__ == "__main__":
    main()
