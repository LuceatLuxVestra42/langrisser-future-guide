import fs from 'node:fs';
import path from 'node:path';

const TARGETS = new Map([
  [136, { soldierId: 136, nameCn: '烬色卫队', nameKr: '잿빛 호위대', tier: 3, armyType: 'LANCER' }],
  [1039, { soldierId: 1039, nameCn: '断罪修女', nameKr: '단죄의 수녀', tier: 3, armyType: 'DEMON' }],
]);

const FILES = [
  'data/generated/soldier-list-stage5-8.v1.json',
  'data/generated/soldier-detail-stage5-2.v1.json',
  'public/data/soldier-detail-stage5-6.v1.json',
];

const clone = (value) => JSON.parse(JSON.stringify(value));

function collectSoldierRecords(root) {
  const records = new Map();
  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const value of node) visit(value);
      return;
    }
    if (!node || typeof node !== 'object') return;

    if (Number.isInteger(node.soldierId)) {
      const directNameCn = typeof node.nameCn === 'string' ? node.nameCn : null;
      const identityNameCn = typeof node.identity?.nameCn === 'string' ? node.identity.nameCn : null;
      if (directNameCn || identityNameCn) {
        if (!records.has(node.soldierId)) records.set(node.soldierId, node);
      }
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(root);
  return records;
}

function patchTargetObject(obj, target, context) {
  let changed = false;

  if (obj.soldierId === target.soldierId) {
    const cn = obj.nameCn ?? obj.identity?.nameCn ?? null;
    if (cn && cn !== target.nameCn) {
      throw new Error(`${context}: Soldier ${target.soldierId} Chinese name mismatch: ${cn}`);
    }
    const tier = obj.tier ?? obj.identity?.tier ?? null;
    if (tier != null && tier !== target.tier) {
      throw new Error(`${context}: Soldier ${target.soldierId} tier mismatch: ${tier}`);
    }
    const army = obj.armyType ?? obj.identity?.armyType ?? null;
    if (army != null && army !== target.armyType) {
      throw new Error(`${context}: Soldier ${target.soldierId} army mismatch: ${army}`);
    }

    if (obj.nameCn === target.nameCn) {
      obj.nameKr = target.nameKr;
      if ('nameKrStatus' in obj) obj.nameKrStatus = 'confirmed';
      if ('validationStatus' in obj) obj.validationStatus = 'PASS';
      changed = true;
    }

    if (obj.identity?.nameCn === target.nameCn) {
      obj.identity.nameKr = target.nameKr;
      if ('nameKrStatus' in obj.identity) obj.identity.nameKrStatus = 'confirmed';
      if ('validationStatus' in obj.identity) obj.identity.validationStatus = 'PASS';
      if ('validationStatus' in obj) obj.validationStatus = 'PASS';
      changed = true;
    }
  }

  return changed;
}

function patchJson(root, filePath) {
  const hits = new Map([...TARGETS.keys()].map((id) => [id, 0]));
  const beforeRecords = collectSoldierRecords(root);
  const immutableBefore = new Map();

  for (const [id, target] of TARGETS) {
    const record = beforeRecords.get(id);
    if (!record) throw new Error(`${filePath}: missing Soldier ${id}`);
    const nameCn = record.nameCn ?? record.identity?.nameCn;
    const tier = record.tier ?? record.identity?.tier;
    const armyType = record.armyType ?? record.identity?.armyType;
    if (nameCn !== target.nameCn || tier !== target.tier || armyType !== target.armyType) {
      throw new Error(`${filePath}: target identity mismatch for ${id}: ${JSON.stringify({ nameCn, tier, armyType })}`);
    }
    immutableBefore.set(id, {
      soldierId: record.soldierId,
      nameCn,
      tier,
      armyType,
      release: clone(record.release ?? null),
      sortBucket: record.sortBucket ?? null,
      stats: clone(record.stats ?? null),
      normalSoldierId: record.normalSoldierId ?? record.identity?.normalSoldierId ?? null,
      spSoldierId: record.spSoldierId ?? record.identity?.spSoldierId ?? null,
    });
  }

  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const value of node) visit(value);
      return;
    }
    if (!node || typeof node !== 'object') return;

    for (const [id, target] of TARGETS) {
      if (patchTargetObject(node, target, filePath)) hits.set(id, hits.get(id) + 1);
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(root);

  for (const [id, count] of hits) {
    if (count < 1) throw new Error(`${filePath}: no localization field patched for Soldier ${id}`);
  }

  const afterRecords = collectSoldierRecords(root);
  for (const [id, target] of TARGETS) {
    const record = afterRecords.get(id);
    const nameKr = record.nameKr ?? record.identity?.nameKr;
    const nameKrStatus = record.nameKrStatus ?? record.identity?.nameKrStatus;
    const validationStatus = record.validationStatus ?? record.identity?.validationStatus;
    if (nameKr !== target.nameKr) throw new Error(`${filePath}: Korean name did not apply for ${id}`);
    if (nameKrStatus !== 'confirmed') throw new Error(`${filePath}: nameKrStatus is not confirmed for ${id}: ${nameKrStatus}`);
    if (validationStatus && validationStatus !== 'PASS') throw new Error(`${filePath}: validationStatus is not PASS for ${id}: ${validationStatus}`);

    const immutableAfter = {
      soldierId: record.soldierId,
      nameCn: record.nameCn ?? record.identity?.nameCn,
      tier: record.tier ?? record.identity?.tier,
      armyType: record.armyType ?? record.identity?.armyType,
      release: clone(record.release ?? null),
      sortBucket: record.sortBucket ?? null,
      stats: clone(record.stats ?? null),
      normalSoldierId: record.normalSoldierId ?? record.identity?.normalSoldierId ?? null,
      spSoldierId: record.spSoldierId ?? record.identity?.spSoldierId ?? null,
    };
    if (JSON.stringify(immutableBefore.get(id)) !== JSON.stringify(immutableAfter)) {
      throw new Error(`${filePath}: non-localization fields changed for Soldier ${id}`);
    }
  }

  // Keep the existing identity-quality summary synchronized when present.
  if (root.summary && Object.prototype.hasOwnProperty.call(root.summary, 'nonPassIdentityMetadataCount')) {
    const unique = collectSoldierRecords(root);
    let nonPass = 0;
    for (const record of unique.values()) {
      const status = record.validationStatus ?? record.identity?.validationStatus ?? null;
      if (status && status !== 'PASS') nonPass += 1;
    }
    root.summary.nonPassIdentityMetadataCount = nonPass;
  }

  return { hits: Object.fromEntries(hits) };
}

