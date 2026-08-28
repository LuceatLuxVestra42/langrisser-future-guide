#!/usr/bin/env python3
import json
from pathlib import Path
from collections import defaultdict

ROOT = Path('.')

def load(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

def stem_from_prefab(path):
    name = Path(path).name
    return name[:-7] if name.lower().endswith('.prefab') else name

def base_root(filename):
    suffix = '_idle_Normal_default.png'
    if filename.endswith(suffix):
        return filename[:-len(suffix)]
    return None

admission = load('data/generated/hero-portrait-stage4-1c-mapped-source-admission.v1.json')
artwork = load('data/generated/hero-card-artwork-stage4.v1.json')
map41b = load('data/generated/hero-portrait-stage4-1b-structured-drive-bulk-mapping.v1.json')
skins = load('data/generated/skin-stage3-1-asset-inventory.v1.json')

admitted = {int(r['heroId']) for r in admission['records']}
art_by_id = {int(r['heroId']): r for r in artwork['records']}
all_ids = set(art_by_id)
pending = sorted(all_ids - admitted)

skin_count = defaultdict(int)
skin_stems = defaultdict(list)
for r in skins['records']:
    hid = int(r['heroId'])
    skin_count[hid] += 1
    p = r.get('spine', {}).get('sourceSpinePath')
    if p:
        skin_stems[hid].append(stem_from_prefab(p).removesuffix('_Prefab'))

structured_exceptions = []
known_ownership_ids = set()
locator_candidate_rows = []
for row in map41b['records']:
    state = row['mappingState']
    if state in ('BRIDGE_PROVEN_MAPPING_ALREADY_ADMITTED','BRIDGE_PROVEN_MAPPING_NOT_ADMITTED'):
        continue
    compact = {
        'rarity': row['rarity'],
        'driveGroupPath': row['driveGroupPath'],
        'driveHeroFolderLabel': row['driveHeroFolderLabel'],
        'heroId': row.get('heroId'),
        'ownershipState': row['ownershipState'],
        'mappingState': state,
        'baseCandidates': row.get('baseCandidates', []),
    }
    hid = row.get('heroId')
    if hid is not None:
        hid = int(hid)
        known_ownership_ids.add(hid)
        a = art_by_id.get(hid)
        compact['sourceArtworkPath'] = a.get('sourceArtworkPath') if a else None
        compact['sourceArtworkStem'] = stem_from_prefab(a['sourceArtworkPath']) if a else None
        compact['skinRecordCount'] = skin_count.get(hid, 0)
        compact['skinRuntimeStems'] = sorted(set(skin_stems.get(hid, [])))
    else:
        # Discovery-only exact base-root concordance against pending canonical artwork stems.
        roots = sorted({base_root(c.get('driveFileName','')) for c in row.get('baseCandidates', []) if base_root(c.get('driveFileName',''))})
        candidates = []
        for phid in pending:
            pstem = stem_from_prefab(art_by_id[phid]['sourceArtworkPath'])
            for root in roots:
                if root == pstem:
                    candidates.append({'heroId': phid, 'sourceArtworkStem': pstem, 'baseRoot': root, 'matchType': 'EXACT_ROOT_EQUAL'})
                elif root.startswith(pstem + '_') or pstem.startswith(root + '_'):
                    candidates.append({'heroId': phid, 'sourceArtworkStem': pstem, 'baseRoot': root, 'matchType': 'PREFIX_VARIANT'})
        compact['discoveryOnlyLocatorConcordance'] = candidates
        if candidates:
            locator_candidate_rows.append({'driveGroupPath': row['driveGroupPath'], 'candidates': candidates})
    structured_exceptions.append(compact)

# Correlation audit on already admitted sources; informational only.
concordance = defaultdict(int)
concordance_examples = defaultdict(list)
for r in admission['records']:
    hid = int(r['heroId'])
    pstem = stem_from_prefab(art_by_id[hid]['sourceArtworkPath'])
    root = base_root(r['sourceFileName'])
    if root == pstem:
        cls = 'EXACT_ROOT_EQUAL'
    elif root and (root.startswith(pstem + '_') or pstem.startswith(root + '_')):
        cls = 'PREFIX_VARIANT'
    else:
        cls = 'NO_SIMPLE_CONCORDANCE'
    concordance[cls] += 1
    if len(concordance_examples[cls]) < 10:
        concordance_examples[cls].append({'heroId': hid, 'sourceArtworkStem': pstem, 'sourceFileRoot': root})

known_structured_pending = sorted(known_ownership_ids & set(pending))
unassigned_pending = sorted(set(pending) - set(known_structured_pending))

out = {
    'version': 1,
    'stage': 'hero-portrait-stage4-2-uncovered-source-fallback-proof',
    'phase': 'GAP_INVENTORY',
    'status': 'PASS_WITH_REVIEW',
    'policy': {
        'frozenAdmissionRegistryReused': True,
        'recompute208Admissions': False,
        'nameJoinAllowed': False,
        'sourceArtworkLocatorAuthority': 'DISCOVERY_ONLY_NOT_BITMAP_OR_OWNERSHIP_PROOF',
        'locatorConcordanceCanAdmitSource': False,
    },
    'summary': {
        'canonicalHeroCount': len(all_ids),
        'admittedSourceCount': len(admitted),
        'pendingHeroCount': len(pending),
        'structuredExceptionRowCount': len(structured_exceptions),
        'structuredOwnershipProvenPendingHeroCount': len(known_structured_pending),
        'structuredUnresolvedOwnershipRowCount': sum(1 for r in structured_exceptions if r['heroId'] is None),
        'pendingWithoutAuthoritativeStructuredOwnershipCount': len(unassigned_pending),
        'locatorConcordanceRowCountDiscoveryOnly': len(locator_candidate_rows),
    },
    'pendingHeroIds': pending,
    'structuredOwnershipProvenPendingHeroIds': known_structured_pending,
    'pendingWithoutAuthoritativeStructuredOwnershipHeroIds': unassigned_pending,
    'admittedArtworkFilenameConcordanceAudit': {
        'authority': 'NON_AUTHORITATIVE_CORRELATION_AUDIT_ONLY',
        'counts': dict(sorted(concordance.items())),
        'examples': dict(concordance_examples),
    },
    'structuredExceptions': structured_exceptions,
    'discoveryOnlyLocatorCandidateRows': locator_candidate_rows,
}

p = ROOT / 'data/validation/hero-portrait-stage4-2-gap-inventory.v1.json'
p.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(out['summary'], ensure_ascii=False, indent=2))
