#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path

import gdown
import requests
from gdown.download_folder import _GoogleDriveFile, _parse_embedded_folder_view
from PIL import Image, ImageDraw

RARITY_FOLDER_IDS = {
    'LLR': '1_ohdOz7yowi98AE7MuyORMAFkxeGk5GV',
    'SSR': '1LZou2oXpeOwtt2uBHWpesKN4uyMUGoOe',
}
PNG_SIG = b'\x89PNG\r\n\x1a\n'
USER_AGENT = 'Mozilla/5.0 AppleWebKit/537.36 Chrome/98 Safari/537.36'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def session():
    s = requests.Session()
    s.headers.update({'User-Agent': USER_AGENT})
    return s


def list_folder(sess, folder_id):
    return _parse_embedded_folder_view(sess=sess, folder_id=folder_id)


def validate_png(path):
    data = path.read_bytes()
    out = {
        'byteLength': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'pngSignature': data.startswith(PNG_SIG),
    }
    try:
        with Image.open(path) as im:
            im.load()
            out['decodedFormat'] = im.format
            out['width'], out['height'] = im.size
            out['mode'] = im.mode
            bands = im.getbands()
            out['bands'] = list(bands)
            has_alpha = 'A' in bands
            out['alpha'] = has_alpha
            if has_alpha:
                a = im.getchannel('A')
                out['alphaExtrema'] = list(a.getextrema())
                out['realTransparency'] = a.getextrema()[0] < 255
                out['visiblePixels'] = a.getextrema()[1] > 0
            else:
                out['alphaExtrema'] = None
                out['realTransparency'] = False
                out['visiblePixels'] = True
    except Exception as exc:
        out['decodeError'] = f'{type(exc).__name__}: {exc}'
        out['decodedFormat'] = None
        out['width'] = out['height'] = 0
        out['alpha'] = False
        out['realTransparency'] = False
        out['visiblePixels'] = False
    checks = {
        'pngSignature': out.get('pngSignature') is True,
        'decodedPng': out.get('decodedFormat') == 'PNG',
        'positiveDimensions': out.get('width', 0) > 0 and out.get('height', 0) > 0,
        'alphaPresent': out.get('alpha') is True,
        'realTransparency': out.get('realTransparency') is True,
        'visiblePixels': out.get('visiblePixels') is True,
        'byteLengthPositive': out.get('byteLength', 0) > 0,
        'sha256Present': len(out.get('sha256', '')) == 64,
    }
    out['checks'] = checks
    out['technicalPass'] = all(checks.values())
    return out


