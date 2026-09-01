import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  findEntity,
  lookupEntity,
  refsEntity,
} from '../lib/lookup.mjs';
import { checkLookupFreshness } from '../lib/freshness.mjs';

const runtime = JSON.parse(fs.readFileSync('tools/configdata-lookup/contracts/runtime.v1.json', 'utf8'));
assert.equal(runtime.schemaId, 'configdata-lookup-runtime/v1');
assert.equal(runtime.stage, 'CLR2');
assert.equal(runtime.status, 'ADAPTER_NAMESPACE');
assert.equal(runtime.runtimeBoundary.readOnly, true);
assert.equal(runtime.runtimeBoundary.rebuildExposed, false);
assert.equal(runtime.runtimeBoundary.domainFanOut, false);
assert.equal(runtime.runtimeBoundary.pageValidatorSelection, false);
assert.equal(runtime.runtimeBoundary.hostedQaSelection, false);
assert.equal(runtime.runtimeBoundary.projectDoctorRuntimeDependency, false);

const hero = await lookupEntity('Hero', '6');
assert.equal(hero.found, true);
assert.equal(hero.entity, 'Hero');
assert.equal(hero.id, '6');

const soldier = await lookupEntity('Soldier', '102');
assert.equal(soldier.found, true);

const equipment = await lookupEntity('Equipment', '273');
assert.equal(equipment.found, true);

const skillRefs = await refsEntity('Skill', '3001');
assert.equal(skillRefs.found, true);
assert.equal(skillRefs.reverse.length > 0, true);

const soldierFind = await findEntity('Soldier', '枪兵');
assert.equal(soldierFind.totalMatchCount > 0, true);

const freshness = await checkLookupFreshness();
assert.equal(freshness.status, 'CLEAN_CONFIGDATA_LOOKUP_STAGE6');
assert.equal(freshness.staleCount, 0);

const codePaths = [
  'tools/configdata-lookup/lib/lookup.mjs',
  'tools/configdata-lookup/lib/freshness.mjs',
  'tools/configdata-lookup/cli/run.mjs',
  'tools/configdata-lookup/cli/check-freshness.mjs',
];
const forbiddenTokens = [
  'configdata-lookup-stage7',
  'configdata-lookup-stage8',
  'project-doctor',
  'rebuildIncrementally',
  'writeFile',
  'appendFile',
];
for (const codePath of codePaths) {
  const text = fs.readFileSync(codePath, 'utf8');
  for (const token of forbiddenTokens) {
    assert.equal(text.includes(token), false, `${codePath} must not depend on ${token}`);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'CONFIGDATA_LOOKUP_CLR2_NAMESPACE_SMOKE',
  fixtures: {
    lookupHero6: true,
    lookupSoldier102: true,
    lookupEquipment273: true,
    refsSkill3001: true,
    findSoldierLiteral: true,
    staleCount: freshness.staleCount,
  },
  boundaries: {
    repositoryMutationCount: 0,
    semanticMutationCount: 0,
    domainFanOutCount: 0,
    legacyStage7RuntimeDependencyCount: 0,
    legacyStage8RuntimeDependencyCount: 0,
    projectDoctorRuntimeDependencyCount: 0,
  },
}, null, 2));
