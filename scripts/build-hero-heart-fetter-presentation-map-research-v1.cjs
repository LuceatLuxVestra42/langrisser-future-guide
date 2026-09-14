'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const SOURCE_PATH=path.join(ROOT,'data/generated/hero-heart-fetter-job-effect-research.v1.json');
const POLICY_PATH=path.join(ROOT,'data/validation/hero-heart-fetter-presentation-policy.v1.json');
function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function outputPath(argv){const i=argv.indexOf('--output');if(i===-1||!argv[i+1])throw new Error('Usage: node scripts/build-hero-heart-fetter-presentation-map-research-v1.cjs --output <path>');return path.resolve(argv[i+1]);}
function sourceKey(row){return [row.heroId,row.heartFetterLevel,row.skill.skillId,row.buff.buffId,row.condition.conditionParamJobId].join(':');}
function policyKey(row){return [row.heroId,row.heartFetterLevel,row.skillId,row.buffId,row.conditionParamJobId].join(':');}
function mapByKey(rows){return new Map(rows.map((row)=>[policyKey(row),row]));}
function main(){
  const source=read(SOURCE_PATH),policy=read(POLICY_PATH);if(source.status!=='RESEARCH_PROJECTION'||source.semanticAuthority!==false||source.productionConsumerAllowed!==false)throw new Error('job-effect research source boundary changed');if(policy.status!=='RESEARCH_POLICY'||policy.validationBoundary?.productionFrontendConsumption!==false)throw new Error('presentation policy boundary changed');
  const overrides=mapByKey(policy.policy.explicitOverrides),exclusions=mapByKey(policy.policy.exclusionSetRows),conflicts=mapByKey(policy.policy.sourceConflictResolutions);const counts={VALIDATED_DEFAULT:0,EXPLICIT_OVERRIDE:0,EXCLUSION_SET_MEMBER:0,SOURCE_CONFLICT_RESOLUTION:0};const rows=[];
  for(const row of source.effects||[]){const k=sourceKey(row);const mapping=overrides.get(k)?{mode:'EXPLICIT_OVERRIDE',row:overrides.get(k)}:exclusions.get(k)?{mode:'EXCLUSION_SET_MEMBER',row:exclusions.get(k)}:conflicts.get(k)?{mode:'SOURCE_CONFLICT_RESOLUTION',row:conflicts.get(k)}:{mode:'VALIDATED_DEFAULT',row:null};counts[mapping.mode]++;rows.push({heroId:row.heroId,heartFetterLevel:row.heartFetterLevel,skillId:row.skill.skillId,buffId:row.buff.buffId,conditionParamJobId:row.condition.conditionParamJobId,presentationJobId:mapping.row?mapping.row.presentationJobId:row.condition.conditionParamJobId,mappingMode:mapping.mode});}
  rows.sort((a,b)=>a.heroId-b.heroId||a.heartFetterLevel-b.heartFetterLevel||a.presentationJobId-b.presentationJobId||a.skillId-b.skillId||a.buffId-b.buffId||a.conditionParamJobId-b.conditionParamJobId);if(rows.length!==1158||counts.VALIDATED_DEFAULT!==1142||counts.EXPLICIT_OVERRIDE!==6||counts.EXCLUSION_SET_MEMBER!==8||counts.SOURCE_CONFLICT_RESOLUTION!==2)throw new Error(`unexpected map counts rows=${rows.length} counts=${JSON.stringify(counts)}`);
  const output={schemaVersion:1,stage:'hero-heart-fetter-presentation-map-research-v1',status:'RESEARCH_PROJECTION',semanticAuthority:false,productionConsumerAllowed:false,sourceProjection:'data/generated/hero-heart-fetter-job-effect-research.v1.json',presentationPolicy:'data/validation/hero-heart-fetter-presentation-policy.v1.json',heroPopulationCount:new Set(rows.map((row)=>row.heroId)).size,rowCount:rows.length,defaultRuleRowCount:counts.VALIDATED_DEFAULT,overrideRowCount:counts.EXPLICIT_OVERRIDE,exclusionSetRowCount:counts.EXCLUSION_SET_MEMBER,sourceConflictResolutionRowCount:counts.SOURCE_CONFLICT_RESOLUTION,unresolvedPresentationRowCount:0,keyFields:['heroId','heartFetterLevel','skillId','buffId','conditionParamJobId'],valueFields:['presentationJobId','mappingMode'],rows};fs.writeFileSync(outputPath(process.argv.slice(2)),`${JSON.stringify(output,null,2)}\n`);
}
main();
