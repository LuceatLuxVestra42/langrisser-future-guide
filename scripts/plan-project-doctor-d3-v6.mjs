import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzePaths } from './analyze-project-doctor-d2-impact.mjs';
import { loadProjectDoctorD2V6Context } from './analyze-project-doctor-d2-impact-v6.mjs';
import {
  parsePlanCli,
  collectChangedFiles,
  buildPlanFromImpact,
} from './plan-project-doctor-d3.mjs';
import {
  classifyProjectDoctorFreshnessV2,
  applyProjectDoctorFreshnessV2,
} from './classify-project-doctor-frozen-freshness-v2.mjs';

export const D3_V6_CONTRACT_PATH = 'data/contracts/project-doctor-d3-validator-plan.v6.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function loadProjectDoctorD3V6Context(contractPath = D3_V6_CONTRACT_PATH) {
  const delta = read(contractPath);
  if (delta.status !== 'DESIGN_FROZEN' || delta.schemaId !== 'project-doctor-d3-validator-plan/v6') throw new Error('D3 V6 contract is not frozen.');
  const predecessor = read(delta.extends);
  if (predecessor.status !== 'DESIGN_FROZEN' || predecessor.schemaId !== 'project-doctor-d3-validator-plan/v5') throw new Error('D3 V6 predecessor must be frozen V5.');
  const d2 = loadProjectDoctorD2V6Context(delta.impactContract);
  const contract = {
    ...predecessor,
    ...delta,
    checkCatalog: [...(predecessor.checkCatalog ?? []), ...(delta.addedCheckCatalog ?? [])],
    manualReviewNodes: { ...(predecessor.manualReviewNodes ?? {}) },
    admittedOwners: [...(predecessor.admittedOwners ?? [])],
    toolingAdmissions: [...(predecessor.toolingAdmissions ?? []), {
      node: 'project-doctor',
      changeClass: 'provenance-data',
      checkId: 'frozen-freshness-v2-self-test',
      packageCommand: 'doctor:freshness:v2:self-test',
      domainOwnerPromotion: false,
    }],
  };
  return { contract, delta, predecessor, effectiveMap: d2.effectiveMap };
}

export function createPlanV6(options, helpers = {}) {
  const context = helpers.context ?? loadProjectDoctorD3V6Context(options.contractPath ?? D3_V6_CONTRACT_PATH);
  const changedFiles = collectChangedFiles(options, helpers);
  const source = { mode: options.mode };
  if (options.mode === 'compare') Object.assign(source, { base: options.base, head: options.head, comparison: `${options.base}...${options.head}` });
  if (changedFiles.length === 0) {
    return {
      version: 6, schemaId: 'project-doctor-d3-plan/v6', stage: 'D3', status: 'NO_CHANGES', source,
      changedFileCount: 0, changedFiles: [], impact: { status: 'MAPPED', directNodes: [], impactedNodes: [], domains: [], changeClasses: [], files: [] },
      selectedChecks: [], manualReviews: [], validatorExecutionCount: 0, freshnessV2: { classifications: [] },
    };
  }
  const rawImpact = analyzePaths(changedFiles, context.effectiveMap);
  const classifications = options.mode === 'compare' && context.delta.freshnessV2Classification?.enabled
    ? classifyProjectDoctorFreshnessV2({ paths: changedFiles, base: options.base, head: options.head, runGit: helpers.runGit })
    : [];
  const impact = classifications.length ? applyProjectDoctorFreshnessV2(rawImpact, classifications) : rawImpact;
  const plan = buildPlanFromImpact({ source, changedFiles, impact, contract: context.contract });
  plan.version = 6;
  plan.schemaId = 'project-doctor-d3-plan/v6';
  plan.freshnessV2 = impact.freshnessV2 ?? { classifications: [] };
  return plan;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  let options;
  try {
    options = parsePlanCli(process.argv.slice(2));
    if (options.contractPath === 'data/contracts/project-doctor-d3-validator-plan.v1.json') options.contractPath = D3_V6_CONTRACT_PATH;
    const plan = createPlanV6(options);
    if (options.json) console.log(JSON.stringify(plan, null, 2));
    else {
      console.log('PROJECT DOCTOR VALIDATION PLAN — D3 V6');
      console.log(`Changed files : ${plan.changedFileCount}`);
      console.log(`Status        : ${plan.status}`);
      console.log(`Provenance-only: ${plan.freshnessV2?.provenanceOnlyCount ?? 0}`);
      for (const check of plan.selectedChecks) console.log(`  [phase ${check.phase}] ${check.id}: ${check.command}`);
      for (const review of plan.manualReviews) console.log(`  REVIEW ${review.node ?? review.path}: ${review.reason}`);
    }
    const raw = read(options.contractPath);
    process.exitCode = raw.exitPolicy?.[plan.status] ?? (plan.status === 'PLAN_READY' || plan.status === 'NO_CHANGES' ? 0 : plan.status === 'MANUAL_REVIEW' ? 3 : 2);
  } catch (error) {
    console.error(`[doctor:plan:v6] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
