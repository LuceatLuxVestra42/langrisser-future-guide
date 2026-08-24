const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const generatedDir = path.join(dataDir, 'generated');
const validationDir = path.join(dataDir, 'validation');

const contractPath = path.join(dataDir, 'hero-page-stage3-4.v1.json');
const masterPath = path.join(dataDir, 'hero-name-master.v1.json');
const normalStagePath = path.join(dataDir, 'hero-normal-stage3-2.v1.json');
const spStagePath = path.join(dataDir, 'hero-sp-stage3-3.v1.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function tryLoadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, reason: 'missing-file', data: null };
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return { ok: false, reason: 'empty-file', data: null };
    return { ok: true, reason: null, data: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function effectiveName(hero, contract) {
  const override = (contract.temporaryNameOverrides || []).find((item) => item.heroId === hero.heroId);
  return override?.effectiveNameKr || hero.nameKr;
}

function recordsOf(container) {
  return Array.isArray(container?.records) ? container.records : [];
}

function indexByHeroId(records) {
  const map = new Map();
  const duplicates = new Set();
  for (const record of records) {
    if (!record || !Number.isInteger(record.heroId)) continue;
    if (map.has(record.heroId)) duplicates.add(record.heroId);
    else map.set(record.heroId, record);
  }
  return { map, duplicates: [...duplicates].sort((a, b) => a - b) };
}

function collectIds(value, keys) {
  const out = [];
  for (const key of keys) {
    const list = value?.[key];
    if (Array.isArray(list)) {
      for (const item of list) {
        if (Number.isInteger(item)) out.push(item);
        else if (item && Number.isInteger(item.id)) out.push(item.id);
      }
    }
  }
  return out;
}

function hasHardNormalRelationError(record) {
  if (!record) return ['missing normal normalized record'];
  const errors = [];
  if (record.relationErrors && Array.isArray(record.relationErrors) && record.relationErrors.length) {
    errors.push(...record.relationErrors.map((item) => `normal relation error: ${String(item)}`));
  }
  if (record.missingJobIds && record.missingJobIds.length) {
    errors.push(`missing Job IDs: ${record.missingJobIds.join(', ')}`);
  }
  if (record.missingSkillIds && record.missingSkillIds.length) {
    errors.push(`missing Skill IDs: ${record.missingSkillIds.join(', ')}`);
  }
  return errors;
}

function hasHardSpRelationError(record) {
  if (!record) return [];
  const errors = [];
  if (record.relationErrors && Array.isArray(record.relationErrors) && record.relationErrors.length) {
    errors.push(...record.relationErrors.map((item) => `SP relation error: ${String(item)}`));
  }
  const missions = [
    ...(record.firstStageMissions || record.chapter1Missions || []),
    ...(record.secondStageMissions || record.chapter2Missions || []),
  ];
  for (const mission of missions) {
    if (!mission || !Number.isInteger(mission.id)) errors.push('SP mission with missing/invalid ID');
  }
  return errors;
}

function optionalReviewReasons(hero, normal, sp, contract) {
  const reasons = [];
  const optional = {
    rarity: hero.rarity,
    cv: hero.cv,
    factions: hero.factions,
    origin: hero.origin,
    artwork: hero.artwork,
    skins: hero.skins,
  };

  for (const [key, value] of Object.entries(optional)) {
    const emptyArray = Array.isArray(value) && value.length === 0;
    if (value == null || value === '' || emptyArray) reasons.push(`header enrichment pending: ${key}`);
  }

  if (!normal?.talent) reasons.push('normal talent presentation pending');
  if (!Array.isArray(normal?.bonds) || normal.bonds.length === 0) reasons.push('normal bonds pending');
  if (normal?.exclusiveEquipment == null) reasons.push('exclusive equipment display state pending');
  if (normal?.covenant == null) reasons.push('covenant display state pending');
  if (!Array.isArray(normal?.soldiers) || normal.soldiers.length === 0) reasons.push('normal soldiers pending');
  if (!normal?.stats || Object.keys(normal.stats).length === 0) reasons.push('normal stats pending');

  const jobs = normal?.jobs || normal?.jobTree || [];
  const skills = normal?.skills || [];
  if (!Array.isArray(jobs) || jobs.length === 0) reasons.push('normal jobs missing for presentation');
  if (!Array.isArray(skills) || skills.length === 0) reasons.push('normal skills missing for presentation');

  for (const skill of Array.isArray(skills) ? skills : []) {
    if (skill && Number.isInteger(skill.id) && !skill.nameKr) {
      reasons.push(`Korean skill display name pending: ${skill.id}`);
    }
  }

  if (sp) {
    const missions = [
      ...(sp.firstStageMissions || sp.chapter1Missions || []),
      ...(sp.secondStageMissions || sp.chapter2Missions || []),
    ];
    if (missions.some((mission) => mission?.missionType === 73 && mission?.materialConditionStatus !== 'verified')) {
      reasons.push('Hero-SP MissionType 73 material target pending direct verification');
    }
  }

  const override = (contract.temporaryNameOverrides || []).find((item) => item.heroId === hero.heroId);
  if (override) reasons.push(`temporary Korean-name override active: ${override.effectiveNameKr}`);

  return [...new Set(reasons)];
}

function buildPageRecord(hero, normal, sp, contract) {
  return {
    heroId: hero.heroId,
    identity: {
      heroId: hero.heroId,
      nameKr: effectiveName(hero, contract),
      nameCn: hero.nameCn,
      nameEn: hero.nameEn,
    },
    header: {
      rarity: hero.rarity ?? normal?.rarity ?? null,
      cv: hero.cv ?? normal?.cv ?? null,
      factions: hero.factions ?? normal?.factions ?? [],
      origin: hero.origin ?? normal?.origin ?? null,
      artwork: hero.artwork ?? normal?.artwork ?? [],
      skins: hero.skins ?? normal?.skins ?? [],
    },
    normal: normal || null,
    sp: sp
      ? {
          exists: true,
          ...sp,
        }
      : null,
    presentation: {
      defaultMode: 'normal',
      hasSpToggle: Boolean(sp),
      keepUnavailableExclusiveEquipmentSection: true,
      keepUnavailableCovenantSection: true,
    },
  };
}

function main() {
  const contract = loadJson(contractPath);
  const master = loadJson(masterPath);
  const normalStage = loadJson(normalStagePath);
  const spStage = loadJson(spStagePath);
  const heroRecords = recordsOf(master);

  const heroIndex = indexByHeroId(heroRecords);
  const upstreamBlockers = [];

  if (heroRecords.length !== master.recordCount) {
    upstreamBlockers.push(`hero master count mismatch: declared=${master.recordCount} actual=${heroRecords.length}`);
  }
  if (heroIndex.duplicates.length) {
    upstreamBlockers.push(`duplicate canonical heroIds: ${heroIndex.duplicates.join(', ')}`);
  }
  if (normalStage.status !== 'complete' && normalStage.status !== 'ready') {
    upstreamBlockers.push(`stage 3-2 status=${normalStage.status}`);
  }
  if (spStage.status !== 'complete' && spStage.status !== 'ready') {
    upstreamBlockers.push(`stage 3-3 status=${spStage.status}`);
  }

  const normalInputPath = path.join(rootDir, contract.expectedGeneratedInputs.normal);
  const spInputPath = path.join(rootDir, contract.expectedGeneratedInputs.sp);
  const normalInput = tryLoadJson(normalInputPath);
  const spInput = tryLoadJson(spInputPath);

  if (!normalInput.ok) upstreamBlockers.push(`normal normalized input unavailable: ${normalInput.reason}`);
  if (!spInput.ok) upstreamBlockers.push(`SP normalized input unavailable: ${spInput.reason}`);

  const outputPaths = Object.fromEntries(
    Object.entries(contract.outputs).map(([key, relative]) => [key, path.join(rootDir, relative)]),
  );

  if (upstreamBlockers.length) {
    const summary = {
      version: 1,
      stage: '3-4',
      status: 'SOURCE_BLOCKED',
      canonicalHeroCount: heroRecords.length,
      evaluatedHeroCount: 0,
      notEvaluatedHeroCount: heroRecords.length,
      passCount: 0,
      reviewCount: 0,
      failCount: 0,
      blockers: upstreamBlockers,
      note: 'No page-ready records are emitted while upstream normalized inputs are unavailable or upstream stages are not ready.',
    };
    writeJson(outputPaths.pass, { version: 1, status: 'SOURCE_BLOCKED', records: [] });
    writeJson(outputPaths.review, { version: 1, status: 'SOURCE_BLOCKED', records: [] });
    writeJson(outputPaths.fail, { version: 1, status: 'SOURCE_BLOCKED', records: [] });
    writeJson(outputPaths.pageData, { version: 1, status: 'SOURCE_BLOCKED', recordCount: 0, records: [] });
    writeJson(outputPaths.summary, summary);

    console.log('STAGE 3-4 RESULT: SOURCE_BLOCKED');
    for (const blocker of upstreamBlockers) console.log(`- ${blocker}`);
    console.log(`Validation summary: ${path.relative(rootDir, outputPaths.summary)}`);
    process.exitCode = 2;
    return;
  }

  const normalRecords = recordsOf(normalInput.data);
  const spRecords = recordsOf(spInput.data);
  const normalIndex = indexByHeroId(normalRecords);
  const spIndex = indexByHeroId(spRecords);

  if (normalIndex.duplicates.length) upstreamBlockers.push(`duplicate normal heroIds: ${normalIndex.duplicates.join(', ')}`);
  if (spIndex.duplicates.length) upstreamBlockers.push(`duplicate SP heroIds: ${spIndex.duplicates.join(', ')}`);

  const unknownNormal = normalRecords.filter((record) => Number.isInteger(record?.heroId) && !heroIndex.map.has(record.heroId));
  const unknownSp = spRecords.filter((record) => Number.isInteger(record?.heroId) && !heroIndex.map.has(record.heroId));
  if (unknownNormal.length) upstreamBlockers.push(`normal records reference unknown heroIds: ${unknownNormal.map((r) => r.heroId).join(', ')}`);
  if (unknownSp.length) upstreamBlockers.push(`SP records reference unknown heroIds: ${unknownSp.map((r) => r.heroId).join(', ')}`);

  if (upstreamBlockers.length) {
    const summary = {
      version: 1,
      stage: '3-4',
      status: 'FAIL',
      canonicalHeroCount: heroRecords.length,
      evaluatedHeroCount: 0,
      notEvaluatedHeroCount: heroRecords.length,
      passCount: 0,
      reviewCount: 0,
      failCount: 0,
      blockers: upstreamBlockers,
    };
    writeJson(outputPaths.summary, summary);
    console.log('STAGE 3-4 RESULT: GLOBAL_FAIL');
    for (const blocker of upstreamBlockers) console.log(`- ${blocker}`);
    process.exitCode = 1;
    return;
  }

  const pass = [];
  const review = [];
  const fail = [];
  const pageRecords = [];

  for (const hero of heroRecords) {
    const normal = normalIndex.map.get(hero.heroId) || null;
    const sp = spIndex.map.get(hero.heroId) || null;
    const hardErrors = [
      ...hasHardNormalRelationError(normal),
      ...hasHardSpRelationError(sp),
    ];

    if (!hero.nameCn || !hero.nameKr || typeof hero.nameEn !== 'string') {
      hardErrors.push('canonical identity field missing');
    }

    const pageRecord = buildPageRecord(hero, normal, sp, contract);

    if (hardErrors.length) {
      fail.push({ heroId: hero.heroId, nameKr: effectiveName(hero, contract), reasons: hardErrors });
      continue;
    }

    const reviewReasons = optionalReviewReasons(hero, normal, sp, contract);
    if (reviewReasons.length) {
      review.push({ heroId: hero.heroId, nameKr: effectiveName(hero, contract), reasons: reviewReasons });
      continue;
    }

    pass.push({ heroId: hero.heroId, nameKr: effectiveName(hero, contract) });
    pageRecords.push(pageRecord);
  }

  const status = fail.length > 0 ? 'FAIL' : review.length > 0 ? 'REVIEW' : 'PASS';
  writeJson(outputPaths.pass, { version: 1, status, recordCount: pass.length, records: pass });
  writeJson(outputPaths.review, { version: 1, status, recordCount: review.length, records: review });
  writeJson(outputPaths.fail, { version: 1, status, recordCount: fail.length, records: fail });
  writeJson(outputPaths.pageData, { version: 1, status, recordCount: pageRecords.length, records: pageRecords });
  writeJson(outputPaths.summary, {
    version: 1,
    stage: '3-4',
    status,
    canonicalHeroCount: heroRecords.length,
    evaluatedHeroCount: heroRecords.length,
    notEvaluatedHeroCount: 0,
    passCount: pass.length,
    reviewCount: review.length,
    failCount: fail.length,
    pageReadyCount: pageRecords.length,
    duplicateNormalHeroIds: normalIndex.duplicates,
    duplicateSpHeroIds: spIndex.duplicates,
    primaryKey: 'heroId',
  });

  console.log(`STAGE 3-4 RESULT: ${status}`);
  console.log(`PASS=${pass.length} REVIEW=${review.length} FAIL=${fail.length}`);
  console.log(`Page-ready records=${pageRecords.length}/${heroRecords.length}`);
  console.log(`Page data: ${path.relative(rootDir, outputPaths.pageData)}`);

  if (fail.length > 0) process.exitCode = 1;
}

main();
