#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

import gdown
import requests
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORK = Path('/tmp/hero42c_official')
WORK.mkdir(parents=True, exist_ok=True)
OUT_JSON = ROOT / 'data/validation/hero-portrait-stage4-2c-current-official-source-representative-proof.v1.json'
OUT_REVIEW = WORK / 'hero-stage4-2c-current-official-source-review.jpg'

LEON_DRIVE_ID = '1oPTSwW5O4UWxY6idqHDJ_smjPTm2Wsq1'
LEON_EXPECTED = {
    'sha256': '8d04d4858d8bbb8021cef1439183018293ff28659f42e486ae1306d8c5f616d1',
    'byteLength': 1316695,
    'width': 1443,
    'height': 2112,
}

CASES = [
    {
        'heroId': 6,
        'role': 'KNOWN_ADMITTED_ANCHOR',
        'label': 'Leon',
        'officialPage': 'https://mz.zlongame.com/OnLine_Download/index.html',
        'officialVariants': {
            'a1': 'https://mz.zlongame.com/OnLine_Download/images/icon/h3_a1.png',
            'a2': 'https://mz.zlongame.com/OnLine_Download/images/icon/h3_a2.png',
            'a3': 'https://mz.zlongame.com/OnLine_Download/images/icon/h3_a3.png',
            'big': 'https://mz.zlongame.com/OnLine_Download/images/icon/h3_big.png',
        },
    },
    {
        'heroId': 99265,
        'role': 'CURRENT_PENDING_REPRESENTATIVE',
        'label': 'Reiga',
        'officialPage': 'https://mz.zlongame.com/main.shtml',
        'officialVariants': {
            'a1': 'https://media.zlongame.com/media/pictures/cn/mz/home/2025/1030/h209_a1.png',
            'a2': 'https://media.zlongame.com/media/pictures/cn/mz/home/2025/1030/h209_a2.png',
            'a3': 'https://media.zlongame.com/media/pictures/cn/mz/home/2025/1030/h209_a3.png',
            'big': 'https://media.zlongame.com/media/pictures/cn/mz/home/2025/1030/h209_big.png',
        },
    },
]

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
})


def inspect_png(path: Path):
    raw = path.read_bytes()
    sig = raw[:8] == b'\x89PNG\r\n\x1a\n'
    info = {
        'byteLength': len(raw),
        'sha256': hashlib.sha256(raw).hexdigest(),
        'pngSignature': sig,
    }
    try:
        with Image.open(path) as im:
            im.load()
            info.update({
                'decodedFormat': im.format,
                'width': im.width,
                'height': im.height,
                'mode': im.mode,
            })
            alpha = 'A' in im.getbands()
            info['alpha'] = alpha
            if alpha:
                extrema = im.getchannel('A').getextrema()
                info['alphaExtrema'] = list(extrema)
                info['realTransparency'] = extrema[0] < 255
                info['visiblePixels'] = extrema[1] > 0
            else:
                info['alphaExtrema'] = None
                info['realTransparency'] = False
                info['visiblePixels'] = True
    except Exception as exc:
        info['decodeError'] = repr(exc)
    info['technicalPass'] = bool(
        info.get('pngSignature')
        and info.get('decodedFormat') == 'PNG'
        and info.get('width', 0) > 0
        and info.get('height', 0) > 0
        and info.get('alpha')
        and info.get('realTransparency')
        and info.get('visiblePixels')
    )
    return info


def download(url: str, path: Path):
    r = session.get(url, timeout=45, headers={'Referer': 'https://mz.zlongame.com/'})
    r.raise_for_status()
    path.write_bytes(r.content)
    return {
        'httpStatus': r.status_code,
        'contentType': r.headers.get('content-type'),
        'finalUrl': r.url,
    }


def normalized_preview(path: Path, box=(420, 520)):
    with Image.open(path) as im:
        im = im.convert('RGBA')
        alpha = im.getchannel('A')
        bbox = alpha.getbbox()
        if bbox:
            im = im.crop(bbox)
        bg = Image.new('RGB', box, 'white')
        im.thumbnail((box[0] - 20, box[1] - 50), Image.Resampling.LANCZOS)
        rgba_bg = Image.new('RGBA', box, 'white')
        x = (box[0] - im.width) // 2
        y = 35 + (box[1] - 45 - im.height) // 2
        rgba_bg.alpha_composite(im, (x, y))
        return rgba_bg.convert('RGB')


