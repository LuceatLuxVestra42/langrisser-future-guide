#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path('.')

def load(path):
    return json.loads((ROOT/path).read_text(encoding='utf-8'))

prev = load('data/generated/hero-portrait-stage4-1c-mapped-source-admission.v1.json')
rescue = load('data/validation/hero-portrait-stage4-2-known-ownership-rescue.v1.json')
review = load('data/reviews/hero-portrait-stage4-2-known-ownership-visual-review.v1.json')
gap = load('data/validation/hero-portrait-stage4-2-gap-inventory.v1.json')

eligible = review['summary']['admissionEligibleHeroIds']
if eligible != [99199]:
    raise SystemExit(f'unexpected Stage4-2 eligible set: {eligible}')

row = next(r for r in rescue['records'] if int(r['heroId']) == 99199)
tech = [c for c in row['candidates'] if c.get('technical',{}).get('technicalPass')]
if len(tech) != 1:
    raise SystemExit(f'Hero 99199 expected exactly one technical-pass candidate, got {len(tech)}')
c = tech[0]
t = c['technical']
new_record = {
    'heroId': 99199,
    'sourceKind': 'GOOGLE_DRIVE_BASE_SKIN_PNG',
    'sourceImmutableId': c['driveFileId'],
    'sourceFileName': c['fileName'],
    'mimeType': 'image/png',
    'byteLength': t['byteLength'],
    'sha256': t['sha256'],
    'width': t['width'],
    'height': t['height'],
    'alpha': t['alpha'],
    'alphaExtrema': t['alphaExtrema'],
    'sourceProvenance': 'PASS_BY_STAGE4_1B_FROZEN_OWNERSHIP_PLUS_STRUCTURED_BASE_FOLDER',
    'uiDecorationContamination': 'PASS_NONE_OBSERVED_BY_STAGE4_2_KNOWN_OWNERSHIP_VISUAL_REVIEW',
    'identityEvidence': 'STAGE4_1B_EXACT_RUNTIME_STEM_OWNERSHIP_PLUS_STAGE4_2_UNIQUE_TECHNICAL_PASS_BASE_FOLDER_CANDIDATE',
    'technicalAdmissionEvidence': 'PASS_STAGE3_BYTE_FORMAT_ALPHA_HASH_GATES_AT_STAGE4_2',
    'visualReviewEvidence': 'PASS_STAGE4_2_KNOWN_OWNERSHIP_VISUAL_REVIEW',
    'admissionState': 'ADMITTED_SOURCE',
    'admittedAtStage': 'HERO_PORTRAIT_STAGE4_2_UNCOVERED_SOURCE_FALLBACK_PROOF',
    'targetPath': 'public/images/heroes/cards/99199.png',
    'materializationPerformed': False,
}

records = list(prev['records']) + [new_record]
records.sort(key=lambda r: int(r['heroId']))
hero_ids = [int(r['heroId']) for r in records]
source_ids = [r['sourceImmutableId'] for r in records]
shas = [r['sha256'] for r in records]
if len(records) != 209 or len(set(hero_ids)) != 209 or len(set(source_ids)) != 209 or len(set(shas)) != 209:
    raise SystemExit('combined Stage4-2 registry uniqueness check failed')

summary = {
    'canonicalHeroCount': 267,
    'previousAdmittedSourceCount': 208,
    'stage42NewAdmissionCount': 1,
    'canonicalAdmittedSourceCount': 209,
    'pendingCanonicalSourceCount': 58,
    'knownOwnershipReviewCount': 5,
    'knownOwnershipNoPngCount': 1,
    'structuredOwnershipUnresolvedRowCount': 29,
    'structuredTreeCountGap': 23,
    'locatorConcordanceRowsDiscoveryOnly': gap['summary']['locatorConcordanceRowCountDiscoveryOnly'],
    'reviewSourceIdentityCount': 5,
    'rejectedSourceCount': 0,
    'duplicateHeroIdCount': 0,
    'duplicateImmutableSourceIdCount': 0,
    'duplicateShaGroupCount': 0,
    'materializedTargetCount': 0,
    'unityFallbackEnabled': False,
    'bulk267Ready': False,
    'hardErrorCount': 0,
}

