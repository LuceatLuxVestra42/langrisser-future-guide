#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from PIL import Image


def inspect_image(path: Path):
    with Image.open(path) as image:
        if image.format != "PNG":
            raise ValueError(f"expected PNG, got {image.format}")
        rgba = image.convert("RGBA")
        width, height = rgba.size
        pixels = list(rgba.getdata())
        total = len(pixels)
        transparent = sum(1 for pixel in pixels if pixel[3] == 0)
        has_alpha = "A" in image.getbands() or "transparency" in image.info

        border = []
        if width > 0 and height > 0:
            for x in range(width):
                border.append(rgba.getpixel((x, 0)))
                if height > 1:
                    border.append(rgba.getpixel((x, height - 1)))
            for y in range(1, max(1, height - 1)):
                border.append(rgba.getpixel((0, y)))
                if width > 1:
                    border.append(rgba.getpixel((width - 1, y)))
        border_transparent = sum(1 for pixel in border if pixel[3] == 0)
        corners = [
            rgba.getpixel((0, 0)),
            rgba.getpixel((max(0, width - 1), 0)),
            rgba.getpixel((0, max(0, height - 1))),
            rgba.getpixel((max(0, width - 1), max(0, height - 1))),
        ] if width and height else []

        return {
            "format": image.format,
            "width": width,
            "height": height,
            "sourceHasAlpha": has_alpha,
            "transparentPixelRatio": transparent / total if total else 0.0,
            "borderTransparentPixelRatio": border_transparent / len(border) if border else 0.0,
            "transparentCornerCount": sum(1 for pixel in corners if pixel[3] == 0),
        }


def compare_images(png_path: Path, webp_path: Path):
    with Image.open(png_path) as png_image, Image.open(webp_path) as webp_image:
        png_rgba = png_image.convert("RGBA")
        webp_rgba = webp_image.convert("RGBA")
        same_size = png_rgba.size == webp_rgba.size
        pixel_exact = same_size and png_rgba.tobytes() == webp_rgba.tobytes()
        return {
            "pngSize": list(png_rgba.size),
            "webpSize": list(webp_rgba.size),
            "dimensionsPreserved": same_size,
            "decodedPixelExact": pixel_exact,
        }


def generate_fixture(path: Path, seed: int, opaque: bool = False):
    width = 64
    height = 64
    image = Image.new("RGBA", (width, height), (0, 0, 0, 255 if opaque else 0))
    pixels = image.load()
    red = (seed * 53) % 256
    green = (seed * 97) % 256
    blue = (seed * 193) % 256
    for y in range(12, 52):
        for x in range(12, 52):
            pixels[x, y] = (red, green, blue, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False)
    return inspect_image(path)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    inspect_parser = sub.add_parser("inspect")
    inspect_parser.add_argument("path")

    compare_parser = sub.add_parser("compare")
    compare_parser.add_argument("png")
    compare_parser.add_argument("webp")

    generate_parser = sub.add_parser("generate-fixture")
    generate_parser.add_argument("path")
    generate_parser.add_argument("--seed", type=int, required=True)
    generate_parser.add_argument("--opaque", action="store_true")

    args = parser.parse_args()
    try:
        if args.command == "inspect":
            result = inspect_image(Path(args.path))
        elif args.command == "compare":
            result = compare_images(Path(args.png), Path(args.webp))
            if not result["decodedPixelExact"]:
                print(json.dumps(result, ensure_ascii=False))
                raise SystemExit(2)
        else:
            result = generate_fixture(Path(args.path), args.seed, args.opaque)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "BLOCKER", "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
