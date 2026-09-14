'use strict';

const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const PROJECTION_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const TOKEN_EVIDENCE_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-skill-job-token-diagnostic.v1.json');
const NARM_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-narm-source-conflict.v1.json');
const DIAGNOSTIC = path.join(ROOT, 'scripts/diagnose-hero-heart-fetter-skill-job-description-v1.cjs');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sourceKey(row) { return [row.heroId, row.heartFetterLevel, row.skill.skillId, row.buff.buffId, row.condition.conditionParamJobId].join(':'); }
function policyKey(row) { return [row.heroId, row.heartFetterLevel, row.skillId, row.buffId, row.conditionParamJobId].join(':'); }
function heroJobIds(heroId) { const shard=read(path.join(HERO_DIR,`${heroId}.json`)); const ids=new Set((shard?.normal?.jobTree?.connections||[]).map((row)=>row?.jobId)); if(shard?.sp?.job?.jobId) ids.add(shard.sp.job.jobId); return ids; }
function mapByKey(rows) { return new Map(rows.map((row)=>[policyKey(row),row])); }

function main() {
  const policy=read(POLICY_PATH), projection=read(PROJECTION_PATH), evidence=read(TOKEN_EVIDENCE_PATH), narm=read(NARM_PATH);
  const diagnostic=JSON.parse(cp.execFileSync(process.execPath,[DIAGNOSTIC],{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).trim());
  assert.strictEqual(policy.stage,'hero-heart-fetter-presentation-policy-v1'); assert.strictEqual(policy.status,'RESEARCH_POLICY'); assert.strictEqual(policy.owner,'hero-canonical-research'); assert.strictEqual(policy.baseline.expectedHead,'5ad2214a630df27c1f6cbf0822fc494cf68e1435');
  assert.strictEqual(policy.policy.defaultRuleRowCount,1142); assert.strictEqual(policy.policy.overrideRowCount,6); assert.strictEqual(policy.policy.exclusionSetRowCount,8); assert.strictEqual(policy.policy.sourceConflictResolutionRowCount,2); assert.strictEqual(policy.policy.unresolvedPresentationRowCount,0); assert.strictEqual(policy.policy.totalMappedRowCount,1158);
  assert.strictEqual(policy.validationBoundary.productionFrontendConsumption,false); assert.strictEqual(policy.validationBoundary.canonicalRelationMutation,false); assert.strictEqual(policy.validationBoundary.createApplicableJobIds,false); assert.strictEqual(policy.validationBoundary.createJobRestricted,false);
  assert.strictEqual(projection.effectRowCount,1158); assert.strictEqual(evidence.fullPopulationEvidence.exactSkillEqualsConditionParamRows,1142); assert.strictEqual(diagnostic.exactConditionParamDifferenceCount,6); assert.strictEqual(diagnostic.exclusionCount,8); assert.strictEqual(diagnostic.unresolvedSourceJobLabelCount,2); assert.strictEqual(narm.validatedConclusions.presentationResolutionToJob622Supported,true);

  const overrides=mapByKey(policy.policy.explicitOverrides), exclusions=mapByKey(policy.policy.exclusionSetRows), conflicts=mapByKey(policy.policy.sourceConflictResolutions);
  assert.strictEqual(overrides.size,6); assert.strictEqual(exclusions.size,8); assert.strictEqual(conflicts.size,2);
  for(const k of overrides.keys()) assert(!exclusions.has(k)&&!conflicts.has(k),`overlapping policy key ${k}`); for(const k of exclusions.keys()) assert(!conflicts.has(k),`overlapping policy key ${k}`);

  const expectedOverrides=new Map(diagnostic.exactConditionParamDifferences.map((row)=>[[row.heroId,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':'),row.skillJob.jobId]));
  assert.deepStrictEqual([...expectedOverrides.keys()].sort(),[...overrides.keys()].sort()); for(const [k,row] of overrides) assert.strictEqual(row.presentationJobId,expectedOverrides.get(k));
  const expectedExclusions=new Map(diagnostic.exclusions.map((row)=>[[row.heroId,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':'),{presentationJobId:row.conditionParamJobId,excludedJobId:row.excludedJob.jobId}]));
  assert.deepStrictEqual([...expectedExclusions.keys()].sort(),[...exclusions.keys()].sort()); for(const [k,row] of exclusions){const e=expectedExclusions.get(k);assert.strictEqual(row.presentationJobId,e.presentationJobId);assert.strictEqual(row.excludedJobId,e.excludedJobId);assert.notStrictEqual(row.presentationJobId,row.excludedJobId);}
  const expectedConflicts=new Map(narm.rows.map((row)=>[[11,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':'),row.resolvedPresentationJobId]));
  assert.deepStrictEqual([...expectedConflicts.keys()].sort(),[...conflicts.keys()].sort()); for(const [k,row] of conflicts){assert.strictEqual(row.presentationJobId,expectedConflicts.get(k));assert.strictEqual(row.resolutionEvidence,'NARM_BUFF_CONDITIONPARAM_FROZEN_JOB_AND_EXTERNAL_CROSS_VALIDATION');}

  const counts={default:0,override:0,exclusion:0,conflict:0}; const seen=new Set();
  for(const row of projection.effects){const k=sourceKey(row);assert(!seen.has(k),`duplicate mapping key ${k}`);seen.add(k);const special=overrides.get(k)||exclusions.get(k)||conflicts.get(k);const presentationJobId=special?special.presentationJobId:row.condition.conditionParamJobId;assert(heroJobIds(row.heroId).has(presentationJobId),`Hero ${row.heroId}: presentation Job ${presentationJobId} not frozen`);if(overrides.has(k))counts.override++;else if(exclusions.has(k))counts.exclusion++;else if(conflicts.has(k))counts.conflict++;else counts.default++;}
  assert.strictEqual(seen.size,1158); assert.deepStrictEqual(counts,{default:1142,override:6,exclusion:8,conflict:2});
  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_POLICY_V1',mappedRows:1158,defaultRows:1142,overrideRows:6,exclusionSetRows:8,sourceConflictRows:2,unresolvedRows:0})}\n`);
}
main();
