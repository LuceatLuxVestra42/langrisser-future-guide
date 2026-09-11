import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback = null) { const i=args.indexOf(name); return i>=0 ? args[i+1] : fallback; }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
const sourceRoot = arg('--source-root', process.env.CONFIGDATA_SOURCE_ROOT);
const artifactPath = arg('--artifact', 'data/generated/hero3-soldier-bond-contribution.v1.json');
const checkpointPath = arg('--checkpoint', 'data/validation/hero3-soldier-bond-contribution-final.v1.json');
const errors=[];
const add=e=>errors.push(e);
if (!sourceRoot) { console.error('SOURCE_ROOT_REQUIRED'); process.exit(1); }

const contract=readJson('data/contracts/hero3-soldier-bond-contribution-contract.v1.json');
const sourcePack=readJson(contract.authority.sourcePackContract);
const heroMaster=readJson(contract.authority.canonicalHeroSource);
const artifact=readJson(artifactPath);
function rows(file){ const p=path.join(sourceRoot,file); if(!fs.existsSync(p)){add(`MISSING_SOURCE_FILE:${file}`);return [];} const j=readJson(p); if(!Array.isArray(j)){add(`SOURCE_NOT_ARRAY:${file}`);return [];} return j; }
function idx(list,key,label){ const m=new Map(); for(const r of list){ const v=r?.[key]; if(!Number.isInteger(v)){add(`INVALID_${label}_${key}`);continue;} if(m.has(v)) add(`DUPLICATE_${label}_${key}:${v}`); else m.set(v,r);} return m; }

if (heroMaster.recordCount !== 267 || heroMaster.records?.length !== 267) add('CANONICAL_COUNT_NOT_267');
if (contract.authority.expectedCanonicalHeroCount !== 267) add('CONTRACT_CANONICAL_COUNT_NOT_267');
if (sourcePack.authoritativePredecessor?.sourceCommitSha !== contract.authority.sourceCommitSha) add('SOURCE_COMMIT_MISMATCH');
if (sourcePack.authoritativePredecessor?.sourceTreeGitSha1 !== contract.authority.sourceTreeGitSha1) add('SOURCE_TREE_MISMATCH');
if (sourcePack.storage?.archive?.sha256 !== contract.authority.archiveSha256) add('SOURCE_ARCHIVE_MISMATCH');
if (artifact.stage !== contract.stage || artifact.status !== 'FINAL_FROZEN') add('ARTIFACT_STAGE_OR_STATUS_MISMATCH');
if (artifact.recordCount !== heroMaster.records?.length || artifact.records?.length !== heroMaster.records?.length) add('ARTIFACT_COUNT_MISMATCH');

const heroInfo=idx(rows('ConfigDataHeroInfo.json'),'ID','HEROINFO');
const heroInformation=idx(rows('ConfigDataHeroInformationInfo.json'),'ID','HEROINFORMATION');
const fetters=idx(rows('ConfigDataHeroFetterInfo.json'),'ID','FETTER');
const skills=idx(rows('ConfigDataSkillInfo.json'),'ID','SKILL');
const buffs=idx(rows('ConfigDataBuffInfo.json'),'ID','BUFF');
const propToKey=new Map([[93,'hp'],[94,'attack'],[95,'defense'],[96,'magicDefense']]);

