'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH = path.join(ROOT, 'data/validation/hero-heart-fetter-presentation-policy.v1.json');
const HERO_DIR = path.join(ROOT, 'data/generated/hero-detail/by-id');
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function artifactPath(argv) { const i = argv.indexOf('--artifact'); if (i === -1 || !argv[i + 1]) throw new Error('Usage: node scripts/validate-hero-heart-fetter-presentation-research-v1.cjs --artifact <path>'); return path.resolve(argv[i + 1]); }
function sourceKey(row) { return [row.heroId,row.heartFetterLevel,row.skill.skillId,row.buff.buffId,row.condition.conditionParamJobId].join(':'); }
function policyKey(row) { return [row.heroId,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':'); }
function mapByKey(rows) { return new Map(rows.map((row) => [policyKey(row), row])); }
function jobMap(heroId) {
  const shard = read(path.join(HERO_DIR, `${heroId}.json`));
  const jobs = new Map();
  for (const c of shard?.normal?.jobTree?.connections || []) jobs.set(c.jobId,{jobId:c.jobId,nameCn:c?.job?.nameCn??null,rank:Number.isInteger(c?.job?.rank)?c.job.rank:null,source:'normal.jobTree.connections'});
  if (shard?.sp?.job?.jobId) jobs.set(shard.sp.job.jobId,{jobId:shard.sp.job.jobId,nameCn:shard.sp.job.nameCn??null,rank:Number.isInteger(shard.sp.job.rank)?shard.sp.job.rank:null,source:'sp.job'});
  return jobs;
}
function assertNoForbiddenFields(value, location='$') {
  const forbidden = new Set(['applicableJobId','applicableJobIds','jobRestricted']);
  if (Array.isArray(value)) return value.forEach((item,i)=>assertNoForbiddenFields(item,`${location}[${i}]`));
  if (!value || typeof value !== 'object') return;
  for (const [key,item] of Object.entries(value)) { assert(!forbidden.has(key),`${location}: forbidden field ${key}`); assertNoForbiddenFields(item,`${location}.${key}`); }
}
function main() {
  const artifact=read(artifactPath(process.argv.slice(2))); const source=read(SOURCE_PATH); const policy=read(POLICY_PATH);
  assert.strictEqual(artifact.schemaVersion,1); assert.strictEqual(artifact.stage,'hero-heart-fetter-presentation-research-v1'); assert.strictEqual(artifact.status,'RESEARCH_PROJECTION'); assert.strictEqual(artifact.semanticAuthority,false); assert.strictEqual(artifact.productionConsumerAllowed,false);
  assert.strictEqual(artifact.heroPopulationCount,267); assert.strictEqual(artifact.effectRowCount,1158); assert.strictEqual(artifact.defaultRuleRowCount,1142); assert.strictEqual(artifact.overrideRowCount,6); assert.strictEqual(artifact.exclusionSetRowCount,8); assert.strictEqual(artifact.reviewFallbackRowCount,2); assert.deepStrictEqual(artifact.levels,[4,7]); assertNoForbiddenFields(artifact);
  const overrides=mapByKey(policy.policy.explicitOverrides), exclusions=mapByKey(policy.policy.exclusionSetRows), reviews=mapByKey(policy.policy.reviewFallbacks); const cache=new Map(); const expected=[]; const counts={VALIDATED_DEFAULT:0,EXPLICIT_OVERRIDE:0,EXCLUSION_SET_MEMBER:0,REVIEW_FALLBACK:0};
  for (const row of source.effects) {
    const k=sourceKey(row); const mapping=overrides.get(k)?{mode:'EXPLICIT_OVERRIDE',row:overrides.get(k)}:exclusions.get(k)?{mode:'EXCLUSION_SET_MEMBER',row:exclusions.get(k)}:reviews.get(k)?{mode:'REVIEW_FALLBACK',row:reviews.get(k)}:{mode:'VALIDATED_DEFAULT',row:null};
    const presentationJobId=mapping.row?mapping.row.presentationJobId:row.condition.conditionParamJobId; let jobs=cache.get(row.heroId); if(!jobs){jobs=jobMap(row.heroId);cache.set(row.heroId,jobs);} const presentationJob=jobs.get(presentationJobId); assert(presentationJob,`Hero ${row.heroId}: missing presentation Job ${presentationJobId}`); counts[mapping.mode]++;
    expected.push({heroId:row.heroId,identity:row.identity,heartFetterLevel:row.heartFetterLevel,mappingMode:mapping.mode,conditionJobReference:row.job,presentationJob,reviewReason:mapping.mode==='REVIEW_FALLBACK'?mapping.row.reviewReason:null,excludedJobId:mapping.mode==='EXCLUSION_SET_MEMBER'?mapping.row.excludedJobId:null,skill:row.skill,buff:row.buff,condition:row.condition,sourceProvenance:row.sourceProvenance});
  }
  assert.deepStrictEqual(counts,{VALIDATED_DEFAULT:1142,EXPLICIT_OVERRIDE:6,EXCLUSION_SET_MEMBER:8,REVIEW_FALLBACK:2}); assert.strictEqual(expected.length,1158); assert.deepStrictEqual(artifact.effects,expected);
  process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_RESEARCH_V1',heroPopulationCount:267,effectRowCount:1158,defaultRows:1142,overrideRows:6,exclusionSetRows:8,reviewFallbackRows:2})}\n`);
}
main();
