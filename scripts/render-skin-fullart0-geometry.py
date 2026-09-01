#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def barycentric(px, py, ax, ay, bx, by, cx, cy):
    denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(denom) < 1e-8:
        return None
    w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denom
    w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denom
    w2 = 1.0 - w0 - w1
    return w0, w1, w2


def sample_bilinear(texture, u, v):
    h, w, _ = texture.shape
    x = np.clip(u * (w - 1), 0, w - 1)
    y = np.clip(v * (h - 1), 0, h - 1)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    c00 = texture[y0, x0]
    c10 = texture[y0, x1]
    c01 = texture[y1, x0]
    c11 = texture[y1, x1]
    return (c00 * (1 - fx) * (1 - fy) + c10 * fx * (1 - fy) + c01 * (1 - fx) * fy + c11 * fx * fy)


def blend(canvas_rgb_p, canvas_a, yy, xx, src_rgba, mode):
    src_rgb = np.clip(src_rgba[..., :3], 0.0, 1.0)
    src_a = np.clip(src_rgba[..., 3], 0.0, 1.0)
    dst_p = canvas_rgb_p[yy, xx]
    dst_a = canvas_a[yy, xx]
    dst_rgb = np.where(dst_a[..., None] > 1e-8, dst_p / np.maximum(dst_a[..., None], 1e-8), 0.0)

    if mode == 'Normal':
        out_a = src_a + dst_a * (1.0 - src_a)
        out_p = src_rgb * src_a[..., None] + dst_p * (1.0 - src_a[..., None])
    elif mode == 'Additive':
        out_a = np.maximum(dst_a, src_a)
        out_p = np.clip(dst_p + src_rgb * src_a[..., None], 0.0, 1.0)
    elif mode == 'Multiply':
        blended = dst_rgb * src_rgb
        out_a = src_a + dst_a * (1.0 - src_a)
        out_rgb = blended * src_a[..., None] + dst_rgb * (1.0 - src_a[..., None])
        out_p = out_rgb * out_a[..., None]
    elif mode == 'Screen':
        blended = 1.0 - (1.0 - dst_rgb) * (1.0 - src_rgb)
        out_a = src_a + dst_a * (1.0 - src_a)
        out_rgb = blended * src_a[..., None] + dst_rgb * (1.0 - src_a[..., None])
        out_p = out_rgb * out_a[..., None]
    else:
        raise RuntimeError(f'unsupported Spine blend mode: {mode}')

    canvas_rgb_p[yy, xx] = np.clip(out_p, 0.0, 1.0)
    canvas_a[yy, xx] = np.clip(out_a, 0.0, 1.0)


