#!/usr/bin/env node
import fs from 'node:fs';
import {
  STAGE7_CONTRACT_PATH,
  buildStage7Summary,
  loadStage7Inputs,
  selectSmartRegression,
} from './lib/configdata-lookup-stage7.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameArray(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function validateFixture(inputs, label, changedPaths, expected) {
  const plan = selectSmartRegression(changedPaths, inputs);
  assert(plan.status === expected.status, `${label}: status ${plan.status} != ${expected.status}`);
  assert(sameArray(plan.affectedDomains, expected.domains), `${label}: domains ${JSON.stringify(plan.affectedDomains)} != ${JSON.stringify(expected.domains)}`);
  assert(sameArray(plan.selectedPipelines, expected.pipelines), `${label}: pipelines ${JSON.stringify(plan.selectedPipelines)} != ${JSON.stringify(expected.pipelines)}`);
  assert(plan.failClosed === Boolean(expected.failClosed), `${label}: failClosed mismatch`);
  return plan;
}

try {
  const inputs = loadStage7Inputs();
  const { contract, stage6Summary, stage6Manifest, stage2Contract, stage4Contract } = inputs;

  assert(contract.stage === 'CONFIGDATA_LOOKUP_STAGE_7', 'Stage 7 contract stage mismatch.');
  assert(contract.status === 'SMART_REGRESSION_CONTRACT_FROZEN', 'Stage 7 contract is not frozen.');
  assert(stage6Summary.status === contract.predecessor.requiredStatus, `Stage 6 predecessor status mismatch: ${stage6Summary.status}`);
  assert(stage6Manifest.status === 'DEPENDENCY_MANIFEST_MATERIALIZED', `Stage 6 dependency manifest status mismatch: ${stage6Manifest.status}`);

  const rawFromStage6 = Object.keys(stage6Manifest.rawSources || {}).sort();
  const rawFromStage2 = Object.values(stage2Contract.sourceTypes || {}).sort();
  assert(sameArray(rawFromStage6, rawFromStage2), 'Stage 2 sourceTypes and Stage 6 rawSources differ.');

  const stage6Domains = Object.keys(stage6Manifest.layers?.stage2?.domains || {}).sort();
  const stage4Domains = Object.keys(stage6Manifest.layers?.stage4?.domains || {}).sort();
  const pipelineDomains = Object.values(contract.pipelines)
    .filter((pipeline) => pipeline.kind === 'PAGE_VALIDATION')
    .map((pipeline) => pipeline.domain)
    .sort();
  assert(sameArray(stage6Domains, ['Equipment', 'Hero', 'Soldier']), `Unexpected Stage 6 Stage 2 domains: ${JSON.stringify(stage6Domains)}`);
  assert(sameArray(stage4Domains, ['Equipment', 'Hero', 'Soldier']), `Unexpected Stage 6 Stage 4 domains: ${JSON.stringify(stage4Domains)}`);
  assert(sameArray(pipelineDomains, ['Equipment', 'Hero', 'Soldier']), `Stage 7 page pipeline domains mismatch: ${JSON.stringify(pipelineDomains)}`);

  const canonicalNames = Object.keys(stage4Contract.canonicalInputs || {}).sort();
  const mappedCanonicalNames = Object.keys(contract.canonicalImpact || {}).sort();
  assert(sameArray(canonicalNames, mappedCanonicalNames), 'Every admitted Stage 4 canonical input must have exactly one Stage 7 impact mapping entry.');
  for (const [name, domains] of Object.entries(contract.canonicalImpact || {})) {
    assert(Array.isArray(domains) && domains.length > 0, `${name}: canonical impact must be a non-empty domain list.`);
    for (const domain of domains) {
      assert(pipelineDomains.includes(domain), `${name}: unknown impact domain ${domain}`);
    }
    const manifestPath = stage6Manifest.layers?.stage4?.canonicalInputs?.[name]?.path;
    assert(manifestPath === stage4Contract.canonicalInputs[name].path, `${name}: Stage 4 canonical path drifted from Stage 6 manifest.`);
  }

  const pipelineOrder = contract.selectionPolicy?.pipelineOrder || [];
  assert(sameArray(pipelineOrder, ['ConfigDataLookup', 'Hero', 'Soldier', 'Equipment']), `Pipeline order drifted: ${JSON.stringify(pipelineOrder)}`);
  assert(new Set(pipelineOrder).size === Object.keys(contract.pipelines).length, 'Pipeline order must cover every allowlisted pipeline exactly once.');

  for (const name of pipelineOrder) {
    const pipeline = contract.pipelines[name];
    assert(pipeline, `${name}: missing pipeline definition.`);
    assert(Array.isArray(pipeline.command) && pipeline.command.length >= 2, `${name}: invalid command argv.`);
    assert(pipeline.command[0] === 'node', `${name}: only explicit node validator commands are admitted.`);
    assert(fs.existsSync(pipeline.command[1]), `${name}: validator script does not exist: ${pipeline.command[1]}`);
    assert(fs.existsSync(pipeline.workflow), `${name}: workflow file does not exist: ${pipeline.workflow}`);
  }

  assert(contract.executionPolicy?.validationOnly === true, 'Stage 7 must remain validation-only.');
  assert(contract.executionPolicy?.workflowDispatch === false, 'Stage 7 must not dispatch downstream workflows.');
  assert(contract.executionPolicy?.semanticRebuild === false, 'Stage 7 must not rebuild page semantics.');
  assert(contract.executionPolicy?.allowlistedCommandsOnly === true, 'Stage 7 runner must remain allowlist-only.');
  assert(contract.executionPolicy?.shellCommandConstructionFromChangedPath === false, 'Changed paths must never construct shell commands.');

  for (const [key, value] of Object.entries(contract.semanticBoundary || {})) {
    assert(value === false, `Stage 7 semantic boundary ${key} must remain false.`);
  }

  const fixtures = [
    validateFixture(inputs, 'hero-raw', [stage2Contract.sourceTypes.Hero], {
      status: 'IMPACT_DETECTED',
      domains: ['Hero'],
      pipelines: ['ConfigDataLookup', 'Hero'],
    }),
    validateFixture(inputs, 'soldier-raw', [stage2Contract.sourceTypes.TrainingTechLevel], {
      status: 'IMPACT_DETECTED',
      domains: ['Soldier'],
      pipelines: ['ConfigDataLookup', 'Soldier'],
    }),
    validateFixture(inputs, 'equipment-raw', [stage2Contract.sourceTypes.Equipment], {
      status: 'IMPACT_DETECTED',
      domains: ['Equipment'],
      pipelines: ['ConfigDataLookup', 'Equipment'],
    }),
    validateFixture(inputs, 'shared-skill', [stage2Contract.sourceTypes.Skill], {
      status: 'IMPACT_DETECTED',
      domains: ['Hero', 'Soldier', 'Equipment'],
      pipelines: ['ConfigDataLookup', 'Hero', 'Soldier', 'Equipment'],
    }),
    validateFixture(inputs, 'canonical-hero', [stage4Contract.canonicalInputs.heroSoldierByHero.path], {
      status: 'IMPACT_DETECTED',
      domains: ['Hero'],
      pipelines: ['ConfigDataLookup', 'Hero'],
    }),
    validateFixture(inputs, 'canonical-equipment', [stage4Contract.canonicalInputs.exclusiveEquipmentByEquipment.path], {
      status: 'IMPACT_DETECTED',
      domains: ['Equipment'],
      pipelines: ['ConfigDataLookup', 'Equipment'],
    }),
    validateFixture(inputs, 'stage2-artifact', [stage6Manifest.layers.stage2.domains.Soldier.output], {
      status: 'IMPACT_DETECTED',
      domains: ['Soldier'],
      pipelines: ['ConfigDataLookup', 'Soldier'],
    }),
    validateFixture(inputs, 'lookup-only-reverse', [stage6Manifest.layers.stage3.targets.Skill.path], {
      status: 'IMPACT_DETECTED',
      domains: [],
      pipelines: ['ConfigDataLookup'],
    }),
    validateFixture(inputs, 'no-impact', ['README.md'], {
      status: 'NO_CONFIGDATA_IMPACT',
      domains: [],
      pipelines: [],
    }),
    validateFixture(inputs, 'unknown-configdata', ['data/configdata/ConfigDataFutureUnknownInfo.json'], {
      status: 'FAIL_CLOSED_ALL_KNOWN_DOMAINS',
      domains: ['Hero', 'Soldier', 'Equipment'],
      pipelines: ['ConfigDataLookup', 'Hero', 'Soldier', 'Equipment'],
      failClosed: true,
    }),
  ];

  assert(fixtures.length === 10, 'Stage 7 fixture count drifted.');

  const summary = buildStage7Summary(inputs);
  const rendered = `${JSON.stringify(summary, null, 2)}\n`;
  const summaryPath = contract.outputs.summary;
  assert(fs.existsSync(summaryPath), `Stage 7 summary is missing: ${summaryPath}`);
  assert(fs.readFileSync(summaryPath, 'utf8') === rendered, `Stage 7 summary is stale. Expected deterministic output:\n${rendered}`);

  console.log(JSON.stringify({
    status: summary.status,
    predecessorStatus: summary.predecessorStatus,
    dependencyManifestStatus: summary.dependencyManifestStatus,
    pipelineCount: summary.pipelineCount,
    domainPipelineCount: summary.domainPipelineCount,
    trackedRawSourceCount: summary.trackedRawSourceCount,
    canonicalInputCount: summary.canonicalInputCount,
    fixtureCount: fixtures.length,
    contract: STAGE7_CONTRACT_PATH,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
