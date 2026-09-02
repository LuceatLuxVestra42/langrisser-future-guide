import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const contractPath = path.join(root, 'data/contracts/configdata-lookup-stage0-contract.v1.json');
const configuredSourceRoot = process.env.CONFIGDATA_SOURCE_ROOT?.trim() ?? '';

const failures = [];
const checks = [];

function check(name, condition, detail = null) {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push({ name, detail });
}

function sourcePathExists(relativePath) {
  const physicalRoot = configuredSourceRoot && path.isAbsolute(configuredSourceRoot) ? configuredSourceRoot : root;
  return fs.existsSync(path.join(physicalRoot, relativePath));
}

let contract = null;
try {
  contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  check('contract parses as JSON', true);
} catch (error) {
  check('contract parses as JSON', false, error instanceof Error ? error.message : String(error));
}

check(
  'configured physical source root is absolute when provided',
  configuredSourceRoot === '' || path.isAbsolute(configuredSourceRoot),
  configuredSourceRoot || null,
);

if (contract) {
  check('stage identity is frozen', contract.stage === 'CONFIGDATA_LOOKUP_STAGE_0' && contract.status === 'CONTRACT_FROZEN');
  check('lookup layer is non-authoritative for canonical semantics', contract.authority?.lookupIndexRole?.includes('does not own or redefine canonical semantics'));
  check('raw source root is data/configdata', contract.authority?.rawSourceRoot === 'data/configdata');

  const expectedEntities = {
    Hero: 'data/configdata/ConfigDataHeroInfo.json',
    Soldier: 'data/configdata/ConfigDataSoldierInfo.json',
    Skill: 'data/configdata/ConfigDataSkillInfo.json',
    Equipment: 'data/configdata/ConfigDataEquipmentInfo.json',
  };

  for (const [entity, expectedSource] of Object.entries(expectedEntities)) {
    const declaration = contract.mvpEntities?.[entity];
    check(`${entity} source declaration`, declaration?.source === expectedSource, declaration?.source ?? null);
    check(`${entity} primary key is ID`, declaration?.primaryKey === 'ID', declaration?.primaryKey ?? null);
    check(`${entity} source exists`, sourcePathExists(expectedSource), expectedSource);
  }

  const separation = new Set(contract.semanticBoundary?.mustRemainSeparated ?? []);
  check('RAW_CONFIGDATA result class is declared', separation.has('RAW_CONFIGDATA'));
  check('PROJECT_CANONICAL result class is declared', separation.has('PROJECT_CANONICAL'));

  const forbidden = contract.forbiddenOperations ?? [];
  check('name JOIN is forbidden', forbidden.includes('name-based canonical JOIN'));
  check('ID arithmetic inference is forbidden', forbidden.includes('ID arithmetic inference'));
  check('generic numeric ID inference is forbidden', forbidden.includes('treat every numeric field as an ID reference'));
  check(
    'Hero-Soldier frozen membership recomputation is forbidden',
    forbidden.includes('recompute FINAL_FROZEN Hero-Soldier membership from raw ConfigData'),
  );

  check('reverse refs require an allowlist', contract.reverseReferencePolicy?.allowlistRequired === true);
  check('generic numeric reverse-ref scan is forbidden', contract.reverseReferencePolicy?.genericNumericFieldScanningAllowed === false);
  check('wall-clock timestamps are forbidden in frozen output', contract.determinism?.wallClockTimestampInFrozenOutput === false);
  check('stable ordering is required', contract.determinism?.stableOrderingRequired === true);

  const outputs = contract.indexPolicy?.stage1PlannedOutputs ?? [];
  check('Stage 1 declares four MVP outputs', outputs.length === 4, outputs);
  check('Stage 1 output paths are unique', new Set(outputs).size === outputs.length, outputs);
  check('Stage 1 outputs are rooted under data/index', outputs.every((value) => value.startsWith('data/index/')), outputs);
  check('full source record duplication is disabled by default', contract.indexPolicy?.duplicateFullSourceRecordsByDefault === false);
  check('name search cannot establish canonical joins', contract.indexPolicy?.nameSearchMayEstablishCanonicalJoin === false);
  check('Stage 0 defers materialization to Stage 1', contract.nextStage?.stage === 'CONFIGDATA_LOOKUP_STAGE_1');
}

const result = {
  stage: 'CONFIGDATA_LOOKUP_STAGE_0',
  status: failures.length === 0 ? 'PASS_CONFIGDATA_LOOKUP_STAGE0_CONTRACT' : 'FAIL_CONFIGDATA_LOOKUP_STAGE0_CONTRACT',
  checkCount: checks.length,
  failedCheckCount: failures.length,
  checks,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (failures.length > 0) {
  process.exitCode = 1;
}