def render_triangle(canvas_rgb_p, canvas_a, texture, dst, uv, tint, blend_mode):
    xs = dst[:, 0]
    ys = dst[:, 1]
    min_x = max(0, int(math.floor(float(xs.min()))))
    max_x = min(canvas_a.shape[1] - 1, int(math.ceil(float(xs.max()))))
    min_y = max(0, int(math.floor(float(ys.min()))))
    max_y = min(canvas_a.shape[0] - 1, int(math.ceil(float(ys.max()))))
    if min_x > max_x or min_y > max_y:
        return 0

    grid_x, grid_y = np.meshgrid(
        np.arange(min_x, max_x + 1, dtype=np.float32) + 0.5,
        np.arange(min_y, max_y + 1, dtype=np.float32) + 0.5,
    )
    weights = barycentric(
        grid_x, grid_y,
        dst[0, 0], dst[0, 1],
        dst[1, 0], dst[1, 1],
        dst[2, 0], dst[2, 1],
    )
    if weights is None:
        return 0
    w0, w1, w2 = weights
    eps = -1e-5
    mask = (w0 >= eps) & (w1 >= eps) & (w2 >= eps)
    if not np.any(mask):
        return 0

    u = w0 * uv[0, 0] + w1 * uv[1, 0] + w2 * uv[2, 0]
    v = w0 * uv[0, 1] + w1 * uv[1, 1] + w2 * uv[2, 1]
    sampled = sample_bilinear(texture, u[mask], v[mask])
    sampled[..., :3] *= tint[:3]
    sampled[..., 3] *= tint[3]
    local_y, local_x = np.nonzero(mask)
    yy = local_y + min_y
    xx = local_x + min_x
    blend(canvas_rgb_p, canvas_a, yy, xx, sampled, blend_mode)
    return int(mask.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--geometry', required=True)
    ap.add_argument('--texture', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--evidence-output', required=True)
    ap.add_argument('--margin', type=int, default=24)
    args = ap.parse_args()

    geometry_path = Path(args.geometry)
    texture_path = Path(args.texture)
    output_path = Path(args.output)
    evidence_path = Path(args.evidence_output)
    geometry = json.loads(geometry_path.read_text(encoding='utf-8'))
    if geometry.get('status') != 'PASS_VERSION_MATCHED_SPINE_GEOMETRY':
        raise RuntimeError('geometry input is not PASS')
    if geometry.get('skeleton', {}).get('version') != '3.3.05':
        raise RuntimeError('geometry was not produced with the current Spine 3.3.05 skeleton')

    texture_image = Image.open(texture_path).convert('RGBA')
    texture = np.asarray(texture_image, dtype=np.float32) / 255.0
    bounds = geometry['geometry']['bounds']
    margin = args.margin
    width = int(math.ceil(bounds['width'])) + margin * 2
    height = int(math.ceil(bounds['height'])) + margin * 2
    if width <= 0 or height <= 0 or width > 8192 or height > 8192:
        raise RuntimeError(f'unreasonable setup-pose canvas: {width}x{height}')

    canvas_rgb_p = np.zeros((height, width, 3), dtype=np.float32)
    canvas_a = np.zeros((height, width), dtype=np.float32)
    tri_total = 0
    covered_pixels = 0
    page_names = set()
    for item in sorted(geometry['geometry']['renderables'], key=lambda row: row['drawIndex']):
        atlas = item.get('atlas') or {}
        page = atlas.get('page')
        if not page:
            raise RuntimeError(f'renderable has no atlas page: {item.get("attachment")}')
        page_names.add(page)
        if page != texture_path.name:
            raise RuntimeError(f'multiple/incorrect texture page: geometry={page} texture={texture_path.name}')

        vertices = np.asarray(item['vertices'], dtype=np.float32).reshape(-1, 2)
        uvs = np.asarray(item['uvs'], dtype=np.float32).reshape(-1, 2)
        triangles = np.asarray(item['triangles'], dtype=np.int32).reshape(-1, 3)
        if len(vertices) != len(uvs):
            raise RuntimeError(f'vertex/UV count mismatch: {item.get("attachment")}')
        slot_color = item['slotColor']
        att_color = item['attachmentColor']
        tint = np.array([
            slot_color['r'] * att_color['r'],
            slot_color['g'] * att_color['g'],
            slot_color['b'] * att_color['b'],
            slot_color['a'] * att_color['a'],
        ], dtype=np.float32)

        transformed = np.empty_like(vertices)
        transformed[:, 0] = vertices[:, 0] - bounds['minX'] + margin
        transformed[:, 1] = bounds['maxY'] - vertices[:, 1] + margin
        for tri in triangles:
            if np.any(tri < 0) or np.any(tri >= len(vertices)):
                raise RuntimeError(f'invalid triangle index: {item.get("attachment")} {tri.tolist()}')
            covered_pixels += render_triangle(
                canvas_rgb_p,
                canvas_a,
                texture,
                transformed[tri],
                uvs[tri],
                tint,
                item['blendMode'],
            )
            tri_total += 1

    if tri_total != geometry['geometry']['triangleCount']:
        raise RuntimeError(f'triangle count drift: rendered={tri_total} geometry={geometry["geometry"]["triangleCount"]}')
    nonzero = canvas_a > (1.0 / 255.0)
    if not np.any(nonzero):
        raise RuntimeError('render result has no visible alpha')
    ys, xs = np.nonzero(nonzero)
    alpha_bbox = {
        'left': int(xs.min()),
        'top': int(ys.min()),
        'rightExclusive': int(xs.max()) + 1,
        'bottomExclusive': int(ys.max()) + 1,
        'width': int(xs.max() - xs.min() + 1),
        'height': int(ys.max() - ys.min() + 1),
    }

    out_rgb = np.where(
        canvas_a[..., None] > 1e-8,
        canvas_rgb_p / np.maximum(canvas_a[..., None], 1e-8),
        0.0,
    )
    out_rgba = np.concatenate([out_rgb, canvas_a[..., None]], axis=2)
    out_u8 = np.clip(np.round(out_rgba * 255.0), 0, 255).astype(np.uint8)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out_u8, 'RGBA').save(output_path)

    result = {
        'schemaVersion': 1,
        'stage': 'skin-page-3',
        'substage': 'FULLART-0-current-render',
        'status': 'PASS_CURRENT_SPINE_SETUP_POSE_RENDER',
        'skinId': 102,
        'guardrails': {
            'imageGeneratedByAI': False,
            'historicalArtifactImported': False,
            'currentOfficialSourceOnly': True,
            'versionMatchedSpineRuntime': True,
            'runtimeCommitPinned': True,
            'scopeSkinCount': 1,
        },
        'runtime': geometry['runtime'],
        'inputs': {
            'geometryPath': geometry_path.as_posix(),
            'geometrySha256': sha256_file(geometry_path),
            'texturePath': texture_path.as_posix(),
            'textureSha256': sha256_file(texture_path),
            'textureWidth': texture_image.width,
            'textureHeight': texture_image.height,
            'atlasPages': sorted(page_names),
        },
        'render': {
            'pose': 'setup',
            'canvasWidth': width,
            'canvasHeight': height,
            'geometryBounds': bounds,
            'alphaBBox': alpha_bbox,
            'renderableAttachmentCount': geometry['geometry']['renderableAttachmentCount'],
            'triangleCount': tri_total,
            'coveredTriangleSamplePixels': covered_pixels,
            'blendModes': geometry['geometry']['blendModes'],
            'outputPath': output_path.as_posix(),
            'outputSizeBytes': output_path.stat().st_size,
            'outputSha256': sha256_file(output_path),
        },
        'decision': 'REQUIRES_CURRENT_OUTPUT_VISUAL_REVIEW_BEFORE_CROSS_SKIN_EXPANSION',
    }
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({
        'status': result['status'],
        'canvas': [width, height],
        'alphaBBox': alpha_bbox,
        'renderables': result['render']['renderableAttachmentCount'],
        'triangles': tri_total,
        'blendModes': result['render']['blendModes'],
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