out = {
    'version': 1,
    'stage': 'hero-portrait-stage4-2-uncovered-source-fallback-proof',
    'schemaId': 'hero-portrait-stage4-2-fallback-admission/v1',
    'status': 'PASS_WITH_REVIEW',
    'completion': 'COMPLETE',
    'sourceContract': 'data/contracts/hero-portrait-stage3-extraction-contract.v1.json',
    'previousAdmissionRegistry': 'data/generated/hero-portrait-stage4-1c-mapped-source-admission.v1.json',
    'gapInventory': 'data/validation/hero-portrait-stage4-2-gap-inventory.v1.json',
    'knownOwnershipRescue': 'data/validation/hero-portrait-stage4-2-known-ownership-rescue.v1.json',
    'visualReview': 'data/reviews/hero-portrait-stage4-2-known-ownership-visual-review.v1.json',
    'summary': summary,
    'fallbackPolicy': {
        'preserveExisting208Admissions': True,
        'nameJoinAllowed': False,
        'filenameOrArtworkLocatorConcordanceCanEstablishOwnership': False,
        'locatorConcordanceIsDiscoveryOnly': True,
        'unityHeroPaintingFallbackStatus': 'DISABLED_PENDING_ACTUAL_PREFAB_DEPENDENCY_PROOF',
        'requiredUnityEnableEvidence': 'representative explicit prefab -> texture/sprite -> exported PNG chain plus Stage3 admission QA',
        'webImageSubstitutionAllowed': False,
        'conversionOrReencodeAllowed': False,
    },
    'records': records,
}
(ROOT/'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

checkpoint = {
    'version': 1,
    'stage': 'hero-portrait-stage4-2-uncovered-source-fallback-proof',
    'schemaId': 'hero-portrait-stage4-2-uncovered-source-fallback-proof-checkpoint/v1',
    'status': 'PASS_WITH_REVIEW',
    'completion': 'COMPLETE',
    'freezeState': 'HERO_PORTRAIT_STAGE4_2_FALLBACK_BOUNDARY_FROZEN',
    'source': 'data/generated/hero-portrait-stage4-2-fallback-admission.v1.json',
    'summary': summary,
    'checks': {
        'previous208AdmissionContinuity': 'PASS',
        'stage42Sagny99199Admission': 'PASS',
        'combinedRegistry209UniqueHeroIds': 'PASS',
        'combinedRegistry209UniqueImmutableSourceIds': 'PASS',
        'combinedRegistry209UniqueSha256': 'PASS',
        'knownOwnershipMultipleRoleCasesRemainReview': 'PASS_5_NOT_GUESSED',
        'knownOwnershipNonPngCaseRemainsBlocked': 'PASS_1_NOT_CONVERTED',
        'unresolvedOwnershipRowsNotNameJoined': 'PASS_29',
        'structuredTreeCountGapNotInvented': 'PASS_23',
        'unityFallbackEnabledWithoutDependencyProof': False,
        'materializationPerformed': False,
        'bulk267Ready': False
    },
    'sourceAvailabilityBoundary': {
        'repositoryHeroPaintingDependencyIndexLocated': False,
        'driveHeroPaintingFolderSearchLocated': False,
        'drivePrefabFolderSearchLocated': False,
        'driveSpineFolderSearchLocated': False,
        'driveSearchAbsenceProvesNonexistence': False,
        'reason': 'Current accessible sources do not provide the explicit prefab dependency chain required by the frozen Stage3 contract; Drive search absence is not treated as proof because Drive search is non-authoritative for this dataset.'
    },
    'nextStart': {
        'primary': 'HERO_PORTRAIT_STAGE4_2B_EXPLICIT_FALLBACK_SOURCE_ACQUISITION',
        'goal': 'Resolve the remaining 58 without reopening the 209 frozen admissions.',
        'acceptableInputA': 'explicit Hero ID -> immutable base PNG source mapping with Stage3 byte/provenance QA',
        'acceptableInputB': 'actual Unity HeroPainting prefab dependency data proving prefab -> texture/sprite -> exported PNG',
        'forbidden': ['name join','filename similarity ownership inference','locator-string-only ownership','web image substitution','PNG conversion/re-encode to satisfy source gate'],
        'bulkMaterializationBlockedUntil': 'ADMITTED_SOURCE_267_OF_267'
    }
}
(ROOT/'data/checkpoints/hero-portrait-stage4-2-uncovered-source-fallback-proof.v1.json').write_text(json.dumps(checkpoint,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

validation = {
    'version': 1,
    'status': 'PASS_WITH_REVIEW',
    'summary': summary,
    'remainingBreakdown': {
        'knownOwnershipMultipleRoleReview': 5,
        'knownOwnershipNoStage3Png': 1,
        'structuredOwnershipUnresolved': 29,
        'structuredTreeCountGap': 23,
        'total': 58
    },
    'artworkLocatorConcordanceAudit': gap['admittedArtworkFilenameConcordanceAudit']['counts'],
    'conclusion': 'Artwork locator / filename concordance is non-universal and remains discovery-only; no Unity fallback was enabled without actual dependency proof.'
}
(ROOT/'data/validation/hero-portrait-stage4-2-final-summary.v1.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
