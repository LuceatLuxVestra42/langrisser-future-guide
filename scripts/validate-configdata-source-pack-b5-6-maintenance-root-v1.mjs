import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACT = 'data/contracts/configdata-source-pack-b5-6-maintenance-root.v1.json';
const EXPECTED_COUNT = 753;
const MAINTENANCE_IMPORT = 'configdata-source-pack-maintenance-root';

function fail(message, detail = null) {
  const error = new Error(message);
  error.detail = detail;
  throw error;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function requireIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing required boundary marker`, needle);
}

function walkFiles(relativeDir) {
  const root = path.join(ROOT, relativeDir);
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function countTrackedConfigData() {
  const dir = path.join(ROOT, 'data', 'configdata');
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || !entry.name.endsWith('.json'))) {
    fail('B5.6 requires the pre-B6 tracked ConfigData root to remain an exact direct-JSON set');
  }
  return entries.length;
}

function validatePredecessors(contract) {
  const b2 = json(contract.authoritativePredecessors.sourcePack.path);
  if (
    b2?.stage !== contract.authoritativePredecessors.sourcePack.requiredStage ||
    b2?.status !== contract.authoritativePredecessors.sourcePack.requiredStatus ||
    b2?.coverage?.fileCount !== EXPECTED_COUNT ||
    b2?.authority?.logicalRawPathNamespace !== 'data/configdata' ||
    b2?.storage?.immutabilityPolicy !== 'CONTENT_HASH_PINNED_FAIL_CLOSED'
  ) fail('B2 source-pack predecessor drift');

  const b5 = json(contract.authoritativePredecessors.deletionAdmission.path);
  if (
    b5?.stage !== 'repository-size-reduction-B5' ||
    b5?.status !== 'PASS' ||
    b5?.completion !== 'CONFIGDATA_SOURCE_PACK_B5_DELETION_ADMISSION_COMPLETE' ||
    b5?.deletionAdmission?.admittedDeletionCount !== EXPECTED_COUNT
  ) fail('B5 deletion-admission predecessor drift');

  const b55 = json(contract.authoritativePredecessors.operationalCutover.path);
  if (
    b55?.stage !== 'repository-size-reduction-B5.5' ||
    b55?.status !== 'PASS' ||
    b55?.completion !== 'CONFIGDATA_LOOKUP_B5_5_OPERATIONAL_CUTOVER_COMPLETE' ||
    b55?.migrationState?.operationalCutoverCompleted !== true
  ) fail('B5.5 operational-cutover predecessor drift');
}

function validateResolverBoundary() {
  const cjs = read('scripts/configdata-source-pack-maintenance-root.cjs');
  const esm = read('scripts/configdata-source-pack-maintenance-root.mjs');

  for (const marker of [
    "const EXPECTED_FILE_COUNT = 753",
    "process.env.CONFIGDATA_SOURCE_ROOT",
    "process.env.RUNNER_TEMP || os.tmpdir()",
    "hydrate-configdata-source-pack-v1.mjs",
    "CONTENT_HASH_PINNED_FAIL_CLOSED",
    "tracked ConfigData root is partial",
    "spawnSync(process.execPath",
  ]) requireIncludes(cjs, marker, 'maintenance resolver');
  requireIncludes(esm, "require('./configdata-source-pack-maintenance-root.cjs')", 'maintenance ESM wrapper');

  const direct = read('scripts/lib/configdata-direct.cjs');
  requireIncludes(direct, "require('../configdata-source-pack-maintenance-root.cjs')", 'shared direct adapter');
  requireIncludes(direct, 'const CONFIG_DIR = resolveConfigDataDir();', 'shared direct adapter');

  const movement = read('scripts/build_shared_movement_types.mjs');
  requireIncludes(movement, "resolveConfigDataFile('ConfigDataJobInfo.json')", 'shared movement reader');
  requireIncludes(movement, "resolveConfigDataFile('ConfigDataSoldierInfo.json')", 'shared movement reader');
  requireIncludes(movement, "jobInfo: 'data/configdata/ConfigDataJobInfo.json'", 'shared movement logical provenance');
  requireIncludes(movement, "soldierInfo: 'data/configdata/ConfigDataSoldierInfo.json'", 'shared movement logical provenance');

  const equipment = read('scripts/analyze-equipment-acquisition.mjs');
  requireIncludes(equipment, "resolveConfigDataFile('ConfigDataEquipmentInfo.json')", 'equipment acquisition reader');
  requireIncludes(equipment, "equipment:'data/configdata/ConfigDataEquipmentInfo.json'", 'equipment acquisition logical provenance');

  const heroDisplay = read('scripts/investigate_hero_display_stats.cjs');
  requireIncludes(heroDisplay, "resolveConfigDataFile('ConfigDataHeroInfo.json')", 'hero display reader');
  requireIncludes(heroDisplay, "resolveConfigDataFile('ConfigDataJobInfo.json')", 'hero display reader');
  requireIncludes(heroDisplay, "'data/configdata/ConfigDataHeroInfo.json'", 'hero display logical provenance');
  requireIncludes(heroDisplay, "'data/configdata/ConfigDataJobInfo.json'", 'hero display logical provenance');
}

function validateNoRuntimeLeak() {
  const forbiddenRoots = ['src', 'tools/configdata-lookup'];
  const offenders = [];
  for (const relativeRoot of forbiddenRoots) {
    for (const file of walkFiles(relativeRoot)) {
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      if (text.includes(MAINTENANCE_IMPORT)) offenders.push(path.relative(ROOT, file).replaceAll('\\', '/'));
    }
  }
  if (offenders.length) fail('maintenance ConfigData resolver leaked into production or normal Lookup boundary', offenders);
}

function main() {
  const contract = json(CONTRACT);
  if (
    contract?.version !== 1 ||
    contract?.stage !== 'repository-size-reduction-B5.6' ||
    !['READY_FOR_VALIDATION', 'PASS'].includes(contract?.status) ||
    contract?.owner !== 'configdata-source-pack'
  ) fail('B5.6 contract header drift');

  if (
    contract?.semanticBoundary?.semanticAuthorityChanged !== false ||
    contract?.semanticBoundary?.frozenSemanticDomainsReopened !== false ||
    contract?.semanticBoundary?.canonicalIdentityChanges !== false ||
    contract?.semanticBoundary?.relationChanges !== false ||
    contract?.semanticBoundary?.sourceMeaningReinterpreted !== false ||
    contract?.productionBoundary?.productionRuntimeChanged !== false ||
    contract?.productionBoundary?.normalLookupRawFallback !== false
  ) fail('B5.6 semantic or runtime boundary drift');

  validatePredecessors(contract);
  validateResolverBoundary();
  validateNoRuntimeLeak();

  const trackedCount = countTrackedConfigData();
  if (trackedCount !== EXPECTED_COUNT) fail('B5.6 must not perform the B6 deletion', { expected: EXPECTED_COUNT, actual: trackedCount });

  console.log(JSON.stringify({
    status: 'PASS',
    checkpoint: 'CONFIGDATA_SOURCE_PACK_B5_6_MAINTENANCE_ROOT_BOUNDARY',
    trackedConfigDataJsonCount: trackedCount,
    maintenanceResolverRestrictedToScripts: true,
    logicalProvenanceChanged: false,
    semanticAuthorityChanged: false,
    frozenSemanticDomainsReopened: false,
    productionRuntimeChanged: false,
    normalLookupRawFallback: false,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`CONFIGDATA SOURCE PACK B5.6: FAIL - ${error.message}`);
  if (error.detail !== undefined && error.detail !== null) console.error(JSON.stringify(error.detail, null, 2));
  process.exit(1);
}