const results = {};
for (const filePath of FILES) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing active Soldier data file: ${filePath}`);
  const root = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  results[filePath] = patchJson(root, filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(root, null, 2)}\n`);
}

const list = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
if (!Array.isArray(list.records) || list.records.length !== 224) {
  throw new Error(`Canonical Soldier list count changed: ${list.records?.length}`);
}
const normalCount = list.records.filter((r) => !r.isSp).length;
const spCount = list.records.filter((r) => r.isSp).length;
const t3 = list.records.filter((r) => !r.isSp && r.tier === 3);
const t3Resolved = t3.filter((r) => typeof r.nameKr === 'string' && r.nameKr.length > 0 && r.nameKrStatus === 'confirmed');
const t3Missing = t3.filter((r) => !(typeof r.nameKr === 'string' && r.nameKr.length > 0));

if (normalCount !== 168 || spCount !== 56 || t3.length !== 129) {
  throw new Error(`Canonical cardinality changed: normal=${normalCount} sp=${spCount} t3=${t3.length}`);
}
if (t3Missing.length !== 0 || t3Resolved.length !== 129) {
  throw new Error(`T3 Korean localization not complete: resolved=${t3Resolved.length}/129 missing=${t3Missing.map((r) => r.soldierId).join(',')}`);
}

for (const target of TARGETS.values()) {
  const row = list.records.find((r) => r.soldierId === target.soldierId);
  if (!row || row.nameCn !== target.nameCn || row.nameKr !== target.nameKr || row.nameKrStatus !== 'confirmed' || row.validationStatus !== 'PASS') {
    throw new Error(`Final list validation failed for Soldier ${target.soldierId}`);
  }
}

const evidence = {
  version: 1,
  status: 'PASS',
  scope: 'T3 Soldier Korean localization only',
  source: '랑그릿사_3티어_용병_한섭명_확정_매핑.txt (user-updated exact rows)',
  mappings: [...TARGETS.values()],
  files: results,
  coverage: {
    canonicalSoldierCount: list.records.length,
    normalCount,
    spCount,
    normalTier3Count: t3.length,
    normalTier3KoreanNameConfirmedCount: t3Resolved.length,
    normalTier3KoreanNameMissingCount: t3Missing.length,
  },
  invariants: {
    chineseNamesUnchanged: true,
    idsUnchanged: true,
    tiersUnchanged: true,
    armyTypesUnchanged: true,
    releaseMetadataUnchanged: true,
    statsUnchanged: true,
    relationsUnchanged: true,
  },
};

fs.mkdirSync('data/validation', { recursive: true });
fs.mkdirSync('data/checkpoints', { recursive: true });
fs.writeFileSync('data/validation/soldier-t3-korean-names-136-1039.v1.json', `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync('data/checkpoints/soldier-t3-korean-names-136-1039.txt', [
  'Soldier T3 Korean Name Finalization — PASS',
  '',
  'Scope: localization only; no canonical relation/stat/release changes.',
  'Source: 랑그릿사_3티어_용병_한섭명_확정_매핑.txt (user-updated exact rows)',
  '',
  '- 136 / 烬色卫队 / LANCER -> 잿빛 호위대',
  '- 1039 / 断罪修女 / DEMON -> 단죄의 수녀',
  '',
  `Canonical Soldier: ${list.records.length}`,
  `Normal: ${normalCount}`,
  `SP: ${spCount}`,
  `Normal T3 Korean names: ${t3Resolved.length}/${t3.length}`,
  `Normal T3 Korean missing: ${t3Missing.length}`,
  '',
  'LIST_DETAIL_PUBLIC_IDENTITY_SYNCHRONIZED',
  'T3_KOREAN_LOCALIZATION_129_OF_129',
].join('\n') + '\n');

console.log(JSON.stringify(evidence, null, 2));
