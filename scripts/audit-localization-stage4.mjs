import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-stage4.v1.json';
const SNAPSHOT_PATH = 'data/validation/localization-audit-stage4.v1.json';
const STAGE3_SCRIPT = 'scripts/audit-localization-stage3.mjs';

const readText = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(readText(p));
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const clone = (v) => JSON.parse(JSON.stringify(v));
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v), 'utf8').digest('hex');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function issue(code, message, context = {}) {
  return { severity: 'FAIL', code, message, context };
}

function runNode(script, args = [], cwd = ROOT) {
  return spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
}

function uniqueIndex(records, key) {
  const map = new Map();
  const duplicates = [];
  for (const row of records) {
    const id = row[key];
    if (map.has(id)) duplicates.push(id);
    else map.set(id, row);
  }
  return { map, duplicates };
}

function loadStage3() {
  const check = runNode(STAGE3_SCRIPT, ['--check']);
  if (check.status !== 0) throw new Error(`Stage 3 gate failed.\n${check.stdout ?? ''}${check.stderr ?? ''}`);
  const json = runNode(STAGE3_SCRIPT, ['--json']);
  if (json.status !== 0) throw new Error(`Stage 3 JSON failed.\n${json.stdout ?? ''}${json.stderr ?? ''}`);
  return JSON.parse(json.stdout);
}

function importStatements(text) {
  return text.match(/import[\s\S]*?;/gu) ?? [];
}

function runtimeImports(text) {
  const imports = [];
  for (const statement of importStatements(text)) {
    if (/^import\s+type\b/u.test(statement.trim())) continue;
    const match = statement.match(/from\s+["']([^"']+)["']/u) ?? statement.match(/^import\s+["']([^"']+)["']/u);
    if (match) imports.push(match[1]);
  }
  return imports;
}

