#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = 'data/contracts/smart-regression-project-doctor-sr9a.v1.json';
const outputPath = 'data/generated/smart-regression-project-doctor-input.v1.json';

function readJson(repoPath) {
  return JSON.parse(readFileSync(path.join(repoRoot, repoPath), 'utf8'));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateSources(contract, sources) {
  invariant(contract.schemaVersion === 1, 'Unsupported SR-9A contract schemaVersion.');
  invariant(contract.status === 'DESIGN_FROZEN', 'SR-9A contract must be DESIGN_FROZEN.');
  invariant(sources.bindings.id === 'smart-regression-bindings-sr3-v1', 'Unexpected SR-3 bindings id.');
  invariant(sources.bindings.status === 'SR3_VERIFIED_PARTIAL_BINDING', 'Unexpected SR-3 bindings status.');
  invariant(sources.fallback.id === 'smart-regression-fallback-policy-sr4-v1', 'Unexpected SR-4 fallback policy id.');
  invariant(sources.fallback.status === 'SR4_FROZEN', 'Unexpected SR-4 fallback status.');
  invariant(sources.sr5.stage === 'SMART_REGRESSION_SR5' && sources.sr5.completion === 'COMPLETE', 'SR-5 checkpoint is not complete.');
  invariant(sources.sr6.stage === 'SMART_REGRESSION_SR6' && sources.sr6.completion === 'COMPLETE', 'SR-6 checkpoint is not complete.');
  invariant(sources.sr7.stage === 'SMART_REGRESSION_SR7' && sources.sr7.completion === 'COMPLETE', 'SR-7 checkpoint is not complete.');
  invariant(sources.sr8Policy.id === 'smart-regression-partial-replacement-sr8-v1', 'Unexpected SR-8 replacement policy id.');
  invariant(sources.sr8.stage === 'SMART_REGRESSION_SR8' && sources.sr8.completion === 'COMPLETE', 'SR-8 checkpoint is not complete.');

  const bound = Object.keys(sources.bindings.bindings ?? {});
  const unresolved = sources.bindings.unresolvedGateIds ?? [];
  invariant(bound.length === new Set(bound).size, 'Duplicate bound gate ids.');
  invariant(unresolved.length === new Set(unresolved).size, 'Duplicate unresolved gate ids.');
  invariant(bound.every((id) => !unresolved.includes(id)), 'A gate cannot be both bound and unresolved.');
  invariant(sources.sr5.metrics?.falseNegativeCount === 0, 'SR-5 falseNegativeCount must be zero.');
  invariant(sources.sr6.sr5RuntimeProof?.falseNegativeCount === 0, 'SR-6 runtime SR-5 falseNegativeCount must be zero.');
  invariant(sources.sr7.metrics?.observedFalseNegativeCount === 0, 'SR-7 observedFalseNegativeCount must be zero.');
  invariant(sources.sr7.metrics?.replayErrorCount === 0, 'SR-7 replayErrorCount must be zero.');
  invariant(sources.sr8.confirmed?.actualReplacementExecutionObserved === true, 'SR-8 actual replacement execution evidence is required.');
  invariant(sources.sr8.confirmed?.broadCIReplacementAllowed === false, 'SR-8 broad replacement must remain disabled.');
  invariant((sources.sr8Policy.classes ?? []).length === sources.sr8.replacementPolicy?.initialReplacementClassCount, 'SR-8 replacement class count mismatch.');

  const fallbackMembers = sources.fallback.safeFallbackMembers ?? [];
  invariant(unresolved.every((id) => fallbackMembers.includes(id)), 'Every unresolved gate must remain represented in broad safe fallback coverage.');
}

function buildOutput(contract, sources) {
  validateSources(contract, sources);

  const boundGateIds = uniqueSorted(Object.keys(sources.bindings.bindings ?? {}));
  const unresolvedGateIds = uniqueSorted(sources.bindings.unresolvedGateIds ?? []);
  const replacementClasses = sources.sr8Policy.classes ?? [];
  const broadReplacementAllowed = sources.sr8.confirmed?.broadCIReplacementAllowed === true;

  const reviews = [];
  if (unresolvedGateIds.length > 0) {
    reviews.push({
      code: 'UNRESOLVED_GATE_BINDINGS',
      scope: 'source-evidence',
      blocking: false,
      source: contract.sources.bindings,
      detail: `${unresolvedGateIds.length} Smart Regression gates remain intentionally unbound and fail closed when selected.`
    });
  }
  if (!broadReplacementAllowed) {
    reviews.push({
      code: 'BROAD_CI_REPLACEMENT_DISABLED',
      scope: 'source-evidence',
      blocking: false,
      source: contract.sources.sr8Checkpoint,
      detail: 'Only explicitly allowlisted narrow replacement classes may replace legacy orchestration; broad replacement remains disabled.'
    });
  }

  const hardFailure =
    sources.sr5.metrics.falseNegativeCount > 0 ||
    sources.sr6.sr5RuntimeProof.falseNegativeCount > 0 ||
    sources.sr7.metrics.observedFalseNegativeCount > 0 ||
    sources.sr7.metrics.replayErrorCount > 0 ||
    sources.sr8.sr8Tests.failedCaseCount > 0;

  const operationalHealth = hardFailure
    ? 'FAIL'
    : (unresolvedGateIds.length > 0 || !broadReplacementAllowed ? 'REVIEW' : 'PASS');

  return {
    version: 1,
    schemaId: contract.normalizedOutput.schemaId,
    stage: 'SMART_REGRESSION_SR9C',
    status: 'COLLECTED',
    integrationRole: contract.integrationBoundary.doctorIntegrationRole,
    doctorFacet: contract.integrationBoundary.doctorFacet,
    operationalHealth,
    readOnly: true,
    authority: {
      canonicalLifecycleAuthority: false,
      canonicalPopulationAuthority: false,
      semanticHealthAuthority: false,
      mayReopenFrozenSemantics: false
    },
    bindings: {
      contractId: sources.bindings.id,
      status: sources.bindings.status,
      boundGateCount: boundGateIds.length,
      boundGateIds,
      unresolvedGateCount: unresolvedGateIds.length,
      unresolvedGateIds,
      rejectedWeakBindingCount: (sources.bindings.rejectedWeakBindings ?? []).length,
      unresolvedSelectionPolicy: sources.bindings.policy?.unresolvedSelection ?? null
    },
    fallback: {
      policyId: sources.fallback.id,
      status: sources.fallback.status,
      catchAllRuleCount: (sources.fallback.catchAllRuleIds ?? []).length,
      canonicalOwnerRuleCount: (sources.fallback.canonicalRules ?? []).length,
      safeFallbackMemberCount: (sources.fallback.safeFallbackMembers ?? []).length,
      unknownPathGates: sources.fallback.unknownPathGates ?? [],
      specificOwnerSuppressesCatchAll: sources.fallback.completionPolicy?.specificRuleSuppressesCatchAllForSameFile === true,
      unresolvedBroadFallbackBlocksBeforeExecution: sources.fallback.completionPolicy?.unresolvedBroadFallbackStillBlocksBeforeExecution === true
    },
    evidence: {
      sr5: {
        status: sources.sr5.status,
        representativeCaseCount: sources.sr6.sr5RuntimeProof.representativeCaseCount,
        passedCaseCount: sources.sr6.sr5RuntimeProof.passedCaseCount,
        falseNegativeCount: sources.sr6.sr5RuntimeProof.falseNegativeCount,
        executorControlChecksPassed: sources.sr6.sr5RuntimeProof.executorControlChecksPassed,
        runtimeProof: true
      },
      sr6: {
        status: sources.sr6.status,
        mode: sources.sr6.mode,
        verifiedRunConclusion: sources.sr6.verifiedRun?.jobConclusion ?? null,
        shadowDryRunIsMergeGate: sources.sr6.workflowPolicy?.smartRegressionDryRunIsMergeGate ?? null
      },
      sr7: {
        status: sources.sr7.status,
        historicalCaseCount: sources.sr7.metrics.historicalCaseCount,
        passedCaseCount: sources.sr7.metrics.passedCaseCount,
        observedFalseNegativeCount: sources.sr7.metrics.observedFalseNegativeCount,
        replayErrorCount: sources.sr7.metrics.replayErrorCount,
        directPassCaseCount: sources.sr7.metrics.directPassCaseCount,
        conservativeBlockedCaseCount: sources.sr7.metrics.conservativeBlockedCaseCount
      },
      sr8: {
        status: sources.sr8.status,
        caseCount: sources.sr8.sr8Tests.caseCount,
        passedCaseCount: sources.sr8.sr8Tests.passedCaseCount,
        failedCaseCount: sources.sr8.sr8Tests.failedCaseCount,
        actualReplacementExecutionCount: sources.sr8.sr8Tests.actualReplacementExecutionCount,
        actualReplacementExecutionObserved: sources.sr8.confirmed.actualReplacementExecutionObserved
      }
    },
    replacement: {
      policyId: sources.sr8Policy.id,
      status: sources.sr8Policy.status,
      broadReplacementAllowed,
      defaultDecision: sources.sr8Policy.defaultDecision,
      fallbackExitCode: sources.sr8Policy.fallbackExitCode,
      classCount: replacementClasses.length,
      classIds: replacementClasses.map((row) => row.id).sort(),
      legacyFallbackRetained: true
    },
    reviews,
    sourceProvenance: Object.entries(contract.sources).map(([role, source]) => ({ role, source })),
    handoff: {
      projectDoctorImplementationModified: false,
      doctorWiringDeferred: true,
      finalEndToEndDoctorValidationDeferred: true,
      nextStartPoint: 'After Project Doctor implementation is ready, wire this generated artifact as supplemental source-evidence without changing domain canonical lifecycle authority.'
    }
  };
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const contract = readJson(contractPath);
  const sources = {
    bindings: readJson(contract.sources.bindings),
    fallback: readJson(contract.sources.fallbackPolicy),
    sr5: readJson(contract.sources.sr5Checkpoint),
    sr6: readJson(contract.sources.sr6Checkpoint),
    sr7: readJson(contract.sources.sr7Checkpoint),
    sr8Policy: readJson(contract.sources.sr8Policy),
    sr8: readJson(contract.sources.sr8Checkpoint)
  };
  const output = buildOutput(contract, sources);
  const serialized = canonicalJson(output);
  const absoluteOutput = path.join(repoRoot, outputPath);

  if (checkOnly) {
    const existing = readFileSync(absoluteOutput, 'utf8');
    invariant(existing === serialized, `${outputPath} is stale. Run the collector without --check.`);
    console.log(JSON.stringify({
      status: 'PASS',
      stage: 'SMART_REGRESSION_SR9C',
      operationalHealth: output.operationalHealth,
      boundGateCount: output.bindings.boundGateCount,
      unresolvedGateCount: output.bindings.unresolvedGateCount,
      sr5FalseNegativeCount: output.evidence.sr5.falseNegativeCount,
      sr7ObservedFalseNegativeCount: output.evidence.sr7.observedFalseNegativeCount,
      sr8ActualReplacementExecutionCount: output.evidence.sr8.actualReplacementExecutionCount,
      replacementClassCount: output.replacement.classCount
    }, null, 2));
    return;
  }

  writeFileSync(absoluteOutput, serialized);
  console.log(serialized.trimEnd());
}

try {
  main();
} catch (error) {
  console.error(`SMART REGRESSION SR-9 DOCTOR INPUT ERROR: ${error.message}`);
  process.exitCode = 1;
}