def make_contact_sheet(entries):
    cell_w, cell_h = 420, 560
    cols = 3
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell_w, rows * cell_h), 'white')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for idx, entry in enumerate(entries):
        x = (idx % cols) * cell_w
        y = (idx // cols) * cell_h
        preview = normalized_preview(entry['path'], (cell_w, cell_h - 20))
        sheet.paste(preview, (x, y + 20))
        draw.text((x + 5, y + 5), entry['label'], fill='black', font=font)
    sheet.save(OUT_REVIEW, quality=92)


# Known admitted source anchor direct re-read.
leon_drive_path = WORK / 'leon_stage2_drive.png'
result = gdown.download(id=LEON_DRIVE_ID, output=str(leon_drive_path), quiet=True)
if not result:
    raise RuntimeError('Failed to download known Leon Drive source')
leon_drive_info = inspect_png(leon_drive_path)
leon_drive_info['expectedMatch'] = all([
    leon_drive_info.get('sha256') == LEON_EXPECTED['sha256'],
    leon_drive_info.get('byteLength') == LEON_EXPECTED['byteLength'],
    leon_drive_info.get('width') == LEON_EXPECTED['width'],
    leon_drive_info.get('height') == LEON_EXPECTED['height'],
])

records = []
review_entries = [{'path': leon_drive_path, 'label': 'Leon frozen Drive source'}]
for case in CASES:
    variants = []
    for name, url in case['officialVariants'].items():
        path = WORK / f"{case['heroId']}_{name}.png"
        download_meta = {}
        try:
            download_meta = download(url, path)
            technical = inspect_png(path)
            review_entries.append({'path': path, 'label': f"{case['label']} official {name}"})
            state = 'PASS' if technical.get('technicalPass') else 'FAIL_TECHNICAL'
        except Exception as exc:
            technical = {'technicalPass': False, 'error': repr(exc)}
            state = 'DOWNLOAD_OR_DECODE_FAIL'
        variants.append({
            'variant': name,
            'url': url,
            'state': state,
            'download': download_meta,
            'technical': technical,
        })
    records.append({
        'heroId': case['heroId'],
        'role': case['role'],
        'label': case['label'],
        'officialPage': case['officialPage'],
        'variants': variants,
    })

make_contact_sheet(review_entries)
all_downloaded = all(v['state'] == 'PASS' for r in records for v in r['variants'])
summary = {
    'knownAnchorSourceReReadPass': leon_drive_info.get('expectedMatch') is True,
    'caseCount': len(records),
    'officialVariantCount': sum(len(r['variants']) for r in records),
    'officialTechnicalPassCount': sum(1 for r in records for v in r['variants'] if v['state'] == 'PASS'),
    'officialTechnicalFailureCount': sum(1 for r in records for v in r['variants'] if v['state'] != 'PASS'),
    'visualReviewRequired': True,
    'officialSourceAdmissionPerformed': False,
}
out = {
    'version': 1,
    'stage': 'hero-portrait-stage4-2c-current-unity-source-proof',
    'phase': 'CURRENT_OFFICIAL_SOURCE_REPRESENTATIVE_BYTE_PROOF',
    'status': 'PASS_TECHNICAL_VISUAL_REVIEW_PENDING' if all_downloaded and leon_drive_info.get('expectedMatch') else 'FAIL_OR_PARTIAL',
    'policy': {
        'candidateSourceKind': 'ZLONGAME_OFFICIAL_HERO_ART_PNG',
        'officialPublisherAssetOnly': True,
        'knownAnchorSourceReReadRequired': True,
        'visualRoleReviewRequiredBeforeSourceFamilyEnable': True,
        'nameOnlyJoinAllowed': False,
        'populationAdmissionPerformed': False,
        'materializationPerformed': False,
    },
    'knownAnchorSourceReRead': {
        'heroId': 6,
        'sourceImmutableId': LEON_DRIVE_ID,
        'technical': leon_drive_info,
    },
    'summary': summary,
    'records': records,
    'reviewArtifact': 'hero-stage4-2c-current-official-source-review.jpg',
}
OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