function preciseNameJoin(text) {
  return [
    /\.find\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[^;\n]*(?:\.nameCn|\.nameKr)\s*===/u,
    /new\s+Map\([\s\S]{0,180}?\.map\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\[\s*[^,\]\n]*(?:\.nameCn|\.nameKr)\s*,/u,
    /\bbyName(?:Cn|Kr)\b/u,
  ].some((pattern) => pattern.test(text));
}

function sourceOf(overrides, p) {
  return Object.prototype.hasOwnProperty.call(overrides, p) ? overrides[p] : readText(p);
}

function auditBoundary(contract, overrides = {}) {
  const errors = [];
  const files = [
    contract.soldier.server, contract.soldier.functions, ...contract.soldier.routes,
    contract.hero.listServer, contract.hero.detailServer, contract.hero.functions, ...contract.hero.routes,
    contract.equipment.baseServer, contract.equipment.localizedServer, contract.equipment.functions, ...contract.equipment.routes,
  ];
  const serverFiles = [
    contract.soldier.server, contract.soldier.functions,
    contract.hero.listServer, contract.hero.detailServer, contract.hero.functions,
    contract.equipment.baseServer, contract.equipment.localizedServer, contract.equipment.functions,
  ];

  let rawConfigRuntimeReads = 0;
  let forbiddenNameJoins = 0;
  let routeRuntimeServerBypasses = 0;
  let wiringMismatchCount = 0;
  let policyMismatchCount = 0;

  for (const file of files) {
    for (const imported of runtimeImports(sourceOf(overrides, file))) {
      if (contract.productionBoundary.forbiddenRuntimeImportFragments.some((fragment) => imported.includes(fragment))) {
        rawConfigRuntimeReads += 1;
        errors.push(issue('FRONTEND_LOCALIZATION_LEAK', `${file} imports a forbidden raw ConfigData source.`, { file, imported }));
      }
    }
  }

  for (const file of serverFiles) {
    if (preciseNameJoin(sourceOf(overrides, file))) {
      forbiddenNameJoins += 1;
      errors.push(issue('FRONTEND_NAME_JOIN', `${file} appears to use a localization name as a runtime join key.`, { file }));
    }
  }

  for (const route of [...contract.soldier.routes, ...contract.hero.routes, ...contract.equipment.routes]) {
    const bypasses = runtimeImports(sourceOf(overrides, route)).filter((value) => value.includes('.server'));
    if (bypasses.length) {
      routeRuntimeServerBypasses += bypasses.length;
      errors.push(issue('FRONTEND_LOCALIZATION_LEAK', `${route} bypasses the approved frontend function boundary.`, { route, imports: bypasses }));
    }
  }

  const soldierServer = sourceOf(overrides, contract.soldier.server);
  const soldierFunctions = sourceOf(overrides, contract.soldier.functions);
  const soldierListRoute = sourceOf(overrides, contract.soldier.routes[0]);
  const soldierDetailRoute = sourceOf(overrides, contract.soldier.routes[1]);
  const soldierImports = [
    '../../data/generated/soldier-list-stage5-8.v1.json',
    '../../data/presentation/soldier-lower-tier-name-kr.v1.json',
    '../../data/presentation/soldier-t3-provisional-name-kr.v1.json',
  ];
  const soldierPolicy = [
    'const presentationRecord = lowerTierNameKr',
    ': t3ProvisionalNameKr',
    'nameKr: lowerTierNameKr.nameKr',
    'nameKrStatus: "confirmed-presentation"',
    'nameKr: t3ProvisionalNameKr.displayNameKr',
    'nameKrStatus: "provisional-display"',
  ];
  for (const token of soldierImports) {
    if (!soldierServer.includes(token)) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Soldier frozen source wiring changed.', { token })); }
  }
  if (!runtimeImports(soldierFunctions).includes('./soldier-page.server')) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Soldier function boundary changed.')); }
  for (const [route, text] of [[contract.soldier.routes[0], soldierListRoute], [contract.soldier.routes[1], soldierDetailRoute]]) {
    if (!runtimeImports(text).includes('@/lib/soldier-page.functions')) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Soldier route function boundary changed.', { route })); }
    if (!text.includes('nameKr ??') || !text.includes('nameCn')) { policyMismatchCount += 1; errors.push(issue('FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH', 'Soldier route lost Korean-first fallback.', { route })); }
  }
  for (const token of soldierPolicy) {
    if (!soldierServer.includes(token)) { policyMismatchCount += 1; errors.push(issue('FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH', 'Soldier overlay precedence changed.', { token })); }
  }

  const heroListServer = sourceOf(overrides, contract.hero.listServer);
  const heroDetailServer = sourceOf(overrides, contract.hero.detailServer);
  const heroFunctions = sourceOf(overrides, contract.hero.functions);
  const heroListRoute = sourceOf(overrides, contract.hero.routes[0]);
  const heroDetailRoute = sourceOf(overrides, contract.hero.routes[1]);
  if (!heroListServer.includes('../../data/generated/hero-list-stage1.v1.json')) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Hero frozen list source wiring changed.')); }
  if (!runtimeImports(heroDetailServer).includes('./hero-list.server')) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Hero detail admission boundary changed.')); }
  const heroFunctionImports = runtimeImports(heroFunctions);
  if (!['./hero-list.server', './hero-detail-stage5.server'].every((value) => heroFunctionImports.includes(value))) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Hero function boundary changed.')); }
  for (const [route, text] of [[contract.hero.routes[0], heroListRoute], [contract.hero.routes[1], heroDetailRoute]]) {
    if (!runtimeImports(text).includes('@/lib/hero-list.functions')) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Hero route function boundary changed.', { route })); }
    if (!text.includes('hero.identity.nameKr ?? hero.identity.nameCn')) { policyMismatchCount += 1; errors.push(issue('FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH', 'Hero route lost Korean-first fallback.', { route })); }
  }

  const equipmentBase = sourceOf(overrides, contract.equipment.baseServer);
  const equipmentLocalized = sourceOf(overrides, contract.equipment.localizedServer);
  const equipmentFunctions = sourceOf(overrides, contract.equipment.functions);
  const equipmentRoutes = contract.equipment.routes.map((route) => [route, sourceOf(overrides, route)]);
  if (!equipmentLocalized.includes('../../data/generated/equipment-name-kr-user-approved.v1.json') || !runtimeImports(equipmentLocalized).includes('./equipment-page.server')) {
    wiringMismatchCount += 1;
    errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Equipment localized wrapper source wiring changed.'));
  }
  const equipmentFunctionImports = runtimeImports(equipmentFunctions);
  if (!equipmentFunctionImports.includes('./equipment-page.localized.server') || equipmentFunctionImports.includes('./equipment-page.server')) {
    wiringMismatchCount += 1;
    errors.push(issue('FRONTEND_LOCALIZATION_LEAK', 'Equipment frontend functions bypass the localized server.', { imports: equipmentFunctionImports }));
  }
  for (const [route, text] of equipmentRoutes) {
    if (!runtimeImports(text).includes('@/lib/equipment-page.functions')) { wiringMismatchCount += 1; errors.push(issue('FRONTEND_CONSUMER_WIRING_MISMATCH', 'Equipment route function boundary changed.', { route })); }
  }
  for (const token of [
    'equipmentNameKr.byEquipmentId[String(equipmentId)]',
    'localized.nameCn !== nameCn',
    'return localized.nameKr ?? fallback',
    'displayName: nameKr ?? identity.nameCn',
  ]) {
    if (!equipmentLocalized.includes(token)) { policyMismatchCount += 1; errors.push(issue('FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH', 'Equipment localized effective-display policy changed.', { token })); }
  }
  if (!equipmentRoutes[0][1].includes('record.nameKr ?? record.nameCn') || !equipmentRoutes[2][1].includes('record.nameKr ?? record.nameCn') || !equipmentRoutes[1][1].includes('loaderData.displayName')) {
    policyMismatchCount += 1;
    errors.push(issue('FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH', 'Equipment route Korean-first display policy changed.'));
  }
  if (runtimeImports(equipmentBase).some((value) => contract.productionBoundary.forbiddenRuntimeImportFragments.some((fragment) => value.includes(fragment)))) {
    rawConfigRuntimeReads += 1;
    errors.push(issue('FRONTEND_LOCALIZATION_LEAK', 'Equipment base server reads raw ConfigData at runtime.'));
  }

  let equipmentBuildPreparation = false;
  try {
    const packageJson = JSON.parse(sourceOf(overrides, contract.equipment.packageJson));
    const prefix = 'node scripts/build-equipment-name-kr-presentation.mjs &&';
    equipmentBuildPreparation = ['dev', 'build', 'build:dev'].every((key) => String(packageJson.scripts?.[key] ?? '').includes(prefix));
  } catch {
    equipmentBuildPreparation = false;
  }
  if (!equipmentBuildPreparation) errors.push(issue('EQUIPMENT_BUILD_PREP_MISSING', 'Equipment Korean generated presentation is not guaranteed before dev/build.'));

  const semanticSignature = {
    soldier: {
      frozenSources: soldierImports.every((token) => soldierServer.includes(token)),
      functionBoundary: runtimeImports(soldierFunctions).includes('./soldier-page.server'),
      routeBoundary: [soldierListRoute, soldierDetailRoute].every((text) => runtimeImports(text).includes('@/lib/soldier-page.functions')),
      precedence: soldierPolicy.every((token) => soldierServer.includes(token)),
      fallback: [soldierListRoute, soldierDetailRoute].every((text) => text.includes('nameKr ??') && text.includes('nameCn')),
    },
    hero: {
      frozenList: heroListServer.includes('../../data/generated/hero-list-stage1.v1.json'),
      detailAdmission: runtimeImports(heroDetailServer).includes('./hero-list.server'),
      functionBoundary: ['./hero-list.server', './hero-detail-stage5.server'].every((value) => heroFunctionImports.includes(value)),
      routeBoundary: [heroListRoute, heroDetailRoute].every((text) => runtimeImports(text).includes('@/lib/hero-list.functions')),
      fallback: [heroListRoute, heroDetailRoute].every((text) => text.includes('hero.identity.nameKr ?? hero.identity.nameCn')),
    },
    equipment: {
      localizedWrapper: equipmentLocalized.includes('../../data/generated/equipment-name-kr-user-approved.v1.json') && runtimeImports(equipmentLocalized).includes('./equipment-page.server'),
      functionLocalizedOnly: equipmentFunctionImports.includes('./equipment-page.localized.server') && !equipmentFunctionImports.includes('./equipment-page.server'),
      idLookup: equipmentLocalized.includes('equipmentNameKr.byEquipmentId[String(equipmentId)]') && equipmentLocalized.includes('localized.nameCn !== nameCn'),
      fallback: equipmentLocalized.includes('return localized.nameKr ?? fallback') && equipmentLocalized.includes('displayName: nameKr ?? identity.nameCn'),
      routeBoundary: equipmentRoutes.every(([, text]) => runtimeImports(text).includes('@/lib/equipment-page.functions')),
      buildPreparation: equipmentBuildPreparation,
    },
  };

  return {
    errors,
    result: {
      filesChecked: files.length,
      rawConfigRuntimeReads,
      forbiddenNameJoins,
      routeRuntimeServerBypasses,
      wiringMismatchCount,
      policyMismatchCount,
      equipmentBuildPreparation,
      semanticSignatureFingerprintAlgorithm: 'sha256',
      semanticSignatureFingerprint: hash(stable(semanticSignature)),
    },
  };
}

function auditSoldier(contract, overrides = {}) {
  const errors = [];
  const canonical = overrides.canonical ?? readJson(contract.soldier.canonical);
  const lower = overrides.lower ?? readJson(contract.soldier.lowerTierPresentation);
  const provisional = overrides.provisional ?? readJson(contract.soldier.tier3ProvisionalPresentation);
  const records = canonical.records ?? [];
  const lowerRows = lower.records ?? [];
  const provisionalRows = provisional.records ?? [];
  const lowerById = uniqueIndex(lowerRows, 'soldierId').map;
  const provisionalById = uniqueIndex(provisionalRows, 'soldierId').map;
  let effectiveKorean = 0;
  let canonicalKorean = 0;
  let lowerCount = 0;
  let provisionalCount = 0;
  let chineseFallback = 0;
  let overlayCollisions = 0;
  const rows = [];

  if (records.length !== contract.soldier.expectedRecords || lowerRows.length !== contract.soldier.expectedLowerTierPresentation || provisionalRows.length !== contract.soldier.expectedTier3Provisional) {
    errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Soldier effective-display population mismatch.'));
  }

  for (const record of records) {
    const lowerRow = lowerById.get(record.soldierId);
    const provisionalRow = provisionalById.get(record.soldierId);
    if (lowerRow && provisionalRow) { overlayCollisions += 1; errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Soldier presentation overlays collide.', { soldierId: record.soldierId })); }
    let displayName;
    let source;
    let status;
    if (lowerRow) {
      if (lowerRow.nameCn !== record.nameCn || lowerRow.tier !== record.tier) errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Soldier lower-tier identity mismatch.', { soldierId: record.soldierId }));
      displayName = lowerRow.nameKr; source = 'lower-tier-presentation'; status = 'confirmed-presentation'; lowerCount += 1;
    } else if (provisionalRow) {
      if (provisionalRow.nameCn !== record.nameCn || provisionalRow.tier !== record.tier || provisionalRow.armyType !== record.armyType) errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Soldier provisional identity mismatch.', { soldierId: record.soldierId }));
      displayName = provisionalRow.displayNameKr; source = 'tier3-provisional-presentation'; status = 'provisional-display'; provisionalCount += 1;
    } else if (nonEmpty(record.nameKr)) {
      displayName = record.nameKr; source = 'canonical-korean'; status = record.nameKrStatus; canonicalKorean += 1;
    } else {
      displayName = record.nameCn; source = 'chinese-fallback'; status = record.nameKrStatus; chineseFallback += 1;
    }
    if (!nonEmpty(displayName)) errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Soldier effective display is empty.', { soldierId: record.soldierId }));
    else if (source !== 'chinese-fallback') effectiveKorean += 1;
    rows.push([record.soldierId, displayName, source, status]);
  }

  return {
    errors,
    result: {
      records: records.length,
      effectiveKoreanDisplays: effectiveKorean,
      canonicalKoreanDisplays: canonicalKorean,
      lowerTierPresentationDisplays: lowerCount,
      tier3ProvisionalDisplays: provisionalCount,
      chineseFallbackDisplays: chineseFallback,
      overlayCollisions,
      fingerprintAlgorithm: 'sha256',
      fingerprintSort: 'soldierId-ascending',
      fingerprintFields: ['soldierId', 'effectiveDisplayName', 'displaySource', 'displayStatus'],
      fingerprint: hash(rows.sort((a, b) => a[0] - b[0])),
    },
  };
}

function auditHero(contract) {
  const errors = [];
  const list = readJson(contract.hero.listConsumer);
  const manifest = readJson(contract.hero.detailManifest);
  const records = list.records ?? [];
  const byId = manifest.storage?.byHeroId ?? {};
  let effectiveKorean = 0;
  let chineseFallback = 0;
  let detailIdentityMismatch = 0;
  let missingDetailShard = 0;
  const rows = [];

  if (records.length !== contract.hero.expectedRecords || manifest.storage?.recordCount !== contract.hero.expectedRecords) errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Hero list/detail population mismatch.'));

  for (const record of records) {
    const identity = record.identity ?? {};
    const displayName = nonEmpty(identity.nameKr) ? identity.nameKr : identity.nameCn;
    const displaySource = nonEmpty(identity.nameKr) ? 'verified-korean' : 'chinese-fallback';
    if (displaySource === 'verified-korean') effectiveKorean += 1; else chineseFallback += 1;
    const manifestRow = byId[String(record.heroId)];
    if (!manifestRow?.path || !fs.existsSync(path.join(ROOT, manifestRow.path))) {
      missingDetailShard += 1;
      errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Hero detail shard is missing.', { heroId: record.heroId }));
      continue;
    }
    const shard = readJson(manifestRow.path);
    const detailIdentity = shard.identity ?? {};
    if (detailIdentity.nameKr !== identity.nameKr || detailIdentity.nameCn !== identity.nameCn || detailIdentity.nameEn !== identity.nameEn) {
      detailIdentityMismatch += 1;
      errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Hero list/detail localization identity mismatch.', { heroId: record.heroId }));
    }
    rows.push([record.heroId, displayName, displaySource, detailIdentity.nameKr ?? null, detailIdentity.nameCn ?? null, detailIdentity.nameEn ?? null]);
  }

  return {
    errors,
    result: {
      listRecords: records.length,
      detailManifestRecords: manifest.storage?.recordCount ?? null,
      effectiveKoreanDisplays: effectiveKorean,
      chineseFallbackDisplays: chineseFallback,
      detailIdentityMismatchCount: detailIdentityMismatch,
      missingDetailShardCount: missingDetailShard,
      fingerprintAlgorithm: 'sha256',
      fingerprintSort: 'heroId-ascending',
      fingerprintFields: ['heroId', 'effectiveDisplayName', 'displaySource', 'detailNameKr', 'detailNameCn', 'detailNameEn'],
      fingerprint: hash(rows.sort((a, b) => a[0] - b[0])),
    },
  };
}

function copyFile(tmp, p) {
  const target = path.join(tmp, p);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(ROOT, p), target);
}

function buildEquipmentTemp(contract) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'localization-audit-stage4-'));
  try {
    copyFile(tmp, contract.equipment.builder);
    copyFile(tmp, contract.equipment.canonical);
    for (const p of contract.equipment.builderSources) copyFile(tmp, p);
    const run = runNode(contract.equipment.builder, [], tmp);
    if (run.status !== 0) throw new Error(`Equipment localization builder failed.\n${run.stdout ?? ''}${run.stderr ?? ''}`);
    return {
      output: JSON.parse(fs.readFileSync(path.join(tmp, contract.equipment.generatedPresentation), 'utf8')),
      validation: JSON.parse(fs.readFileSync(path.join(tmp, contract.equipment.generatedValidation), 'utf8')),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function localizedEquipmentIndex(output) {
  return uniqueIndex(Object.entries(output.byEquipmentId ?? {}).map(([equipmentId, row]) => ({ equipmentId: Number(equipmentId), ...row })), 'equipmentId').map;
}

function auditEquipment(contract, overrides = {}) {
  const errors = [];
  const canonical = overrides.canonical ?? readJson(contract.equipment.canonical);
  const generalList = overrides.generalList ?? readJson(contract.equipment.generalList);
  const generalDetail = overrides.generalDetail ?? readJson(contract.equipment.generalDetail);
  const exclusive = overrides.exclusive ?? readJson(contract.equipment.exclusiveConsumer);
  const built = overrides.built ?? buildEquipmentTemp(contract);
  const canonicalRows = canonical.records ?? [];
  const generalRows = generalList.records ?? [];
  const generalDetailRows = generalDetail.records ?? [];
  const exclusiveRows = exclusive.listRecords ?? [];
  const exclusiveDetailRows = exclusive.detailRecords ?? [];
  const canonicalById = uniqueIndex(canonicalRows, 'equipmentId').map;
  const localizedById = localizedEquipmentIndex(built.output);
  const generalDetailById = uniqueIndex(generalDetailRows, 'equipmentId').map;
  const exclusiveDetailById = uniqueIndex(exclusiveDetailRows, 'equipmentId').map;
  const admitted = [
    ...generalRows.map((record) => ({ kind: 'general', record })),
    ...exclusiveRows.map((record) => ({ kind: 'exclusive', record })),
  ];
  const admittedIds = new Set();
  let effectiveKorean = 0;
  let chineseFallback = 0;
  let nonPublicAdmitted = 0;
  let identityMismatch = 0;
  let listDetailMismatch = 0;
  const rows = [];

  if (canonicalRows.length !== contract.equipment.expectedCanonical || generalRows.length !== contract.equipment.expectedGeneral || exclusiveRows.length !== contract.equipment.expectedExclusive) errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Equipment frontend population mismatch.'));

  for (const { kind, record } of admitted) {
    if (admittedIds.has(record.equipmentId)) { errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Equipment frontend admission duplicate.', { equipmentId: record.equipmentId })); continue; }
    admittedIds.add(record.equipmentId);
    const canonicalRow = canonicalById.get(record.equipmentId);
    const localized = localizedById.get(record.equipmentId);
    if (!canonicalRow || !localized) { identityMismatch += 1; errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Equipment canonical/localized identity missing.', { equipmentId: record.equipmentId })); continue; }
    if (canonicalRow.pageReady !== true) { nonPublicAdmitted += 1; errors.push(issue('NONPUBLIC_FRONTEND_ADMISSION', 'Non-public Equipment reached a frontend list.', { equipmentId: record.equipmentId })); }
    if (record.nameCn !== canonicalRow.nameCn || localized.nameCn !== canonicalRow.nameCn) { identityMismatch += 1; errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Equipment frontend localization identity mismatch.', { equipmentId: record.equipmentId })); }
    const detail = kind === 'general' ? generalDetailById.get(record.equipmentId) : exclusiveDetailById.get(record.equipmentId);
    if (!detail || detail.identity?.nameCn !== record.nameCn) { listDetailMismatch += 1; errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Equipment list/detail identity mismatch.', { equipmentId: record.equipmentId })); }
    const display = nonEmpty(localized.nameKr) ? localized.nameKr : nonEmpty(record.nameKr) ? record.nameKr : record.nameCn;
    const displaySource = nonEmpty(localized.nameKr) ? 'approved-korean-presentation' : nonEmpty(record.nameKr) ? 'frozen-base-korean' : 'chinese-fallback';
    if (displaySource === 'chinese-fallback') chineseFallback += 1; else effectiveKorean += 1;
    rows.push([record.equipmentId, display, displaySource, kind, detail?.identity?.nameCn ?? null]);
  }

  const nonPublicRows = canonicalRows.filter((record) => record.pageReady !== true);
  const nonPublicAbsent = nonPublicRows.filter((record) => !admittedIds.has(record.equipmentId)).length;
  if (admittedIds.size !== contract.equipment.expectedPublic || effectiveKorean !== contract.equipment.expectedPublic || nonPublicRows.length !== contract.equipment.expectedNonPublic || nonPublicAbsent !== contract.equipment.expectedNonPublic) errors.push(issue('EFFECTIVE_DISPLAY_MISMATCH', 'Equipment public/non-public localization coverage mismatch.'));
  if (built.output.policy?.productionJoinKey !== contract.equipment.productionJoinKey || built.output.policy?.runtimeNameJoin !== false || built.validation?.status !== 'PASS') errors.push(issue('FRONTEND_LOCALIZATION_LEAK', 'Equipment generated localization output lost its ID-only production boundary.'));

  return {
    errors,
    built,
    result: {
      canonicalRecords: canonicalRows.length,
      admittedRecords: admittedIds.size,
      generalRecords: generalRows.length,
      exclusiveRecords: exclusiveRows.length,
      effectiveKoreanDisplays: effectiveKorean,
      chineseFallbackDisplays: chineseFallback,
      nonPublicRecords: nonPublicRows.length,
      nonPublicAdmitted,
      nonPublicAbsent,
      identityMismatchCount: identityMismatch,
      listDetailMismatchCount: listDetailMismatch,
      productionJoinKey: built.output.policy?.productionJoinKey ?? null,
      runtimeNameJoin: built.output.policy?.runtimeNameJoin ?? null,
      tempWorkspaceBuild: true,
      fingerprintAlgorithm: 'sha256',
      fingerprintSort: 'equipmentId-ascending',
      fingerprintFields: ['equipmentId', 'effectiveDisplayName', 'displaySource', 'frontendKind', 'detailNameCn'],
      fingerprint: hash(rows.sort((a, b) => a[0] - b[0])),
    },
  };
}

function buildResult() {
  const contract = readJson(CONTRACT_PATH);
  const stage3 = loadStage3();
  const boundary = auditBoundary(contract);
  const soldier = auditSoldier(contract);
  const hero = auditHero(contract);
  const equipment = auditEquipment(contract);
  const errors = [...boundary.errors, ...soldier.errors, ...hero.errors, ...equipment.errors];
  const reviews = stage3.summary?.reviews ?? 0;
  return {
    version: 1,
    schemaId: 'localization-audit-stage4/v1',
    stage: 4,
    status: errors.length ? 'FAIL' : stage3.status === 'PASS_WITH_REVIEW' ? 'PASS_WITH_REVIEW' : 'PASS',
    mode: 'READ_ONLY_AUDIT',
    sources: {
      contract: CONTRACT_PATH,
      inheritedStage3Snapshot: 'data/validation/localization-audit-stage3.v1.json',
      frontendCriteria: '프론트엔드 사전검증 및 GitHub Pages Hosted QA 운용 기준.txt / Preflight production-boundary rules',
    },
    stage3: {
      status: stage3.status,
      errors: stage3.summary?.errors ?? null,
      reviews,
      soldierRecords: stage3.soldier?.canonicalRecords ?? null,
      heroRecords: stage3.hero?.masterRecords ?? null,
      equipmentRecords: stage3.equipment?.canonicalRecords ?? null,
    },
    frontendBoundary: boundary.result,
    effectiveDisplay: { soldier: soldier.result, hero: hero.result, equipment: equipment.result },
    summary: {
      errors: errors.length,
      reviews,
      frontendLocalizationLeakErrors: errors.filter((row) => ['FRONTEND_LOCALIZATION_LEAK', 'FRONTEND_NAME_JOIN', 'NONPUBLIC_FRONTEND_ADMISSION'].includes(row.code)).length,
    },
    errors,
    readOnlyExecution: true,
  };
}

function runSelfTest() {
  const contract = readJson(CONTRACT_PATH);
  const inheritedRun = runNode(STAGE3_SCRIPT, ['--self-test']);
  const inheritedText = `${inheritedRun.stdout ?? ''}\n${inheritedRun.stderr ?? ''}`;
  const match = inheritedText.match(/PASS\s*\((\d+)\/(\d+)\)/u);
  const inheritedPassed = inheritedRun.status === 0 && match ? Number(match[1]) : 0;
  const inheritedTotal = match ? Number(match[2]) : 13;
  const inheritedOk = inheritedRun.status === 0 && inheritedPassed === inheritedTotal;
  const tests = [];
  const add = (name, passed) => tests.push({ name, passed: Boolean(passed) });
  const hasCode = (audit, code) => audit.errors.some((row) => row.code === code);

  const soldierServer = readText(contract.soldier.server);
  add('soldier-precedence-bypass', hasCode(auditBoundary(contract, { [contract.soldier.server]: soldierServer.replace('const presentationRecord = lowerTierNameKr', 'const presentationRecord = t3ProvisionalNameKr') }), 'FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH'));
  const soldierRoute = readText(contract.soldier.routes[0]);
  add('soldier-route-server-bypass', hasCode(auditBoundary(contract, { [contract.soldier.routes[0]]: soldierRoute.replace('@/lib/soldier-page.functions', '@/lib/soldier-page.server') }), 'FRONTEND_LOCALIZATION_LEAK'));
  const heroServer = readText(contract.hero.listServer);
  add('hero-raw-configdata-leak', hasCode(auditBoundary(contract, { [contract.hero.listServer]: `import rawHeroConfig from "../../data/configdata/ConfigDataHeroInfo.json";\n${heroServer}` }), 'FRONTEND_LOCALIZATION_LEAK'));
  const heroRoute = readText(contract.hero.routes[1]);
  add('hero-fallback-removed', hasCode(auditBoundary(contract, { [contract.hero.routes[1]]: heroRoute.replace('hero.identity.nameKr ?? hero.identity.nameCn', 'hero.identity.nameCn') }), 'FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH'));
  const equipmentFunctions = readText(contract.equipment.functions);
  add('equipment-localized-wrapper-bypass', hasCode(auditBoundary(contract, { [contract.equipment.functions]: equipmentFunctions.replace('./equipment-page.localized.server', './equipment-page.server') }), 'FRONTEND_LOCALIZATION_LEAK'));
  const equipmentLocalized = readText(contract.equipment.localizedServer);
  add('equipment-runtime-name-join', hasCode(auditBoundary(contract, { [contract.equipment.localizedServer]: equipmentLocalized.replace('equipmentNameKr.byEquipmentId[String(equipmentId)]', 'Object.values(equipmentNameKr.byEquipmentId).find((row) => row.nameCn === nameCn)') }), 'FRONTEND_NAME_JOIN'));
  const equipmentDetailRoute = readText(contract.equipment.routes[1]);
  add('equipment-route-server-bypass', hasCode(auditBoundary(contract, { [contract.equipment.routes[1]]: equipmentDetailRoute.replace('@/lib/equipment-page.functions', '@/lib/equipment-page.localized.server') }), 'FRONTEND_LOCALIZATION_LEAK'));
  const packageJson = readJson(contract.equipment.packageJson);
  packageJson.scripts.build = 'vite build';
  add('equipment-build-prep-missing', hasCode(auditBoundary(contract, { [contract.equipment.packageJson]: `${JSON.stringify(packageJson, null, 2)}\n` }), 'EQUIPMENT_BUILD_PREP_MISSING'));

  const soldierBaseline = auditSoldier(contract);
  const provisional = readJson(contract.soldier.tier3ProvisionalPresentation);
  const mutatedProvisional = clone(provisional);
  mutatedProvisional.records[0].displayNameKr = `${mutatedProvisional.records[0].displayNameKr} `;
  add('soldier-effective-fingerprint-drift', soldierBaseline.result.fingerprint !== auditSoldier(contract, { provisional: mutatedProvisional }).result.fingerprint);

  const equipmentCanonical = readJson(contract.equipment.canonical);
  const general = readJson(contract.equipment.generalList);
  const nonPublic = equipmentCanonical.records.find((record) => record.pageReady !== true);
  const mutatedGeneral = clone(general);
  if (nonPublic) mutatedGeneral.records.push({ equipmentId: nonPublic.equipmentId, nameCn: nonPublic.nameCn, nameKr: null });
  const built = buildEquipmentTemp(contract);
  add('equipment-nonpublic-admission', Boolean(nonPublic) && hasCode(auditEquipment(contract, { generalList: mutatedGeneral, built }), 'NONPUBLIC_FRONTEND_ADMISSION'));

  const additionsPassed = tests.filter((test) => test.passed).length;
  return {
    status: inheritedOk && additionsPassed === tests.length ? 'PASS' : 'FAIL',
    passed: inheritedPassed + additionsPassed,
    total: inheritedTotal + tests.length,
    inherited: { passed: inheritedPassed, total: inheritedTotal },
    additions: { passed: additionsPassed, total: tests.length, tests },
  };
}

const args = new Set(process.argv.slice(2));

if (args.has('--self-test')) {
  const result = runSelfTest();
  console.log(`Localization Audit Stage 4 self-test: ${result.status} (${result.passed}/${result.total})`);
  console.log(`Inherited Stage 3: ${result.inherited.passed}/${result.inherited.total}; Stage 4 additions: ${result.additions.passed}/${result.additions.total}`);
  if (result.status !== 'PASS') {
    for (const test of result.additions.tests.filter((row) => !row.passed)) console.error(`FAILED ${test.name}`);
    process.exit(1);
  }
  process.exit(0);
}

const result = buildResult();

if (args.has('--check')) {
  if (!fs.existsSync(path.join(ROOT, SNAPSHOT_PATH))) {
    console.error(`Localization Audit Stage 4 snapshot missing: ${SNAPSHOT_PATH}`);
    process.exit(1);
  }
  const expected = readJson(SNAPSHOT_PATH);
  if (result.frontendBoundary.semanticSignatureFingerprint !== expected.frontendBoundary?.semanticSignatureFingerprint) {
    console.error('Localization Audit Stage 4: FAIL');
    console.error('FRONTEND_CONSUMER_WIRING_MISMATCH: frontend localization semantic wiring fingerprint changed.');
    process.exit(1);
  }
  for (const entity of ['soldier', 'hero', 'equipment']) {
    if (result.effectiveDisplay[entity].fingerprint !== expected.effectiveDisplay?.[entity]?.fingerprint) {
      console.error('Localization Audit Stage 4: FAIL');
      console.error(`FRONTEND_EFFECTIVE_DISPLAY_POLICY_MISMATCH: ${entity} effective display fingerprint changed.`);
      process.exit(1);
    }
  }
  if (result.status === 'FAIL') {
    console.error('Localization Audit Stage 4: FAIL');
    for (const row of result.errors) console.error(`${row.code}: ${row.message}`);
    process.exit(1);
  }
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization Audit Stage 4 snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 4: ${result.status}`);
  console.log(`Soldier ${result.effectiveDisplay.soldier.records}, Hero ${result.effectiveDisplay.hero.listRecords}, Equipment public ${result.effectiveDisplay.equipment.admittedRecords}`);
  console.log(`Frontend leaks ${result.summary.frontendLocalizationLeakErrors}, errors ${result.summary.errors}, reviews ${result.summary.reviews}`);
} else if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`LOCALIZATION AUDIT — Stage 4 / frontend preflight`);
  console.log(`status: ${result.status}`);
  console.log(`Soldier effective KR: ${result.effectiveDisplay.soldier.effectiveKoreanDisplays}/${result.effectiveDisplay.soldier.records}`);
  console.log(`Hero effective KR: ${result.effectiveDisplay.hero.effectiveKoreanDisplays}/${result.effectiveDisplay.hero.listRecords}`);
  console.log(`Equipment effective KR: ${result.effectiveDisplay.equipment.effectiveKoreanDisplays}/${result.effectiveDisplay.equipment.admittedRecords}`);
  console.log(`frontend localization leak errors: ${result.summary.frontendLocalizationLeakErrors}`);
  if (result.status === 'FAIL') process.exit(1);
}
