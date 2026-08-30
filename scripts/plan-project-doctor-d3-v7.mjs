import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePaths } from './analyze-project-doctor-d2-impact.mjs';
import { loadProjectDoctorD2V7Context } from './analyze-project-doctor-d2-impact-v7.mjs';
import { parsePlanCli, collectChangedFiles, buildPlanFromImpact } from './plan-project-doctor-d3.mjs';
import { classifyProjectDoctorFreshnessV2, applyProjectDoctorFreshnessV2 } from './classify-project-doctor-frozen-freshness-v2.mjs';
import { loadProjectDoctorD3V6Context } from './plan-project-doctor-d3-v6.mjs';

export const D3_V7_CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v7.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function loadProjectDoctorD3V7Context(contractPath = D3_V7_CONTRACT_PATH) {
  const delta = read(contractPath);
  if (delta.status !== 'DESIGN_FROZEN' || delta.schemaId !== 'project-doctor-d3-validator-plan/v7') throw new Error('D3 V7 contract is not frozen.');
  if (delta.extends !== 'data/contracts/project-doctor-d3-validator-plan.v6.json') throw new Error('D3 V7 must extend frozen V6.');
  const v6 = loadProjectDoctorD3V6Context(delta.extends);
  const d2 = loadProjectDoctorD2V7Context(delta.impactContract);
  const contract = {
    ...v6.contract,
    ...delta,
    checkCatalog: [...(v6.contract.checkCatalog ?? []), ...(delta.addedCheckCatalog ?? [])],
    manualReviewNodes: { ...(v6.contract.manualReviewNodes ?? {}) },
    admittedOwners: [...(v6.contract.admittedOwners ?? [])],
    toolingAdmissions: [...(v6.contract.toolingAdmissions ?? [])],
  };
  return { contract, delta, predecessor: v6.contract, effectiveMap: d2.effectiveMap };
}

export function createPlanV7(options, helpers = {}) {
  const context = helpers.context ?? loadProjectDoctorD3V7Context(options.contractPath ?? D3_V7_CONTRACT_PATH);
  const changedFiles = collectChangedFiles(options, helpers);
  const source = { mode: options.mode };
  if (options.mode === 'compare') Object.assign(source, { base: options.base, head: options.head, comparison: `${options.base}...${options.head}` });
  if (changedFiles.length === 0) {
    return {
      version: 7, schemaId: 'project-doctor-d3-plan/v7', stage: 'D3', status: 'NO_CHANGES', source,
      changedFileCount: 0, changedFiles: [], impact: { status: 'MAPPED', directNodes: [], impactedNodes: [], domains: [], changeClasses: [], files: [] },
      selectedChecks: [], manualReviews: [], validatorExecutionCount: 0, freshnessV2: { classifications: [] },
    };
  }
  const rawImpact = analyzePaths(changedFiles, context.effectiveMap);
  const classifications = options.mode === 'compare'
    ? classifyProjectDoctorFreshnessV2({ paths: changedFiles, base: options.base, head: options.head, runGit: helpers.runGit })
    : [];
  const impact = classifications.length ? applyProjectDoctorFreshnessV2(rawImpact, classifications) : rawImpact;
  const plan = buildPlanFromImpact({ source, changedFiles, impact, contract: context.contract });
  plan.version = 7;
  plan.schemaId = 'project-doctor-d3-plan/v7';
  plan.freshnessV2 = impact.freshnessV2 ?? { classifications: [] };
  return plan;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let options;
  try {
    options = parsePlanCli(process.argv.slice(2));
    if (options.contractPath === 'data/contracts/project-doctor-d3-validator-plan.v1.json') options.contractPath = D3_V7_CONTRACT_PATH;
    const plan = createPlanV7(options);
    if (options.json) console.log(JSON.stringify(plan, null, 2));
    else {
      console.log('PROJECT DOCTOR VALIDATION PLAN — D3 V7');
      console.log(`Changed files : ${plan.changedFileCount}`);
      console.log(`Status        : ${plan.status}`);
      console.log(`Provenance-only: ${plan.freshnessV2?.provenanceOnlyCount ?? 0}`);
      for (const check of plan.selectedChecks) console.log(`  [phase ${check.phase}] ${check.id}: ${check.command}`);
      for (const review of plan.manualReviews) console.log(`  REVIEW ${review.node ?? review.path}: ${review.reason}`);
    }
    const raw = read(options.contractPath);
    process.exitCode = raw.exitPolicy?.[plan.status] ?? (plan.status === 'PLAN_READY' || plan.status === 'NO_CHANGES' ? 0 : plan.status === 'MANUAL_REVIEW' ? 3 : 2);
  } catch (error) {
    console.error(`[doctor:plan:v7] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
