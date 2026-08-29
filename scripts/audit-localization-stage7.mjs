import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-stage7.v1.json';
const SNAPSHOT_PATH = 'data/validation/localization-audit-stage7.v1.json';

const readText = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' });
}

function fail(code, message, context = {}) {
  return { severity: 'FAIL', code, message, context };
}

function loadStage5Live() {
  const check = runNode('scripts/audit-localization.mjs', ['--check']);
  if (check.status !== 0) {
    throw new Error(`Stage 5 live audit failed before Stage 7 adoption.\n${check.stdout ?? ''}${check.stderr ?? ''}`);
  }
  const json = runNode('scripts/audit-localization.mjs', ['--json']);
  if (json.status !== 0) {
    throw new Error(`Stage 5 live JSON failed before Stage 7 adoption.\n${json.stdout ?? ''}${json.stderr ?? ''}`);
  }
  return JSON.parse(json.stdout);
}

function exactTarget(record) {
  return {
    heroId: record.heroId,
    nameCn: record.nameCn,
    displayNameKr: record.displayNameKr,
  };
}

function buildResult() {
  const contract = readJson(CONTRACT_PATH);
  const stage6 = readJson(contract.predecessor.stage6Snapshot);
  const stage2 = readJson(contract.predecessor.stage2HeroValidation);
  const stage5 = loadStage5Live();
  const presentation = readJson(contract.hero.presentationSource);
  const server = readText(contract.hero.listServer);
  const listRoute = readText(contract.hero.listRoute);
  const detailRoute = readText(contract.hero.detailRoute);
  const errors = [];

  const contractFrozen =
    contract.schemaId === 'localization-audit-stage7-contract/v1' &&
    contract.stage === 7 &&
    contract.status === 'FROZEN';
  if (!contractFrozen) errors.push(fail('STAGE7_CONTRACT_MISMATCH', 'Stage 7 contract is not frozen.'));

  const stage6Accepted =
    stage6.schemaId === contract.predecessor.requiredSchemaId &&
    stage6.stage === 6 &&
    stage6.status === contract.predecessor.requiredStatus &&
    stage6.summary?.errors === 0;
  if (!stage6Accepted) errors.push(fail('STAGE6_PREDECESSOR_MISMATCH', 'Localization Audit Stage 6 predecessor is not accepted.'));

  const stage5LiveAccepted =
    stage5.schemaId === 'localization-audit-stage5/v1' &&
    stage5.stage === 5 &&
    stage5.status === 'PASS_WITH_REVIEW' &&
    stage5.summary?.errors === 0 &&
    stage5.summary?.heroRecords === contract.hero.canonicalHeroCount;
  if (!stage5LiveAccepted) errors.push(fail('STAGE5_LIVE_GATE_MISMATCH', 'Frozen Stage 5 live audit no longer passes.'));

  const stage2Accepted =
    stage2.status === 'PASS' &&
    stage2.completion === 'COMPLETE' &&
    stage2.summary?.canonicalHeroCount === contract.hero.canonicalHeroCount &&
    stage2.summary?.provisionalHeroCount === contract.hero.provisionalCount &&
    stage2.summary?.officialNameUnresolvedCount === contract.hero.officialNameUnresolvedCount &&
    stage2.summary?.hardErrorCount === 0;
  if (!stage2Accepted) errors.push(fail('HERO_STAGE2_PREDECESSOR_MISMATCH', 'Hero provisional localization Stage 2 predecessor is not accepted.'));

  const presentationAccepted =
    presentation.schemaId === 'hero-provisional-name-kr-presentation/v1' &&
    presentation.status === 'PASS' &&
    presentation.scope === 'frontend-presentation-only' &&
    presentation.source?.officialKoreanNameConfirmed === false &&
    presentation.source?.identityMutation === false &&
    presentation.coverage?.recordCount === contract.hero.provisionalCount &&
    presentation.coverage?.provisionalCount === contract.hero.provisionalCount &&
    presentation.coverage?.officialNameUnresolvedCount === contract.hero.officialNameUnresolvedCount &&
    JSON.stringify(presentation.records.map(exactTarget)) === JSON.stringify(contract.hero.targets) &&
    presentation.records.every((record) => record.status === 'provisional-display' && record.sourceAuthority === 'CN');
  if (!presentationAccepted) errors.push(fail('HERO_PROVISIONAL_PRESENTATION_MISMATCH', 'Hero provisional presentation source no longer matches Stage 7 targets.'));

  const serverProjectionAccepted = [
    '../../data/presentation/hero-provisional-name-kr.v1.json',
    'heroProvisionalNames.records.map((record) => [record.heroId, record])',
    'officialNameKr: null',
    'nameKrStatus: "provisional-display"',
    'sourceAuthority: "CN"',
  ].every((token) => server.includes(token));
  if (!serverProjectionAccepted) errors.push(fail('HERO_SERVER_LOCALIZATION_PROJECTION_MISMATCH', 'Hero list server lost the ID-keyed provisional localization projection.'));

  const listDisplayMigrated =
    listRoute.includes('hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn)') &&
    listRoute.includes('data-name-kr-status={hero.localization.nameKrStatus}') &&
    listRoute.includes('data-name-source-authority={hero.localization.sourceAuthority}');
  if (!listDisplayMigrated) errors.push(fail('HERO_LIST_DISPLAY_MIGRATION_MISSING', 'Hero list route is not localization-first.'));

  const listSearchMigrated =
    listRoute.includes('hero.localization.displayName') &&
    listRoute.includes('hero.localization.displayNameKr') &&
    listRoute.includes('hero.localization.officialNameKr') &&
    listRoute.includes('hero.identity.nameCn') &&
    listRoute.includes('hero.identity.nameEn');
  if (!listSearchMigrated) errors.push(fail('HERO_LIST_SEARCH_MIGRATION_MISSING', 'Hero list search does not include effective localization plus frozen identity aliases.'));

  const detailDisplayMigrated =
    detailRoute.includes('loaderData.hero.localization.displayName') &&
    detailRoute.includes('hero.localization.displayName || (hero.identity.nameKr ?? hero.identity.nameCn)') &&
    detailRoute.includes('data-name-kr-status={hero.localization.nameKrStatus}') &&
    detailRoute.includes('data-name-source-authority={hero.localization.sourceAuthority}');
  if (!detailDisplayMigrated) errors.push(fail('HERO_DETAIL_DISPLAY_MIGRATION_MISSING', 'Hero detail route/head is not localization-first.'));

  const noRouteServerBypass =
    !listRoute.includes('.server"') &&
    !listRoute.includes(".server'") &&
    !detailRoute.includes('.server"') &&
    !detailRoute.includes(".server'");
  if (!noRouteServerBypass) errors.push(fail('HERO_ROUTE_SERVER_BYPASS', 'Hero routes bypass the approved server-function boundary.'));

  const productionBoundaryPreserved =
    contract.productionBoundary.rawConfigDataRead === false &&
    contract.productionBoundary.stage6Regeneration === false &&
    contract.productionBoundary.heroListStage1Regeneration === false &&
    contract.productionBoundary.identityMutation === false &&
    contract.productionBoundary.relationshipRederivation === false &&
    contract.productionBoundary.nameJoin === false &&
    contract.productionBoundary.routeServerBypass === false;
  if (!productionBoundaryPreserved) errors.push(fail('PRODUCTION_BOUNDARY_MISMATCH', 'Stage 7 production boundary contract changed.'));

  const reviews = (stage6.summary?.reviews ?? 0) + contract.hero.provisionalCount;
  const reviewAccountingAccepted =
    stage6.summary?.reviews === contract.reviewAccounting.inheritedReviews &&
    contract.reviewAccounting.heroProvisionalReviews === contract.hero.provisionalCount &&
    reviews === contract.reviewAccounting.expectedReviews;
  if (!reviewAccountingAccepted) errors.push(fail('REVIEW_ACCOUNTING_MISMATCH', 'Stage 7 review accounting does not preserve Stage 6 reviews plus five provisional Hero names.'));

  return {
    version: 1,
    schemaId: 'localization-audit-stage7/v1',
    stage: 7,
    status: errors.length === 0 ? 'PASS_WITH_REVIEW' : 'FAIL',
    mode: 'HERO_ROUTE_LOCALIZATION_ADOPTION',
    sources: {
      contract: CONTRACT_PATH,
      stage6Snapshot: contract.predecessor.stage6Snapshot,
      stage5LiveRunner: contract.predecessor.stage5LiveRunner,
      heroStage2Validation: contract.predecessor.stage2HeroValidation,
      heroPresentation: contract.hero.presentationSource,
      heroListServer: contract.hero.listServer,
      heroListRoute: contract.hero.listRoute,
      heroDetailRoute: contract.hero.detailRoute,
    },
    predecessor: {
      stage6Status: stage6.status,
      stage6Errors: stage6.summary?.errors ?? null,
      stage6Reviews: stage6.summary?.reviews ?? null,
      stage5LiveStatus: stage5.status,
      heroStage2Status: stage2.status,
    },
    hero: {
      canonicalHeroCount: contract.hero.canonicalHeroCount,
      provisionalCount: contract.hero.provisionalCount,
      officialNameUnresolvedCount: contract.hero.officialNameUnresolvedCount,
      targetHeroIds: contract.hero.targets.map((record) => record.heroId),
      joinKey: contract.hero.joinKey,
      displayPolicy: contract.hero.displayPolicy,
      searchPolicy: contract.hero.searchPolicy,
    },
    checks: {
      contractFrozen,
      stage6Accepted,
      stage5LiveAccepted,
      stage2Accepted,
      presentationAccepted,
      serverProjectionAccepted,
      listDisplayMigrated,
      listSearchMigrated,
      detailDisplayMigrated,
      noRouteServerBypass,
      productionBoundaryPreserved,
      reviewAccountingAccepted,
    },
    summary: {
      errors: errors.length,
      reviews,
      heroRecords: contract.hero.canonicalHeroCount,
      provisionalHeroRecords: contract.hero.provisionalCount,
      officialNameUnresolvedRecords: contract.hero.officialNameUnresolvedCount,
      migratedRouteCount: Number(listDisplayMigrated) + Number(detailDisplayMigrated),
      migratedSearchCount: Number(listSearchMigrated),
      hardErrorCount: errors.length,
    },
    errors,
    readOnlyExecution: true,
    nextStartPoint: contract.nextStartPoint,
  };
}

function parseCli(argv) {
  return {
    check: argv.includes('--check'),
    json: argv.includes('--json'),
  };
}

const options = parseCli(process.argv.slice(2));
let result;
try {
  result = buildResult();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (result.status === 'FAIL') {
  console.error('Localization Audit Stage 7: FAIL');
  for (const row of result.errors) console.error(`${row.code}: ${row.message}`);
  process.exit(1);
}

if (options.check) {
  const expected = readJson(SNAPSHOT_PATH);
  if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) {
    console.error('Localization Audit Stage 7 snapshot mismatch.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`Localization Audit Stage 7: ${result.status}`);
  console.log(`Hero ${result.summary.heroRecords}; provisional ${result.summary.provisionalHeroRecords}; reviews ${result.summary.reviews}; errors ${result.summary.errors}`);
} else if (options.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`Localization Audit Stage 7: ${result.status}`);
  console.log(JSON.stringify(result.summary, null, 2));
}
