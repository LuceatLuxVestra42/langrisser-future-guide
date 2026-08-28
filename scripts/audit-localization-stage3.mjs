import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-stage3.v1.json';
const EXPECTED_PATH = 'data/validation/localization-audit-stage3.v1.json';
const STAGE2_1_SCRIPT = 'scripts/audit-localization-stage2-1.mjs';

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fingerprint(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows), 'utf8').digest('hex');
}

function uniqueIndex(records, key) {
  const map = new Map();
  const duplicates = [];
  for (const record of records) {
    const value = record[key];
    if (map.has(value)) duplicates.push(value);
    else map.set(value, record);
  }
  return { map, duplicates };
}

function issue(code, message, context = {}) {
  return { severity: 'FAIL', code, message, context };
}

function runNode(relativeScript, args = [], cwd = ROOT) {
  return spawnSync(process.execPath, [relativeScript, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function loadSoldierGate() {
  const check = runNode(STAGE2_1_SCRIPT, ['--check']);
  if (check.status !== 0) {
    throw new Error(`Soldier Stage 2.1 gate failed.\n${check.stdout ?? ''}${check.stderr ?? ''}`);
  }
  const jsonRun = runNode(STAGE2_1_SCRIPT, ['--json']);
  if (jsonRun.status !== 0) {
    throw new Error(`Soldier Stage 2.1 JSON read failed.\n${jsonRun.stdout ?? ''}${jsonRun.stderr ?? ''}`);
  }
  return JSON.parse(jsonRun.stdout);
}

function auditHero(contract, master = null, consumer = null) {
  const errors = [];
  const heroMaster = master ?? readJson(ROOT, contract.hero.master.path);
  const heroConsumer = consumer ?? readJson(ROOT, contract.hero.consumer.path);
  const masterRecords = Array.isArray(heroMaster.records) ? heroMaster.records : [];
  const consumerRecords = Array.isArray(heroConsumer.records) ? heroConsumer.records : [];
  const masterIndex = uniqueIndex(masterRecords, 'heroId');
  const consumerIndex = uniqueIndex(consumerRecords, 'heroId');

  if (heroMaster.recordCount !== contract.hero.master.expectedRecordCount || masterRecords.length !== contract.hero.master.expectedRecordCount) {
    errors.push(issue('HERO_COUNT_MISMATCH', 'Hero master count does not match frozen Stage 3 contract.', {
      declared: heroMaster.recordCount,
      actual: masterRecords.length,
      expected: contract.hero.master.expectedRecordCount,
    }));
  }
  if (heroConsumer.schemaId !== contract.hero.consumer.requiredSchemaId ||
      heroConsumer.freezeState !== contract.hero.consumer.requiredFreezeState ||
      consumerRecords.length !== contract.hero.consumer.expectedRecordCount) {
    errors.push(issue('HERO_CONSUMER_CONTRACT_MISMATCH', 'Hero list consumer does not match the frozen Stage 3 contract.', {
      schemaId: heroConsumer.schemaId,
      freezeState: heroConsumer.freezeState,
      records: consumerRecords.length,
    }));
  }
  if (masterIndex.duplicates.length) {
    errors.push(issue('DUPLICATE_HERO_ID', 'Hero master contains duplicate heroId values.', { heroIds: masterIndex.duplicates }));
  }
  if (consumerIndex.duplicates.length) {
    errors.push(issue('DUPLICATE_HERO_ID', 'Hero consumer contains duplicate heroId values.', { heroIds: consumerIndex.duplicates }));
  }

  let verifiedCount = 0;
  let displayCount = 0;
  let identityMismatchCount = 0;
  for (const record of masterRecords) {
    if (record.status === contract.hero.master.requiredStatus) verifiedCount += 1;
    else errors.push(issue('HERO_STATUS_MISMATCH', `Hero ${record.heroId} is not verified.`, {
      heroId: record.heroId,
      status: record.status,
    }));

    if (nonEmptyString(record.nameCn) && nonEmptyString(record.nameKr) && nonEmptyString(record.nameEn)) {
      displayCount += 1;
    } else {
      errors.push(issue('HERO_MISSING_DISPLAY', `Hero ${record.heroId} has an incomplete identity display.`, {
        heroId: record.heroId,
        nameCn: record.nameCn,
        nameKr: record.nameKr,
        nameEn: record.nameEn,
      }));
    }

    const projected = consumerIndex.map.get(record.heroId);
    if (!projected) {
      identityMismatchCount += 1;
      errors.push(issue('HERO_IDENTITY_MISMATCH', `Hero ${record.heroId} is missing from the frozen Hero list consumer.`, {
        heroId: record.heroId,
      }));
      continue;
    }
    const identity = projected.identity ?? {};
    if (identity.nameCn !== record.nameCn || identity.nameKr !== record.nameKr || identity.nameEn !== record.nameEn) {
      identityMismatchCount += 1;
      errors.push(issue('HERO_IDENTITY_MISMATCH', `Hero ${record.heroId} identity differs between hero-name-master and Hero list consumer.`, {
        heroId: record.heroId,
        master: { nameCn: record.nameCn, nameKr: record.nameKr, nameEn: record.nameEn },
        consumer: { nameCn: identity.nameCn, nameKr: identity.nameKr, nameEn: identity.nameEn },
      }));
    }
  }

  for (const record of consumerRecords) {
    if (!masterIndex.map.has(record.heroId)) {
      identityMismatchCount += 1;
      errors.push(issue('HERO_IDENTITY_MISMATCH', `Hero list consumer contains unknown heroId ${record.heroId}.`, {
        heroId: record.heroId,
      }));
    }
  }

  const digestRows = masterRecords
    .map((record) => [record.heroId, record.nameCn, record.nameKr, record.nameEn, record.status])
    .sort((a, b) => a[0] - b[0]);

  return {
    errors,
    result: {
      masterRecords: masterRecords.length,
      consumerRecords: consumerRecords.length,
      uniqueHeroIds: masterIndex.map.size,
      verifiedRecords: verifiedCount,
      completeIdentityDisplays: displayCount,
      identityMismatchCount,
      fingerprintAlgorithm: 'sha256',
      fingerprintSort: 'heroId-ascending',
      fingerprintFields: contract.hero.fingerprintFields,
      fingerprint: fingerprint(digestRows),
    },
  };
}

function copyRequiredFile(tmpRoot, relativePath) {
  const source = path.join(ROOT, relativePath);
  const target = path.join(tmpRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function buildEquipmentInTemp(contract) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'localization-audit-stage3-'));
  try {
    copyRequiredFile(tmpRoot, contract.equipment.builder.path);
    copyRequiredFile(tmpRoot, contract.equipment.canonical.path);
    for (const sourcePath of contract.equipment.builder.sourceFiles) copyRequiredFile(tmpRoot, sourcePath);

    const run = runNode(contract.equipment.builder.path, [], tmpRoot);
    if (run.status !== 0) {
      throw new Error(`Equipment Korean presentation builder failed in temp workspace.\n${run.stdout ?? ''}${run.stderr ?? ''}`);
    }

    const output = readJson(tmpRoot, contract.equipment.builder.generatedOutput);
    const validation = readJson(tmpRoot, contract.equipment.builder.generatedValidation);
    return { output, validation };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function equipmentRecordsFromOutput(output) {
  return Object.entries(output.byEquipmentId ?? {})
    .map(([equipmentId, value]) => ({ equipmentId: Number(equipmentId), ...value }))
    .sort((a, b) => a.equipmentId - b.equipmentId);
}

function auditEquipment(contract, canonical = null, built = null) {
  const errors = [];
  const metadata = canonical ?? readJson(ROOT, contract.equipment.canonical.path);
  const builtResult = built ?? buildEquipmentInTemp(contract);
  const output = builtResult.output;
  const validation = builtResult.validation;
  const canonicalRecords = Array.isArray(metadata.records) ? metadata.records : [];
  const derivedRecords = equipmentRecordsFromOutput(output);
  const canonicalIndex = uniqueIndex(canonicalRecords, 'equipmentId');
  const derivedIndex = uniqueIndex(derivedRecords, 'equipmentId');

  if (canonicalRecords.length !== contract.equipment.canonical.expectedRecordCount) {
    errors.push(issue('EQUIPMENT_COUNT_MISMATCH', 'Equipment canonical count does not match frozen Stage 3 contract.', {
      actual: canonicalRecords.length,
      expected: contract.equipment.canonical.expectedRecordCount,
    }));
  }
  if (canonicalIndex.duplicates.length) {
    errors.push(issue('DUPLICATE_EQUIPMENT_ID', 'Equipment canonical metadata contains duplicate equipmentId values.', {
      equipmentIds: canonicalIndex.duplicates,
    }));
  }
  if (derivedIndex.duplicates.length) {
    errors.push(issue('DUPLICATE_EQUIPMENT_ID', 'Derived Korean presentation contains duplicate equipmentId values.', {
      equipmentIds: derivedIndex.duplicates,
    }));
  }

  if (output.status !== contract.equipment.builder.requiredOutputStatus ||
      validation.status !== 'PASS' ||
      output.policy?.productionJoinKey !== contract.equipment.joinKey ||
      output.policy?.runtimeNameJoin !== false ||
      output.counts?.canonical !== contract.equipment.canonical.expectedRecordCount) {
    errors.push(issue('EQUIPMENT_PRESENTATION_CONTRACT_MISMATCH', 'Derived Equipment Korean presentation does not match the Stage 3 contract.', {
      outputStatus: output.status,
      validationStatus: validation.status,
      productionJoinKey: output.policy?.productionJoinKey,
      runtimeNameJoin: output.policy?.runtimeNameJoin,
      counts: output.counts,
    }));
  }

  let publicCount = 0;
  let publicDisplayCount = 0;
  let nonPublicCount = 0;
  let unresolvedNonPublicCount = 0;
  let identityMismatchCount = 0;
  let pageReadyMismatchCount = 0;

  for (const record of canonicalRecords) {
    const display = derivedIndex.map.get(record.equipmentId);
    if (!display) {
      identityMismatchCount += 1;
      errors.push(issue('EQUIPMENT_IDENTITY_MISMATCH', `Equipment ${record.equipmentId} is missing from derived Korean presentation.`, {
        equipmentId: record.equipmentId,
      }));
      continue;
    }
    if (display.nameCn !== record.nameCn) {
      identityMismatchCount += 1;
      errors.push(issue('EQUIPMENT_IDENTITY_MISMATCH', `Equipment ${record.equipmentId} Chinese identity mismatch.`, {
        equipmentId: record.equipmentId,
        canonicalNameCn: record.nameCn,
        derivedNameCn: display.nameCn,
      }));
    }
    if (display.pageReady !== (record.pageReady === true)) {
      pageReadyMismatchCount += 1;
      errors.push(issue('EQUIPMENT_PAGE_READY_MISMATCH', `Equipment ${record.equipmentId} pageReady differs between canonical metadata and derived Korean presentation.`, {
        equipmentId: record.equipmentId,
        canonicalPageReady: record.pageReady === true,
        derivedPageReady: display.pageReady,
      }));
    }

    if (record.pageReady === true) {
      publicCount += 1;
      if (nonEmptyString(display.nameKr) && display.status === contract.equipment.builder.requiredPublicStatus) {
        publicDisplayCount += 1;
      } else {
        errors.push(issue('EQUIPMENT_MISSING_DISPLAY', `Public Equipment ${record.equipmentId} lacks an approved Korean display name.`, {
          equipmentId: record.equipmentId,
          nameCn: record.nameCn,
          nameKr: display.nameKr,
          status: display.status,
        }));
      }
    } else {
      nonPublicCount += 1;
      if (display.nameKr === null && display.status === contract.equipment.builder.requiredNonPublicStatus) {
        unresolvedNonPublicCount += 1;
      } else {
        errors.push(issue('EQUIPMENT_NONPUBLIC_LOCALIZATION_LEAK', `Non-public Equipment ${record.equipmentId} unexpectedly has a Korean display value or status.`, {
          equipmentId: record.equipmentId,
          nameCn: record.nameCn,
          nameKr: display.nameKr,
          status: display.status,
        }));
      }
    }
  }

  for (const record of derivedRecords) {
    if (!canonicalIndex.map.has(record.equipmentId)) {
      identityMismatchCount += 1;
      errors.push(issue('EQUIPMENT_IDENTITY_MISMATCH', `Derived Korean presentation contains unknown equipmentId ${record.equipmentId}.`, {
        equipmentId: record.equipmentId,
      }));
    }
  }

  if (publicCount !== contract.equipment.canonical.expectedPublicCount ||
      publicDisplayCount !== contract.equipment.canonical.expectedPublicCount) {
    errors.push(issue('EQUIPMENT_PUBLIC_COVERAGE_MISMATCH', 'Public Equipment Korean display coverage does not match Stage 3 contract.', {
      publicCount,
      publicDisplayCount,
      expected: contract.equipment.canonical.expectedPublicCount,
    }));
  }
  if (nonPublicCount !== contract.equipment.canonical.expectedNonPublicCount ||
      unresolvedNonPublicCount !== contract.equipment.canonical.expectedNonPublicCount) {
    errors.push(issue('EQUIPMENT_NONPUBLIC_COVERAGE_MISMATCH', 'Non-public Equipment unresolved coverage does not match Stage 3 contract.', {
      nonPublicCount,
      unresolvedNonPublicCount,
      expected: contract.equipment.canonical.expectedNonPublicCount,
    }));
  }

  const digestRows = derivedRecords.map((record) => [
    record.equipmentId,
    record.nameCn,
    record.nameKr,
    record.pageReady,
    record.status,
    record.note ?? null,
  ]);

  return {
    errors,
    built: builtResult,
    result: {
      canonicalRecords: canonicalRecords.length,
      derivedPresentationRecords: derivedRecords.length,
      uniqueEquipmentIds: canonicalIndex.map.size,
      publicRecords: publicCount,
      publicKoreanDisplays: publicDisplayCount,
      nonPublicRecords: nonPublicCount,
      unresolvedNonPublic: unresolvedNonPublicCount,
      identityMismatchCount,
      pageReadyMismatchCount,
      runtimeNameJoin: output.policy?.runtimeNameJoin,
      productionJoinKey: output.policy?.productionJoinKey,
      repositoryWritesDuringAudit: false,
      tempWorkspaceBuild: true,
      fingerprintAlgorithm: 'sha256',
      fingerprintSort: 'equipmentId-ascending',
      fingerprintFields: contract.equipment.fingerprintFields,
      fingerprint: fingerprint(digestRows),
    },
  };
}

function buildResult() {
  const contract = readJson(ROOT, CONTRACT_PATH);
  const soldier = loadSoldierGate();
  const hero = auditHero(contract);
  const equipment = auditEquipment(contract);
  const errors = [...hero.errors, ...equipment.errors];

  const status = errors.length > 0
    ? 'FAIL'
    : soldier.status === 'PASS_WITH_REVIEW'
      ? 'PASS_WITH_REVIEW'
      : 'PASS';

  return {
    version: 1,
    schemaId: 'localization-audit-stage3/v1',
    stage: 3,
    status,
    mode: 'READ_ONLY_AUDIT',
    sources: {
      contract: CONTRACT_PATH,
      soldierGate: 'data/validation/localization-audit-soldier-stage2-1.v1.json',
      heroMaster: contract.hero.master.path,
      heroConsumer: contract.hero.consumer.path,
      equipmentCanonical: contract.equipment.canonical.path,
      equipmentBuilder: contract.equipment.builder.path,
      equipmentLocalizationSources: contract.equipment.builder.sourceFiles,
    },
    soldier: {
      status: soldier.status,
      canonicalRecords: soldier.stage2?.canonicalRecords ?? null,
      effectiveKoreanDisplayRecords: soldier.stage2?.effectiveKoreanDisplayRecords ?? null,
      errors: soldier.stage2?.errors ?? null,
      reviews: soldier.stage2?.reviews ?? null,
      lowerTierFingerprint: soldier.lowerTierPresentation?.fingerprint ?? null,
    },
    hero: hero.result,
    equipment: equipment.result,
    summary: {
      errors: errors.length,
      reviews: soldier.stage2?.reviews ?? 0,
    },
    errors,
  };
}

function hasCode(result, code) {
  return result.errors.some((entry) => entry.code === code);
}

function runSelfTests() {
  const contract = readJson(ROOT, CONTRACT_PATH);
  const stage2 = runNode(STAGE2_1_SCRIPT, ['--self-test']);
  const match = (stage2.stdout ?? '').match(/PASS \((\d+)\/(\d+)\)/);
  const inheritedPassed = stage2.status === 0 && match ? Number(match[1]) : 0;
  const inheritedTotal = match ? Number(match[2]) : 7;
  const tests = [];

  const heroMaster = readJson(ROOT, contract.hero.master.path);
  const heroConsumer = readJson(ROOT, contract.hero.consumer.path);

  const heroIdentity = clone(heroConsumer);
  heroIdentity.records[0].identity.nameKr = '__BROKEN_KR__';
  tests.push({
    name: 'hero-identity-mismatch',
    pass: hasCode({ errors: auditHero(contract, heroMaster, heroIdentity).errors }, 'HERO_IDENTITY_MISMATCH'),
  });

  const heroMissing = clone(heroMaster);
  heroMissing.records[0].nameKr = '';
  tests.push({
    name: 'hero-missing-display',
    pass: hasCode({ errors: auditHero(contract, heroMissing, heroConsumer).errors }, 'HERO_MISSING_DISPLAY'),
  });

  const heroStatus = clone(heroMaster);
  heroStatus.records[0].status = 'review';
  tests.push({
    name: 'hero-status-mismatch',
    pass: hasCode({ errors: auditHero(contract, heroStatus, heroConsumer).errors }, 'HERO_STATUS_MISMATCH'),
  });

  const canonical = readJson(ROOT, contract.equipment.canonical.path);
  const built = buildEquipmentInTemp(contract);

  const equipmentIdentity = clone(built);
  const firstEquipmentKey = Object.keys(equipmentIdentity.output.byEquipmentId)[0];
  equipmentIdentity.output.byEquipmentId[firstEquipmentKey].nameCn = '__BROKEN_CN__';
  tests.push({
    name: 'equipment-identity-mismatch',
    pass: hasCode({ errors: auditEquipment(contract, canonical, equipmentIdentity).errors }, 'EQUIPMENT_IDENTITY_MISMATCH'),
  });

  const equipmentMissing = clone(built);
  const publicKey = Object.keys(equipmentMissing.output.byEquipmentId)
    .find((key) => equipmentMissing.output.byEquipmentId[key].pageReady === true);
  equipmentMissing.output.byEquipmentId[publicKey].nameKr = '';
  tests.push({
    name: 'equipment-missing-display',
    pass: hasCode({ errors: auditEquipment(contract, canonical, equipmentMissing).errors }, 'EQUIPMENT_MISSING_DISPLAY'),
  });

  const equipmentLeak = clone(built);
  const nonPublicKey = Object.keys(equipmentLeak.output.byEquipmentId)
    .find((key) => equipmentLeak.output.byEquipmentId[key].pageReady === false);
  equipmentLeak.output.byEquipmentId[nonPublicKey].nameKr = '__LEAK__';
  tests.push({
    name: 'equipment-nonpublic-leak',
    pass: hasCode({ errors: auditEquipment(contract, canonical, equipmentLeak).errors }, 'EQUIPMENT_NONPUBLIC_LOCALIZATION_LEAK'),
  });

  const failed = tests.filter((test) => !test.pass);
  return {
    status: stage2.status === 0 && inheritedPassed === inheritedTotal && failed.length === 0 ? 'PASS' : 'FAIL',
    inheritedPassed,
    inheritedTotal,
    stage3Passed: tests.length - failed.length,
    stage3Total: tests.length,
    totalPassed: inheritedPassed + tests.length - failed.length,
    total: inheritedTotal + tests.length,
    failed,
  };
}

const args = new Set(process.argv.slice(2));

if (args.has('--self-test')) {
  const selfTest = runSelfTests();
  console.log(`Localization Audit Stage 3 self-test: ${selfTest.status} (${selfTest.totalPassed}/${selfTest.total})`);
  console.log(`Inherited Stage 2.1: ${selfTest.inheritedPassed}/${selfTest.inheritedTotal}; Stage 3 additions: ${selfTest.stage3Passed}/${selfTest.stage3Total}`);
  if (selfTest.failed.length) console.error(JSON.stringify(selfTest.failed, null, 2));
  if (selfTest.status === 'FAIL') process.exit(1);
  process.exit(0);
}

const result = buildResult();

if (args.has('--check')) {
  const expected = readJson(ROOT, EXPECTED_PATH);
  if (result.hero.fingerprint !== expected.hero?.fingerprint) {
    console.error('Localization Audit Stage 3: FAIL');
    console.error('HERO_CONFIRMED_PRESENTATION_DRIFT: Hero verified identity fingerprint changed.');
    console.error(`expected ${expected.hero?.fingerprint ?? 'missing'}`);
    console.error(`current  ${result.hero.fingerprint}`);
    process.exit(1);
  }
  if (result.equipment.fingerprint !== expected.equipment?.fingerprint) {
    console.error('Localization Audit Stage 3: FAIL');
    console.error('EQUIPMENT_APPROVED_PRESENTATION_DRIFT: Equipment approved presentation fingerprint changed.');
    console.error(`expected ${expected.equipment?.fingerprint ?? 'missing'}`);
    console.error(`current  ${result.equipment.fingerprint}`);
    process.exit(1);
  }
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization Audit Stage 3 snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 3: ${result.status}`);
  console.log(`Soldier ${result.soldier.canonicalRecords}, Hero ${result.hero.masterRecords}, Equipment ${result.equipment.canonicalRecords}`);
  console.log(`Hero display ${result.hero.completeIdentityDisplays}, Equipment public display ${result.equipment.publicKoreanDisplays}, errors ${result.summary.errors}, reviews ${result.summary.reviews}`);
} else if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`LOCALIZATION AUDIT — Stage 3`);
  console.log(`status: ${result.status}`);
  console.log(`Soldier: ${result.soldier.canonicalRecords}`);
  console.log(`Hero: ${result.hero.masterRecords}, verified displays ${result.hero.completeIdentityDisplays}`);
  console.log(`Equipment: ${result.equipment.canonicalRecords}, public displays ${result.equipment.publicKoreanDisplays}, unresolved non-public ${result.equipment.unresolvedNonPublic}`);
  console.log(`errors: ${result.summary.errors}`);
  console.log(`reviews: ${result.summary.reviews}`);
}

if (result.status === 'FAIL') process.exit(1);
