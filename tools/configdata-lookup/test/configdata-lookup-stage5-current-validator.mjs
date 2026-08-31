import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  buildStage5Summary,
  findEntity,
  loadStage5Contract,
  loadStage5Predecessor,
  lookupEntity,
  readJson,
  refsEntity,
  renderJson,
} from '../../../scripts/lib/configdata-lookup-stage5.mjs';

const contract = await loadStage5Contract();
assert.equal(contract.status, 'CLI_CONTRACT_FROZEN');
assert.equal(contract.cliPolicy.readOnly, true);
assert.equal(contract.cliPolicy.rawConfigDataRead, false);
assert.equal(contract.cliPolicy.transitiveExpansion, false);
assert.equal(contract.cliPolicy.nameJoin, false);
assert.equal(contract.cliPolicy.idArithmetic, false);

const predecessor = await loadStage5Predecessor(contract);
assert.equal(predecessor.contract.stage, 'CONFIGDATA_LOOKUP_STAGE_4');
assert.equal(predecessor.summary.status, contract.predecessor.requiredStatus);

const inputPaths = [
  ...Object.values(contract.inputs.idLocator),
  ...Object.values(contract.inputs.forward),
  ...Object.values(contract.inputs.reverse),
  ...Object.values(contract.inputs.canonicalOverlay),
];
for (const path of inputPaths) {
  assert.equal(path.startsWith('data/index/'), true, `Stage 5 input must remain materialized: ${path}`);
  assert.equal(path.includes('/configdata/'), false, `Stage 5 input must not be raw ConfigData: ${path}`);
}

const hero = await lookupEntity('Hero', '6', contract);
assert.equal(hero.locator?.recordIndex !== undefined, true);
assert.equal(hero.forward.every(group => group.sourceType === 'Hero'), true);
const soldier = await lookupEntity('Soldier', '102', contract);
assert.equal(soldier.locator?.label !== undefined, true);
const equipment = await lookupEntity('Equipment', '273', contract);
assert.equal(equipment.locator?.label !== undefined, true);

const reverseSkillIndex = (await readJson(contract.inputs.reverse.Skill)).value;
const sampleReverseSkillId = Object.keys(reverseSkillIndex.byTargetId)[0];
const reverseSkill = await refsEntity('Skill', sampleReverseSkillId, contract);
assert.equal(reverseSkill.reverse.length > 0, true);

const soldierIndex = (await readJson(contract.inputs.idLocator.Soldier)).value;
const sampleLabelEntry = soldierIndex.index.entries.find(entry => entry.length >= 3 && typeof entry[2] === 'string' && entry[2].length > 0);
assert.ok(sampleLabelEntry);
const found = await findEntity('Soldier', sampleLabelEntry[2], 5, contract);
assert.equal(found.results.some(item => item.id === sampleLabelEntry[0]), true);

const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
const expectedScripts = {
  lookup: 'node tools/configdata-lookup/cli/run.mjs lookup',
  refs: 'node tools/configdata-lookup/cli/run.mjs refs',
  find: 'node tools/configdata-lookup/cli/run.mjs find',
  'build:configdata-lookup-stage5': 'node scripts/build-configdata-lookup-stage5.mjs',
  'validate:configdata-lookup-stage5': 'node tools/configdata-lookup/test/configdata-lookup-stage5-current-validator.mjs',
};
for (const [name, command] of Object.entries(expectedScripts)) {
  assert.equal(packageJson.scripts?.[name], command, `package script ${name} mismatch`);
}

const expectedSummary = buildStage5Summary(contract, predecessor.summary);
const actualSummaryText = await fs.readFile(contract.outputs.summary, 'utf8');
assert.equal(actualSummaryText, renderJson(expectedSummary), 'Stage 5 summary is stale or non-deterministic');

console.log(JSON.stringify({
  status: 'PASS_CONFIGDATA_LOOKUP_STAGE5_CURRENT_VALIDATOR',
  historicalContract: contract.stage,
  predecessorStatus: predecessor.summary.status,
  publicCliAuthority: 'tools/configdata-lookup/cli/run.mjs',
  rawConfigDataReadCount: 0,
  semanticRecomputationCount: 0,
}, null, 2));