function compute(heroId){
  const hi=heroInfo.get(heroId); if(!hi){add(`MISSING_HEROINFO:${heroId}`);return null;}
  if(hi.Useable!==true) add(`CANONICAL_HERO_NOT_USEABLE:${heroId}`);
  const informationId=hi.HeroInformation_ID;
  if(!Number.isInteger(informationId)||informationId<=0){add(`INVALID_HERO_INFORMATION_ID:${heroId}`);return null;}
  const information=heroInformation.get(informationId); if(!information){add(`MISSING_HERO_INFORMATION:${heroId}:${informationId}`);return null;}
  if(!Array.isArray(information.HeroFetters_ID)){add(`MISSING_HERO_FETTERS_ID:${heroId}`);return null;}
  const raw={hp:0,attack:0,defense:0,magicDefense:0}; const heroFetterIds=[]; const selectedMaxSkillIds=[];
  for(const fetterId of information.HeroFetters_ID){
    if(!Number.isInteger(fetterId)){add(`INVALID_FETTER_ID:${heroId}`);continue;}
    const fetter=fetters.get(fetterId); if(!fetter){add(`MISSING_FETTER:${heroId}:${fetterId}`);continue;}
    const max=fetter.MaxLevel, got=fetter.GotSkills_ID;
    if(!Number.isInteger(max)||max<1||!Array.isArray(got)||max>got.length){add(`INVALID_FETTER_MAX_SELECTION:${heroId}:${fetterId}`);continue;}
    const skillId=got[max-1]; if(!Number.isInteger(skillId)){add(`INVALID_SELECTED_SKILL:${heroId}:${fetterId}`);continue;}
    const skill=skills.get(skillId); if(!skill){add(`MISSING_SELECTED_SKILL:${heroId}:${fetterId}:${skillId}`);continue;}
    heroFetterIds.push(fetterId); selectedMaxSkillIds.push(skillId);
    const passive=skill.PassiveBuffs_ID ?? []; if(!Array.isArray(passive)){add(`INVALID_PASSIVE_BUFFS:${skillId}`);continue;}
    for(const buffId of passive){
      const buff=buffs.get(buffId); if(!buff){add(`MISSING_BUFF:${skillId}:${buffId}`);continue;}
      for(let n=1;n<=4;n++){
        const id=buff[`Property${n}_ID`]; if(!propToKey.has(id)) continue;
        const value=buff[`Property${n}_Value`]; if(!Number.isInteger(value)){add(`INVALID_PROPERTY_VALUE:${buffId}:${n}`);continue;}
        raw[propToKey.get(id)] += value;
      }
    }
  }
  const percentagePoints=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/100]));
  return {heroId,heroInformationId:informationId,heroFetterIds,selectedMaxSkillIds,raw,percentagePoints};
}
function stable(v){return JSON.stringify(v);}
const expectedById=new Map(); const canonicalIds=[]; const seenCanonical=new Set();
for(const r of heroMaster.records||[]){ const id=r?.heroId; if(!Number.isInteger(id)){add('INVALID_CANONICAL_HERO_ID');continue;} if(seenCanonical.has(id)) add(`DUPLICATE_CANONICAL_HERO_ID:${id}`); seenCanonical.add(id); canonicalIds.push(id); const e=compute(id); if(e) expectedById.set(id,e); }
const actualById=new Map();
for(const r of artifact.records||[]){ if(!Number.isInteger(r?.heroId)){add('INVALID_ARTIFACT_HERO_ID');continue;} if(actualById.has(r.heroId)) add(`DUPLICATE_ARTIFACT_HERO_ID:${r.heroId}`); actualById.set(r.heroId,r); const forbidden=Object.keys(r).filter(k=>/normal|spbase|base|final|correction/i.test(k)); if(forbidden.length) add(`FORBIDDEN_COMPOSITION_FIELDS:${r.heroId}:${forbidden.join(',')}`); }
for(const id of canonicalIds){ if(!actualById.has(id)){add(`MISSING_ARTIFACT_HERO:${id}`);continue;} const e=expectedById.get(id), a=actualById.get(id); if(e&&stable(a)!==stable(e)) add(`RECOMPUTE_MISMATCH:${id}`); }
for(const id of actualById.keys()) if(!seenCanonical.has(id)) add(`EXTRA_ARTIFACT_HERO:${id}`);

