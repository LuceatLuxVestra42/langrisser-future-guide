#!/usr/bin/env python3
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path('.')
TECH_PATH = REPO / 'data/validation/hero-portrait-stage4-1c-technical-admission.v1.json'
REVIEW_PATH = REPO / 'data/reviews/hero-portrait-stage4-1c-contact-sheet-visual-review.v1.json'
STAGE2_PATH = REPO / 'data/generated/hero-portrait-stage2-representative-resolution-proof.v1.json'
STAGE41B_PATH = REPO / 'data/generated/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json'
OUT_PATH = REPO / 'data/generated/hero-portrait-stage4-1c-mapped-source-admission.v1.json'
SUMMARY_PATH = REPO / 'data/validation/hero-portrait-stage4-1c-final-admission-summary.v1.json'
CHECKPOINT_PATH = REPO / 'data/checkpoints/hero-portrait-stage4-1c-mapped-source-admission.v1.json'


def load(path):
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def ordered_ids_hash(ids):
    return hashlib.sha256(','.join(str(x) for x in ids).encode('utf-8')).hexdigest()


def require(cond, message):
    if not cond:
        raise SystemExit(message)


def normalize_stage2(rec):
    return {
        'heroId': int(rec['heroId']),
        'sourceKind': 'GOOGLE_DRIVE_BASE_SKIN_PNG',
        'sourceImmutableId': rec['driveFileId'],
        'sourceFileName': rec['fileName'],
        'mimeType': rec['mimeType'],
        'byteLength': int(rec['byteLength']),
        'sha256': rec['sha256'],
        'width': int(rec['width']),
        'height': int(rec['height']),
        'alpha': True,
        'alphaExtrema': rec.get('alphaExtrema'),
        'sourceProvenance': rec['checks']['baseSkinProvenance'],
        'uiDecorationContamination': rec['checks']['uiDecorationContamination'],
        'identityEvidence': 'STAGE2_DIRECT_READBACK_PLUS_VISUAL_IDENTITY',
        'admissionState': 'ADMITTED_SOURCE',
        'admittedAtStage': 'HERO_PORTRAIT_STAGE2_REPRESENTATIVE_PROOF',
        'targetPath': f"public/images/heroes/cards/{int(rec['heroId'])}.png",
        'materializationPerformed': False,
    }


def normalize_stage41c(rec):
    return {
        'heroId': int(rec['heroId']),
        'sourceKind': 'GOOGLE_DRIVE_BASE_SKIN_PNG',
        'sourceImmutableId': rec['driveFileId'],
        'sourceFileName': rec['sourceFileName'],
        'mimeType': rec['mimeType'],
        'byteLength': int(rec['byteLength']),
        'sha256': rec['sha256'],
        'width': int(rec['width']),
        'height': int(rec['height']),
        'alpha': bool(rec['alpha']),
        'alphaExtrema': rec.get('alphaExtrema'),
        'sourceProvenance': rec['sourceProvenance'],
        'uiDecorationContamination': 'PASS_NONE_OBSERVED_BY_STAGE4_1C_CONTACT_SHEET_REVIEW',
        'identityEvidence': 'STAGE4_1B_EXACT_RUNTIME_STEM_OWNERSHIP_PLUS_STRUCTURED_BASE_PATH',
        'technicalAdmissionEvidence': 'PASS_STAGE3_BYTE_FORMAT_ALPHA_HASH_GATES',
        'visualReviewEvidence': 'PASS_STAGE4_1C_BATCH_CONTACT_SHEET_203_OF_203',
        'admissionState': 'ADMITTED_SOURCE',
        'admittedAtStage': 'HERO_PORTRAIT_STAGE4_1C_MAPPED_SOURCE_ADMISSION',
        'targetPath': f"public/images/heroes/cards/{int(rec['heroId'])}.png",
        'materializationPerformed': False,
    }


