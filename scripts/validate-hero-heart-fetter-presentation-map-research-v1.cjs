'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const SOURCE_PATH=path.join(ROOT,'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH=path.join(ROOT,'data/validation/hero-heart-fetter-presentation-policy.v1.json');
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function artifactPath(argv){const i=argv.indexOf('--artifact');if(i===-1||!argv[i+1])throw new Error('Usage: node scripts/validate-hero-heart-fetter-presentation-map-research-v1.cjs --artifact <path>');return path.resolve(argv[i+1]);}
function sourceKey(row){return [row.heroId,row.heartFetterLevel,row.skill.skillId,row.buff.buffId,row.condition.conditionParamJobId].join(':');}
function policyKey(row){return [row.heroId,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':');}
function mapKey(row){return [row.heroId,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':');}
function mapByKey(rows){return new Map(rows.map((row)=>[policyKey(row),row]));}
function assertNoForbiddenFields(value,location='$'){const forbidden=new Set(['applicableJobId','applicableJobIds','jobRestricted']);if(Array.isArray(value))return value.forEach((item,i)=>assertNoForbiddenFields(item,`${location}[${i}]`));if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){assert(!forbidden.has(key),`${location}: forbidden field ${key}`);assertNoForbiddenFields(item,`${location}.${key}`);}}
function main(){
  const artifact=read(artifactPath(process.argv.slice(2))),source=read(SOURCE_PATH),policy=read(POLICY_PATH);assert.strictEqual(artifact.schemaVersion,1);assert.strictEqual(artifact.stage,'hero-heart-fetter-presentation-map-research-v1');assert.strictEqual(artifact.status,'RESEARCH_PROJECTION');assert.strictEqual(artifact.semanticAuthority,false);assert.strictEqual(artifact.productionConsumerAllowed,false);assert.strictEqual(artifact.heroPopulationCount,267);assert.strictEqual(artifact.rowCount,1158);assert.strictEqual(artifact.defaultRuleRowCount,1142);assert.strictEqual(artifact.overrideRowCount,6);assert.strictEqual(artifact.exclusionSetRowCount,8);assert.strictEqual(artifact.sourceConflictResolutionRowCount,2);assert.strictEqual(artifact.unresolvedPresentationRowCount,0);assert.deepStrictEqual(artifact.keyFields,['heroId','heartFetterLevel','skillId','buffId','conditionParamJobId']);assert.deepStrictEqual(artifact.valueFields,['presentationJobId','mappingMode']);assertNoForbiddenFields(artifact);
  const overrides=mapByKey(policy.policy.explicitOverrides),exclusions=mapByKey(policy.policy.exclusionSetRows),conflicts=mapByKey(policy.policy.sourceConflictResolutions);const expected=[];const counts={VALIDATED_DEFAULT:0,EXPLICIT_OVERRIDE:0,EXCLUSION_SET_MEMBER:0,SOURCE_CONFLICT_RESOLUTION:0};
  for(const row of source.effects){const k=sourceKey(row);const mapping=overrides.get(k)?{mode:'EXPLICIT_OVERRIDE',row:overrides.get(k)}:exclusions.get(k)?{mode:'EXCLUSION_SET_MEMBER',row:exclusions.get(k)}:conflicts.get(k)?{mode:'SOURCE_CONFLICT_RESOLUTION',row:conflicts.get(k)}:{mode:'VALIDATED_DEFAULT',row:null};counts[mapping.mode]++;expected.push({heroId:row.heroId,heartFetterLevel:row.heartFetterLevel,skillId:row.skill.skillId,buffId:row.buff.buffId,conditionParamJobId:row.condition.conditionParamJobId,presentationJobId:mapping.row?mapping.row.presentationJobId:row.condition.conditionParamJobId,mappingMode:mapping.mode});}
  expected.sort((a,b)=>a.heroId-b.heroId||a.heartFetterLevel-b.heartFetterLevel||a.presentationJobId-b.presentationJobId||a.skillId-b.skillId||a.buffId-b.buffId||a.conditionParamJobId-b.conditionParamJobId);assert.deepStrictEqual(counts,{VALIDATED_DEFAULT:1142,EXPLICIT_OVERRIDE:6,EXCLUSION_SET_MEMBER:8,SOURCE_CONFLICT_RESOLUTION:2});assert.deepStrictEqual(artifact.rows,expected);
  const seen=new Set(),allowed=new Set(['VALIDATED_DEFAULT','EXPLICIT_OVERRIDE','EXCLUSION_SET_MEMBER','SOURCE_CONFLICT_RESOLUTION']);for(const row of artifact.rows){const k=mapKey(row);assert(!seen.has(k),`duplicate map key ${k}`);seen.add(k);assert(allowed.has(row.mappingMode),`invalid mapping mode ${row.mappingMode}`);}assert.strictEqual(seen.size,1158);process.stdout.write(`${JSON.stringify({status:'PASS_HEART_FETTER_PRESENTATION_MAP_RESEARCH_V1',heroPopulationCount:267,rowCount:1158,defaultRows:1142,overrideRows:6,exclusionSetRows:8,sourceConflictRows:2,unresolvedRows:0})}\n`);
}
main();
