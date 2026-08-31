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
} from './lib/configdata-lookup-stage5.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectIndexPaths(contract) {
  return [
    ...Object.values(contract.inputs.idLocator),
    ...Object.values(contract.inputs.forward),
    ...Object.values(contract.inputs.reverse),
    ...Object.values(contract.inputs.canonicalOverlay),
  ];
}

function assertNoRawRecord(value, context) {
  if (!value || typeof value !== 'object') return;
  assert(!Object.hasOwn(value, 'rawRecord'), `${context}: rawRecord must never be exposed`);
  for (const [key, child] of Object.entries(value)) assertNoRawRecord(child, `${context}.${key}`);
}

async function main() {
  const contract = await loadStage5Contract();
  assert(contract.status === 'CLI_CONTRACT_FROZEN', 'Stage 5 contract is not frozen');
  assert(contract.cliPolicy.readOnly === true, 'Stage 5 must be read-only');
  assert(contract.cliPolicy.rawConfigDataRead === false, 'Stage 5 raw source reads must be disabled');
  assert(contract.cliPolicy.transitiveExpansion === false, 'Stage 5 transitive expansion must be disabled');
  assert(contract.cliPolicy.nameJoin === false, 'Stage 5 name JOIN must be disabled');
  assert(contract.cliPolicy.idArithmetic === false, 'Stage 5 ID arithmetic must be disabled');

  const predecessor = await loadStage5Predecessor(contract);
  assert(predecessor.contract.stage === 'CONFIGDATA_LOOKUP_STAGE_4', 'Stage 5 predecessor contract is not Stage 4');
  assert(predecessor.summary.status === contract.predecessor.requiredStatus, `Stage 4 predecessor status=${predecessor.summary.status}`);

  for (const filePath of collectIndexPaths(contract)) {
    assert(filePath.startsWith('data/index/'), `Stage 5 input must be a materialized index: ${filePath}`);
    assert(!filePath.includes('/configdata/'), `Stage 5 input must not be a raw source path: ${filePath}`);
  }

  for (const [entity, filePath] of Object.entries(contract.inputs.idLocator)) {
    const index = (await readJson(filePath)).value;
    assert(index.stage === 'CONFIGDATA_LOOKUP_STAGE_1', `${entity}: locator stage mismatch`);
    assert(index.status === 'ID_INDEX_MATERIALIZED', `${entity}: locator status mismatch`);
    assert(index.entity === entity, `${entity}: locator entity mismatch`);
  }

  for (const [domain, filePath] of Object.entries(contract.inputs.forward)) {
    const index = (await readJson(filePath)).value;
    assert(index.stage === 'CONFIGDATA_LOOKUP_STAGE_2', `${domain}: forward stage mismatch`);
    assert(index.status === 'FORWARD_JOIN_INDEX_MATERIALIZED', `${domain}: forward status mismatch`);
    assert(index.domain === domain, `${domain}: forward domain mismatch`);
  }

  for (const [targetType, filePath] of Object.entries(contract.inputs.reverse)) {
    const index = (await readJson(filePath)).value;
    assert(index.stage === 'CONFIGDATA_LOOKUP_STAGE_3', `${targetType}: reverse stage mismatch`);
    assert(index.status === 'REVERSE_REFERENCE_INDEX_MATERIALIZED', `${targetType}: reverse status mismatch`);
    assert(index.targetType === targetType, `${targetType}: reverse targetType mismatch`);
  }

  for (const [domain, filePath] of Object.entries(contract.inputs.canonicalOverlay)) {
    const index = (await readJson(filePath)).value;
    assert(index.stage === 'CONFIGDATA_LOOKUP_STAGE_4', `${domain}: overlay stage mismatch`);
    assert(index.status === 'CANONICAL_OVERLAY_MATERIALIZED', `${domain}: overlay status mismatch`);
    assert(index.domain === domain, `${domain}: overlay domain mismatch`);
  }

  const hero = await lookupEntity('hero', '6', contract);
  assert(hero.entity === 'Hero' && hero.id === '6', 'lookup entity/ID normalization failed');
  assert(hero.locator?.recordIndex !== undefined, 'Hero 6 locator missing');
  assert(hero.forward.every((group) => group.sourceType === 'Hero'), 'Hero lookup leaked another Stage 2 source type');
  assert(hero.canonical.some((group) => group.projection === 'canonical.heroSoldiers'), 'Hero 6 canonical Soldier overlay missing');
  assert(hero.canonical.some((group) => group.projection === 'canonical.heroExclusiveEquipment'), 'Hero 6 exclusive Equipment overlay missing');
  assertNoRawRecord(hero, 'heroLookup');

  const soldier = await lookupEntity('Soldier', '102', contract);
  assert(soldier.locator?.label !== undefined, 'Soldier 102 discovery label missing');
  assert(soldier.forward.every((group) => group.sourceType === 'Soldier'), 'Soldier lookup leaked another Stage 2 source type');
  assert(soldier.canonical.some((group) => group.projection === 'canonical.soldierHeroes'), 'Soldier 102 canonical Hero overlay missing');
  assertNoRawRecord(soldier, 'soldierLookup');

  const equipment = await lookupEntity('Equipment', '273', contract);
  assert(equipment.locator?.label !== undefined, 'Equipment 273 discovery label missing');
  assert(equipment.forward.every((group) => group.sourceType === 'Equipment'), 'Equipment lookup leaked another Stage 2 source type');
  assert(equipment.canonical.some((group) => group.projection === 'canonical.exclusiveEquipmentHero'), 'Equipment 273 canonical Hero overlay missing');
  assertNoRawRecord(equipment, 'equipmentLookup');

  const skillIndex = (await readJson(contract.inputs.idLocator.Skill)).value;
  const sampleSkillId = skillIndex.index.entries[0][0];
  const skill = await lookupEntity('Skill', sampleSkillId, contract);
  assert(skill.locator !== null, `Skill ${sampleSkillId} locator missing`);
  assert(skill.forward.length === 0, 'Skill lookup must not invent forward refs');
  assertNoRawRecord(skill, 'skillLookup');

  const reverseSkillIndex = (await readJson(contract.inputs.reverse.Skill)).value;
  const sampleReverseSkillId = Object.keys(reverseSkillIndex.byTargetId)[0];
  const reverseSkill = await refsEntity('skill', sampleReverseSkillId, contract);
  assert(reverseSkill.reverse.length > 0, `Skill ${sampleReverseSkillId} reverse refs missing`);
  assert(reverseSkill.reverse.every((group) => group.targetType === 'Skill'), 'Skill reverse targetType mismatch');
  assertNoRawRecord(reverseSkill, 'skillRefs');

  const soldierIndex = (await readJson(contract.inputs.idLocator.Soldier)).value;
  const sampleLabelEntry = soldierIndex.index.entries.find((entry) => entry.length >= 3 && typeof entry[2] === 'string' && entry[2].length > 0);
  assert(sampleLabelEntry, 'Soldier discovery label sample missing');
  const found = await findEntity('soldier', sampleLabelEntry[2], 5, contract);
  assert(found.results.some((item) => item.id === sampleLabelEntry[0]), 'literal Soldier discovery search did not return its source entry');

  const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const expectedScripts = {
    lookup: 'node scripts/configdata-lookup-cli.mjs lookup',
    refs: 'node scripts/configdata-lookup-cli.mjs refs',
    find: 'node scripts/configdata-lookup-cli.mjs find',
    'build:configdata-lookup-stage5': 'node scripts/build-configdata-lookup-stage5.mjs',
    'validate:configdata-lookup-stage5': 'node scripts/validate-configdata-lookup-stage5.mjs',
  };
  for (const [name, command] of Object.entries(expectedScripts)) {
    assert(packageJson.scripts?.[name] === command, `package script ${name} mismatch`);
  }

  const libraryText = await fs.readFile('scripts/lib/configdata-lookup-stage5.mjs', 'utf8');
  const cliText = await fs.readFile('scripts/configdata-lookup-cli.mjs', 'utf8');
  assert(!libraryText.includes('data/configdata/'), 'Stage 5 library must not hard-code a raw ConfigData path');
  assert(!cliText.includes('writeFile('), 'Stage 5 CLI entrypoint must not mutate files');
  assert(!cliText.includes('writeText('), 'Stage 5 CLI entrypoint must not invoke summary writes');

  const expectedSummary = buildStage5Summary(contract, predecessor.summary);
  const actualSummaryText = await fs.readFile(contract.outputs.summary, 'utf8');
  assert(actualSummaryText === renderJson(expectedSummary), 'Stage 5 summary is stale or non-deterministic');
  assert(expectedSummary.semanticBoundary.rawConfigDataRead === false, 'summary raw source boundary violated');
  assert(expectedSummary.semanticBoundary.transitiveExpansion === false, 'summary transitive boundary violated');
  assert(expectedSummary.semanticBoundary.canonicalRelationsRecomputed === false, 'summary canonical recomputation boundary violated');
  assert(expectedSummary.semanticBoundary.nameJoinUsed === false, 'summary name JOIN boundary violated');
  assert(expectedSummary.semanticBoundary.idArithmeticUsed === false, 'summary ID arithmetic boundary violated');

  console.log(`lookup Hero 6: PASS (${hero.forward.length} direct groups / ${hero.canonical.length} canonical groups)`);
  console.log(`lookup Soldier 102: PASS (${soldier.forward.length} direct groups / ${soldier.canonical.length} canonical groups)`);
  console.log(`lookup Equipment 273: PASS (${equipment.forward.length} direct groups / ${equipment.canonical.length} canonical groups)`);
  console.log(`refs Skill ${sampleReverseSkillId}: PASS (${reverseSkill.reverse.length} incoming groups)`);
  console.log(`find Soldier ${JSON.stringify(sampleLabelEntry[2])}: PASS (${found.totalMatchCount} matches)`);
  console.log(expectedSummary.status);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