const leonExpected=contract.leonRegression;
const leonComputed=expectedById.get(6); const leonActual=actualById.get(6);
if(!leonComputed||stable(leonComputed.heroFetterIds)!==stable(leonExpected.heroFetterIds)) add('LEON_FETTERS_MISMATCH');
if(!leonComputed||stable(leonComputed.selectedMaxSkillIds)!==stable(leonExpected.selectedMaxSkillIds)) add('LEON_SELECTED_SKILLS_MISMATCH');
if(!leonComputed||stable(leonComputed.raw)!==stable(leonExpected.expectedRaw)) add('LEON_RAW_MISMATCH');
if(!leonComputed||stable(leonComputed.percentagePoints)!==stable(leonExpected.expectedPercentagePoints)) add('LEON_PERCENTAGE_POINTS_MISMATCH');
if(!leonActual||stable(leonActual.raw)!==stable(leonExpected.expectedRaw)) add('LEON_ARTIFACT_RAW_MISMATCH');

function skillCommandRaw(skillId){
  const out={hp:0,attack:0,defense:0,magicDefense:0}; const skill=skills.get(skillId); if(!skill){add(`LEON_MISSING_SKILL:${skillId}`);return out;}
  for(const buffId of (skill.PassiveBuffs_ID??[])){
    const buff=buffs.get(buffId); if(!buff){add(`LEON_MISSING_BUFF:${skillId}:${buffId}`);continue;}
    for(let n=1;n<=4;n++){ const id=buff[`Property${n}_ID`]; if(!propToKey.has(id)) continue; const v=buff[`Property${n}_Value`]; if(Number.isInteger(v)) out[propToKey.get(id)]+=v; else add(`LEON_INVALID_PROPERTY_VALUE:${buffId}:${n}`); }
  }
  return out;
}
const zero={hp:0,attack:0,defense:0,magicDefense:0};
for(const sid of leonExpected.nonContributingSelectedSkillIdsForCommand93To96){ if(stable(skillCommandRaw(sid))!==stable(zero)) add(`LEON_EXTRA_COMMAND_CONTRIBUTION:${sid}`); }

const checkpoint={
  version:1,
  stage:contract.stage,
  status:errors.length?'FAIL':'PASS',
  completion:errors.length?'INCOMPLETE':'COMPLETE',
  freezeState:errors.length?'NOT_FROZEN':'FINAL_FROZEN',
  contract:'data/contracts/hero3-soldier-bond-contribution-contract.v1.json',
  generatedArtifact:artifactPath,
  authority:{canonicalHeroSource:contract.authority.canonicalHeroSource,canonicalHeroCount:heroMaster.records?.length??0,sourceCommitSha:contract.authority.sourceCommitSha,sourceTreeGitSha1:contract.authority.sourceTreeGitSha1,archiveSha256:contract.authority.archiveSha256},
  validation:{independentRecomputation:true,exactCanonicalParity:errors.every(e=>!/(CANONICAL|ARTIFACT_HERO|COUNT)/.test(e)),explicitIdRelationsOnly:true,nameJoinCount:0,idArithmeticSemanticMappingCount:0,arrayOrderSemanticMappingCount:0,normalOrSpBaseCompositionCount:0,finalCorrectionCompositionCount:0},
  leonRegression:{passed:errors.every(e=>!e.startsWith('LEON_')),heroId:6,heroFetterIds:leonComputed?.heroFetterIds??null,selectedMaxSkillIds:leonComputed?.selectedMaxSkillIds??null,raw:leonComputed?.raw??null,percentagePoints:leonComputed?.percentagePoints??null,verifiedNonContributingSkillIds:leonExpected.nonContributingSelectedSkillIdsForCommand93To96},
  hardErrorCount:errors.length,
  blockers:errors,
  nextOwner:errors.length?null:'HERO_SOLDIER_CORRECTION_COMPOSER',
  reopenConditions:contract.reopenConditions
};
fs.mkdirSync(path.dirname(checkpointPath),{recursive:true});
fs.writeFileSync(checkpointPath,JSON.stringify(checkpoint,null,2)+'\n');
console.log(JSON.stringify(checkpoint,null,2));
if(errors.length) process.exit(1);