def make_sheet(records, out_path):
    tiles = []
    for rec in records:
        for c in rec['candidates']:
            if c.get('downloadResult') != 'PASS':
                continue
            p = Path(c['localPath'])
            try:
                im = Image.open(p).convert('RGBA')
            except Exception:
                continue
            canvas = Image.new('RGBA', (320, 400), (245,245,245,255))
            thumb = im.copy()
            thumb.thumbnail((300, 330))
            x = (320-thumb.width)//2
            y = 8 + (330-thumb.height)//2
            canvas.alpha_composite(thumb, (x,y))
            d = ImageDraw.Draw(canvas)
            d.text((8,345), f"Hero {rec['heroId']} | {rec['driveGroupPath']}", fill=(0,0,0,255))
            d.text((8,365), c['fileName'][:45], fill=(0,0,0,255))
            d.text((8,383), f"tech={'PASS' if c['technical']['technicalPass'] else 'FAIL'}", fill=(0,0,0,255))
            tiles.append(canvas.convert('RGB'))
    if not tiles:
        return 0
    cols = 3
    rows = (len(tiles)+cols-1)//cols
    sheet = Image.new('RGB', (cols*320, rows*400), (255,255,255))
    for i,t in enumerate(tiles):
        sheet.paste(t, ((i%cols)*320, (i//cols)*400))
    sheet.save(out_path, quality=92)
    return len(tiles)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo-root', default='.')
    ap.add_argument('--work-dir', required=True)
    ap.add_argument('--review-dir', required=True)
    args = ap.parse_args()
    root = Path(args.repo_root)
    work = Path(args.work_dir); work.mkdir(parents=True, exist_ok=True)
    review = Path(args.review_dir); review.mkdir(parents=True, exist_ok=True)

    gap = load(root/'data/validation/hero-portrait-stage4-2-gap-inventory.v1.json')
    rows = [r for r in gap['structuredExceptions'] if r.get('heroId') is not None]
    if len(rows) != 7:
        raise SystemExit(f'expected 7 ownership-proven exceptions, got {len(rows)}')

    root_sess = session()
    root_children = {}
    for rarity, fid in RARITY_FOLDER_IDS.items():
        _, children = list_folder(root_sess, fid)
        root_children[rarity] = [c for c in children if c[2] == _GoogleDriveFile.TYPE_FOLDER]

    results = []
    for row in rows:
        rarity = row['rarity']
        label = row['driveHeroFolderLabel']
        hero_matches = [c for c in root_children[rarity] if c[1] == label]
        rec = {
            'heroId': int(row['heroId']),
            'rarity': rarity,
            'driveGroupPath': row['driveGroupPath'],
            'priorMappingState': row['mappingState'],
            'heroFolderLocatorCount': len(hero_matches),
            'candidates': [],
        }
        if len(hero_matches) != 1:
            rec['result'] = 'FAIL_HERO_FOLDER_LOCATOR'
            results.append(rec); continue
        hero_folder_id = hero_matches[0][0]
        rec['heroFolderId'] = hero_folder_id
        sess = session()
        _, hero_children = list_folder(sess, hero_folder_id)
        skin = [c for c in hero_children if c[2] == _GoogleDriveFile.TYPE_FOLDER and c[1] == '스킨']
        rec['skinContainerCount'] = len(skin)
        if len(skin) != 1:
            rec['result'] = 'FAIL_SKIN_CONTAINER'
            results.append(rec); continue
        rec['skinFolderId'] = skin[0][0]
        _, skin_children = list_folder(sess, skin[0][0])
        base = [c for c in skin_children if c[2] == _GoogleDriveFile.TYPE_FOLDER and c[1] == '기본']
        rec['baseFolderCount'] = len(base)
        if len(base) != 1:
            rec['result'] = 'FAIL_BASE_FOLDER'
            results.append(rec); continue
        rec['baseFolderId'] = base[0][0]
        _, base_children = list_folder(sess, base[0][0])
        files = [c for c in base_children if c[2] != _GoogleDriveFile.TYPE_FOLDER]
        rec['directBaseFileCount'] = len(files)
        for file_id, file_name, _ in files:
            target = work / f"{rec['heroId']}-{file_id}.bin"
            cand = {'driveFileId': file_id, 'fileName': file_name}
            try:
                got = gdown.download(id=file_id, output=str(target), quiet=True)
                if got and target.exists() and target.stat().st_size > 0:
                    cand['downloadResult'] = 'PASS'
                    cand['localPath'] = str(target)
                    cand['technical'] = validate_png(target)
                else:
                    cand['downloadResult'] = 'FAIL'
                    cand['error'] = 'gdown returned no usable file'
            except Exception as exc:
                cand['downloadResult'] = 'FAIL'
                cand['error'] = f'{type(exc).__name__}: {exc}'
            rec['candidates'].append(cand)
        tech_pass = [c for c in rec['candidates'] if c.get('downloadResult') == 'PASS' and c.get('technical',{}).get('technicalPass')]
        rec['technicalPassCandidateCount'] = len(tech_pass)
        if len(tech_pass) == 1:
            rec['result'] = 'ONE_TECHNICAL_PASS_CANDIDATE_VISUAL_REVIEW_REQUIRED'
        elif len(tech_pass) == 0:
            rec['result'] = 'NO_TECHNICAL_PASS_CANDIDATE'
        else:
            rec['result'] = 'MULTIPLE_TECHNICAL_PASS_CANDIDATES_REVIEW_REQUIRED'
        results.append(rec)

    sheet_count = make_sheet(results, review/'hero-stage4-2-known-ownership-rescue.jpg')
    summary = {
        'ownershipProvenInputCount': len(results),
        'oneTechnicalPassCandidateCount': sum(r['result'].startswith('ONE_') for r in results),
        'multipleTechnicalPassCandidateCount': sum(r['result'].startswith('MULTIPLE_') for r in results),
        'noTechnicalPassCandidateCount': sum(r['result'].startswith('NO_') for r in results),
        'locatorFailureCount': sum(r['result'].startswith('FAIL_') for r in results),
        'visualCandidateTileCount': sheet_count,
        'finalAdmissionPerformed': False,
    }
    out = {
        'version': 1,
        'stage': 'hero-portrait-stage4-2-uncovered-source-fallback-proof',
        'phase': 'KNOWN_OWNERSHIP_BASE_FOLDER_RESCUE',
        'status': 'PASS_WITH_REVIEW',
        'policy': {
            'heroOwnershipRecomputed': False,
            'heroOwnershipSource': 'STAGE4_1B_FROZEN_EXACT_SKIN_RUNTIME_OWNERSHIP',
            'filenameSelectorUsedForAdmission': False,
            'allDirectBaseFolderFilesEvaluated': True,
            'stage3TechnicalGatesApplied': True,
            'visualReviewRequired': True,
        },
        'summary': summary,
        'records': results,
    }
    p = root/'data/validation/hero-portrait-stage4-2-known-ownership-rescue.v1.json'
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
