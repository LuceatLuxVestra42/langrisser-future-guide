import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image


def load_rgba(path):
    return np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32) / 255.0


def blend(dst, src, mode):
    sa = src[..., 3:4]
    da = dst[..., 3:4]
    srgb = src[..., :3]
    drgb = dst[..., :3]
    mode = (mode or 'Normal').lower()
    if mode == 'additive':
        out_rgb = np.clip(drgb + srgb * sa, 0, 1)
        out_a = np.clip(da + sa, 0, 1)
    elif mode == 'multiply':
        mixed = drgb * srgb
        out_rgb = mixed * sa + drgb * (1 - sa)
        out_a = sa + da * (1 - sa)
    elif mode == 'screen':
        mixed = 1 - (1 - drgb) * (1 - srgb)
        out_rgb = mixed * sa + drgb * (1 - sa)
        out_a = sa + da * (1 - sa)
    else:
        out_a = sa + da * (1 - sa)
        out_rgb_p = srgb * sa + drgb * da * (1 - sa)
        out_rgb = np.where(out_a > 1e-8, out_rgb_p / np.maximum(out_a, 1e-8), 0)
    return np.concatenate([out_rgb, out_a], axis=-1)


def raster_triangle(canvas, texture, dst_tri, uv_tri, tint, blend_mode, flip_v=False):
    h, w, _ = canvas.shape
    th, tw, _ = texture.shape
    xs = dst_tri[:, 0]
    ys = dst_tri[:, 1]
    minx = max(0, int(math.floor(xs.min())))
    maxx = min(w - 1, int(math.ceil(xs.max())))
    miny = max(0, int(math.floor(ys.min())))
    maxy = min(h - 1, int(math.ceil(ys.max())))
    if minx > maxx or miny > maxy:
        return

    x0, y0 = dst_tri[0]
    x1, y1 = dst_tri[1]
    x2, y2 = dst_tri[2]
    denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(float(denom)) < 1e-7:
        return

    yy, xx = np.mgrid[miny:maxy+1, minx:maxx+1]
    px = xx.astype(np.float32) + 0.5
    py = yy.astype(np.float32) + 0.5
    a = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
    b = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
    c = 1.0 - a - b
    mask = (a >= -1e-5) & (b >= -1e-5) & (c >= -1e-5)
    if not mask.any():
        return

    u = a * uv_tri[0, 0] + b * uv_tri[1, 0] + c * uv_tri[2, 0]
    v = a * uv_tri[0, 1] + b * uv_tri[1, 1] + c * uv_tri[2, 1]
    if flip_v:
        v = 1.0 - v
    sx = np.clip(np.rint(u * (tw - 1)).astype(np.int32), 0, tw - 1)
    sy = np.clip(np.rint(v * (th - 1)).astype(np.int32), 0, th - 1)
    sampled = texture[sy, sx].copy()
    sampled[..., :4] *= tint.reshape(1, 1, 4)
    sampled *= mask[..., None]

    roi = canvas[miny:maxy+1, minx:maxx+1]
    composed = blend(roi, sampled, blend_mode)
    roi[mask] = composed[mask]


def render(geometry_path, texture_path, output_path, flip_v=False):
    g = json.loads(pathlib.Path(geometry_path).read_text('utf-8'))
    texture = load_rgba(texture_path)
    minx, miny, maxx, maxy = map(float, g['worldBounds'])
    world_w = max(maxx - minx, 1.0)
    world_h = max(maxy - miny, 1.0)
    margin_world = max(world_w, world_h) * 0.06
    target = 900.0
    scale = min(target / (world_w + 2 * margin_world), target / (world_h + 2 * margin_world))
    canvas_w = max(64, int(math.ceil((world_w + 2 * margin_world) * scale)))
    canvas_h = max(64, int(math.ceil((world_h + 2 * margin_world) * scale)))
    canvas = np.zeros((canvas_h, canvas_w, 4), dtype=np.float32)

    def transform(vertices):
        a = np.asarray(vertices, dtype=np.float32).reshape(-1, 2)
        x = (a[:, 0] - (minx - margin_world)) * scale
        y = ((maxy + margin_world) - a[:, 1]) * scale
        return np.stack([x, y], axis=1)

    triangle_count = 0
    for item in g['drawItems']:
        vertices = transform(item['vertices'])
        uvs = np.asarray(item['uvs'], dtype=np.float32).reshape(-1, 2)
        triangles = item['triangles']
        tint = np.asarray(item['color'], dtype=np.float32)
        for i in range(0, len(triangles), 3):
            idx = triangles[i:i+3]
            if len(idx) < 3 or max(idx) >= len(vertices) or max(idx) >= len(uvs):
                continue
            raster_triangle(canvas, texture, vertices[idx], uvs[idx], tint, item.get('blendMode'), flip_v=flip_v)
            triangle_count += 1

    out = np.clip(np.rint(canvas * 255), 0, 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(output_path)
    alpha = out[..., 3]
    ys, xs = np.where(alpha > 2)
    visible = None if len(xs) == 0 else [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    return {
        'output': str(output_path),
        'width': canvas_w,
        'height': canvas_h,
        'triangleCount': triangle_count,
        'nonTransparentPixelCount': int((alpha > 2).sum()),
        'visibleBounds': visible,
        'flipV': bool(flip_v),
    }


def main():
    if len(sys.argv) < 4:
        raise SystemExit('usage: render-spine-stage2-geometry.py geometry.json texture.png output.png [--flip-v]')
    result = render(sys.argv[1], sys.argv[2], sys.argv[3], flip_v='--flip-v' in sys.argv[4:])
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