def main():
    tech = load(TECH_PATH)
    review = load(REVIEW_PATH)
    stage2 = load(STAGE2_PATH)
    stage41b = load(STAGE41B_PATH)

    require(tech['status'] == 'PASS_TECHNICAL_VISUAL_REVIEW_PENDING', 'technical validation status is not PASS')
    require(tech['summary']['mappedNotAdmittedInputCount'] == 203, 'technical input count mismatch')
    require(tech['summary']['downloadPassCount'] == 203, 'download pass count mismatch')
    require(tech['summary']['technicalPassCount'] == 203, 'technical pass count mismatch')
    require(tech['summary']['technicalFailureCount'] == 0, 'technical failures remain')
    require(tech['summary']['duplicateShaGroupCount'] == 0, 'duplicate SHA groups remain')
    require(not tech.get('duplicateShaGroups'), 'duplicate SHA group payload is not empty')
    require(len(tech['records']) == 203, 'technical record count mismatch')

    tech_records = sorted(tech['records'], key=lambda x: int(x['heroId']))
    tech_ids = [int(r['heroId']) for r in tech_records]
    tech_hash = ordered_ids_hash(tech_ids)
    for rec in tech_records:
        require(rec['downloadResult'] == 'PASS', f"download not PASS for hero {rec['heroId']}")
        require(rec['technicalResult'] == 'PASS_TECHNICAL_VISUAL_REVIEW_PENDING', f"technical result not PASS for hero {rec['heroId']}")
        require(all(rec['checks'].values()), f"technical check false for hero {rec['heroId']}")
        require(rec['pngSignature'] is True and rec['decodedFormat'] == 'PNG', f"PNG gate failed for hero {rec['heroId']}")
        require(rec['alpha'] is True and rec['realTransparency'] is True, f"alpha gate failed for hero {rec['heroId']}")

    require(review['status'] == 'PASS', 'visual review status is not PASS')
    require(review['coverage']['technicalPassHeroCount'] == 203, 'visual review technical coverage mismatch')
    require(review['coverage']['reviewedHeroCount'] == 203, 'visual review count mismatch')
    require(review['coverage']['contactSheetCount'] == 7, 'contact sheet count mismatch')
    require(review['coverage']['reviewedHeroIdsOrderedCsvSha256'] == tech_hash, 'visual review Hero ID set/hash mismatch')
    require(review['verdict']['visualGate'] == 'PASS_203_OF_203', 'visual gate not PASS')
    require(review['verdict']['visualReviewExceptions'] == 0, 'visual exceptions remain')

    require(stage2['status'] == 'PASS' and len(stage2['records']) == 5, 'Stage2 continuity is not 5 PASS records')
    stage2_records = [normalize_stage2(r) for r in stage2['records']]
    new_records = [normalize_stage41c(r) for r in tech_records]
    records = sorted(stage2_records + new_records, key=lambda x: int(x['heroId']))

    hero_counts = Counter(r['heroId'] for r in records)
    source_counts = Counter(r['sourceImmutableId'] for r in records)
    sha_to_heroes = defaultdict(list)
    for r in records:
        sha_to_heroes[r['sha256']].append(r['heroId'])
    duplicate_hero_ids = sorted(k for k, v in hero_counts.items() if v > 1)
    duplicate_source_ids = sorted(k for k, v in source_counts.items() if v > 1)
    duplicate_sha_groups = {sha: ids for sha, ids in sha_to_heroes.items() if len(set(ids)) > 1}

    require(not duplicate_hero_ids, 'duplicate Hero IDs in admitted registry')
    require(not duplicate_source_ids, 'duplicate immutable source IDs in admitted registry')
    require(not duplicate_sha_groups, 'cross-Hero duplicate source bytes in admitted registry')
    require(len(records) == 208, f"expected 208 admitted records, got {len(records)}")
    require(stage41b['summary']['remainingCanonicalWithoutStructuredExactMapping'] == 59, 'Stage4-1B pending count changed')

    summary = {
        'canonicalHeroCount': 267,
        'previousAdmittedSourceCount': 5,
        'stage41cNewAdmissionCount': 203,
        'canonicalAdmittedSourceCount': 208,
        'pendingCanonicalSourceCount': 59,
        'reviewSourceIdentityCount': 0,
        'rejectedSourceCount': 0,
        'duplicateHeroIdCount': 0,
        'duplicateImmutableSourceIdCount': 0,
        'duplicateShaGroupCount': 0,
        'materializedTargetCount': 0,
        'bulk267Ready': False,
        'hardErrorCount': 0,
    }

    out = {
        'version': 1,
        'stage': 'hero-portrait-stage4-1c-mapped-source-admission',
        'schemaId': 'hero-portrait-stage4-1c-mapped-source-admission/v1',
        'status': 'PASS',
        'completion': 'COMPLETE',
        'sourceContract': 'data/contracts/hero-portrait-stage3-extraction-contract.v1.json',
        'mappingSource': 'data/generated/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json',
        'technicalEvidence': str(TECH_PATH.relative_to(REPO)),
        'visualReviewEvidence': str(REVIEW_PATH.relative_to(REPO)),
        'admissionPolicy': {
            'ownershipRecomputed': False,
            'filenameTokensAuthoritative': False,
            'immutableDriveIdReadbackRequired': True,
            'byteFormatAlphaHashGatesRequired': True,
            'structuredBaseProvenanceRequired': True,
            'visualUiContaminationReviewRequired': True,
            'losslessMaterializationPerformed': False,
        },
        'summary': summary,
        'newAdmissionHeroIdsOrderedCsvSha256': tech_hash,
        'records': records,
    }
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    validation_summary = {
        'version': 1,
        'status': 'PASS',
        'summary': summary,
        'checks': {
            'stage41cTechnical203Of203': 'PASS',
            'stage41cVisual203Of203': 'PASS',
            'stage2AdmittedContinuity5Of5': 'PASS',
            'combinedRegistry208UniqueHeroIds': 'PASS',
            'combinedRegistry208UniqueImmutableSourceIds': 'PASS',
            'crossHeroDuplicateSha': 'PASS_NONE',
            'materializationPerformed': False,
            'bulk267Ready': False,
        },
    }
    SUMMARY_PATH.write_text(json.dumps(validation_summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    checkpoint = {
        'version': 1,
        'stage': 'hero-portrait-stage4-1c-mapped-source-admission',
        'schemaId': 'hero-portrait-stage4-1c-mapped-source-admission-checkpoint/v1',
        'status': 'PASS',
        'completion': 'COMPLETE',
        'freezeState': 'HERO_PORTRAIT_STAGE4_1C_MAPPED_SOURCE_ADMISSION_FROZEN',
        'source': str(OUT_PATH.relative_to(REPO)),
        'summary': summary,
        'checks': validation_summary['checks'],
        'nextStart': {
            'primary': 'HERO_PORTRAIT_STAGE4_2_UNCOVERED_SOURCE_FALLBACK_PROOF',
            'goal': 'Resolve the remaining 59 canonical Heroes without structured exact admitted Drive sources: 36 structured-tree exceptions plus the 23-Hero structured-tree count gap, without changing the 208 frozen admissions.',
            'bulkMaterializationBlockedUntil': 'ADMITTED_SOURCE_267_OF_267',
        },
    }
    CHECKPOINT_PATH.write_text(json.dumps(checkpoint, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(json.dumps({'status': 'PASS', **summary}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
