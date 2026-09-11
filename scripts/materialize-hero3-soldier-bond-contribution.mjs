import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
function fail(message) {
  console.error(JSON.stringify({status:'FAIL', stage:'HERO_SOLDIER_BOND_CMD_CONTRIBUTION_MATERIALIZATION', error:message}, null, 2));
  process.exit(1);
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function rows(root, file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) fail(`MISSING_SOURCE_FILE:${file}`);
  const j = readJson(p);
  if (!Array.isArray(j)) fail(`SOURCE_NOT_ARRAY:${file}`);
  return j;
}
function uniqueIndex(list, key, label) {
  const m = new Map();
  for (const r of list) {
    const v = r?.[key];
    if (!Number.isInteger(v)) fail(`INVALID_${label}_${key}:${JSON.stringify(v)}`);
    if (m.has(v)) fail(`DUPLICATE_${label}_${key}:${v}`);
    m.set(v, r);
  }
  return m;
}

const sourceRoot = arg('--source-root', process.env.CONFIGDATA_SOURCE_ROOT);
const outPath = arg('--output', 'data/generated/hero3-soldier-bond-contribution.v1.json');
if (!sourceRoot) fail('SOURCE_ROOT_REQUIRED');

const contract = readJson('data/contracts/hero3-soldier-bond-contribution-contract.v1.json');
const sourcePack = readJson('data/contracts/configdata-source-pack-contract.v1.json');
const heroMaster = readJson(contract.authority.canonicalHeroSource);
const r0 = readJson(contract.authority.r0Contract);
const r0Checkpoint = readJson(contract.authority.r0Checkpoint);

if (heroMaster.recordCount !== contract.authority.expectedCanonicalHeroCount || heroMaster.records?.length !== heroMaster.recordCount) fail('CANONICAL_HERO_COUNT_MISMATCH');
if (sourcePack.authoritativePredecessor?.sourceCommitSha !== contract.authority.sourceCommitSha) fail('SOURCE_COMMIT_MISMATCH');
if (sourcePack.authoritativePredecessor?.sourceTreeGitSha1 !== contract.authority.sourceTreeGitSha1) fail('SOURCE_TREE_MISMATCH');
if (sourcePack.storage?.archive?.sha256 !== contract.authority.archiveSha256) fail('SOURCE_ARCHIVE_MISMATCH');
if (r0.status !== 'PASS_TYPED_RELATION' || r0Checkpoint.status !== 'PASS_TYPED_RELATION' || r0Checkpoint.completion !== 'COMPLETE' || r0Checkpoint.freezeState !== 'FINAL_FROZEN') fail('R0_NOT_FROZEN');

const heroInfo = uniqueIndex(rows(sourceRoot, 'ConfigDataHeroInfo.json'), 'ID', 'HEROINFO');
const heroInformation = uniqueIndex(rows(sourceRoot, 'ConfigDataHeroInformationInfo.json'), 'ID', 'HEROINFORMATION');
const fetters = uniqueIndex(rows(sourceRoot, 'ConfigDataHeroFetterInfo.json'), 'ID', 'FETTER');
const skills = uniqueIndex(rows(sourceRoot, 'ConfigDataSkillInfo.json'), 'ID', 'SKILL');
const buffs = uniqueIndex(rows(sourceRoot, 'ConfigDataBuffInfo.json'), 'ID', 'BUFF');

const propToKey = new Map([[93,'hp'],[94,'attack'],[95,'defense'],[96,'magicDefense']]);
const canonicalIds = new Set();
const records = [];
for (const canonical of heroMaster.records) {
  const heroId = canonical?.heroId;
  if (!Number.isInteger(heroId)) fail(`INVALID_CANONICAL_HERO_ID:${JSON.stringify(heroId)}`);
  if (canonicalIds.has(heroId)) fail(`DUPLICATE_CANONICAL_HERO_ID:${heroId}`);
  canonicalIds.add(heroId);

  const hi = heroInfo.get(heroId);
  if (!hi) fail(`MISSING_HEROINFO:${heroId}`);
  if (hi.Useable !== true) fail(`CANONICAL_HERO_NOT_USEABLE:${heroId}`);
  const informationId = hi.HeroInformation_ID;
  if (!Number.isInteger(informationId) || informationId <= 0) fail(`INVALID_HERO_INFORMATION_ID:${heroId}:${JSON.stringify(informationId)}`);
  const information = heroInformation.get(informationId);
  if (!information) fail(`MISSING_HERO_INFORMATION:${heroId}:${informationId}`);
  if (!Array.isArray(information.HeroFetters_ID)) fail(`MISSING_HERO_FETTERS_ID:${heroId}`);

  const raw = {hp:0, attack:0, defense:0, magicDefense:0};
  const heroFetterIds = [];
  const selectedMaxSkillIds = [];
  for (const fetterId of information.HeroFetters_ID) {
    if (!Number.isInteger(fetterId)) fail(`INVALID_FETTER_ID:${heroId}:${JSON.stringify(fetterId)}`);
    const fetter = fetters.get(fetterId);
    if (!fetter) fail(`MISSING_FETTER:${heroId}:${fetterId}`);
    const maxLevel = fetter.MaxLevel;
    const got = fetter.GotSkills_ID;
    if (!Number.isInteger(maxLevel) || maxLevel < 1 || !Array.isArray(got) || maxLevel > got.length) fail(`INVALID_FETTER_MAX_SELECTION:${heroId}:${fetterId}`);
    const skillId = got[maxLevel - 1];
    if (!Number.isInteger(skillId)) fail(`INVALID_SELECTED_SKILL:${heroId}:${fetterId}`);
    const skill = skills.get(skillId);
    if (!skill) fail(`MISSING_SELECTED_SKILL:${heroId}:${fetterId}:${skillId}`);
    heroFetterIds.push(fetterId);
    selectedMaxSkillIds.push(skillId);

    const passiveBuffIds = skill.PassiveBuffs_ID ?? [];
    if (!Array.isArray(passiveBuffIds)) fail(`INVALID_PASSIVE_BUFFS:${skillId}`);
    for (const buffId of passiveBuffIds) {
      if (!Number.isInteger(buffId)) fail(`INVALID_BUFF_ID:${skillId}:${JSON.stringify(buffId)}`);
      const buff = buffs.get(buffId);
      if (!buff) fail(`MISSING_BUFF:${skillId}:${buffId}`);
      for (let n = 1; n <= 4; n++) {
        const propId = buff[`Property${n}_ID`];
        if (!propToKey.has(propId)) continue;
        const value = buff[`Property${n}_Value`];
        if (!Number.isInteger(value)) fail(`INVALID_PROPERTY_VALUE:${buffId}:Property${n}_Value`);
        raw[propToKey.get(propId)] += value;
      }
    }
  }

  const percentagePoints = Object.fromEntries(Object.entries(raw).map(([k,v]) => [k, v / 100]));
  records.push({heroId, heroInformationId: informationId, heroFetterIds, selectedMaxSkillIds, raw, percentagePoints});
}

const artifact = {
  schemaVersion: 1,
  stage: contract.stage,
  status: 'FINAL_FROZEN',
  authority: {
    canonicalHeroSource: contract.authority.canonicalHeroSource,
    canonicalHeroSourceBlobSha: contract.authority.canonicalHeroSourceBlobSha,
    sourceCommitSha: contract.authority.sourceCommitSha,
    sourceTreeGitSha1: contract.authority.sourceTreeGitSha1,
    sourceArchiveSha256: contract.authority.archiveSha256,
    relationContract: contract.authority.r0Contract
  },
  semantics: {
    rawAggregation: 'sum all matching Property1..Property4 values for PropertyModifyType 93..96 across every MAX-selected HeroFetter skill and every PassiveBuffs_ID entry',
    normalization: 'percentagePoints = aggregateRaw / 100',
    compositionBoundary: 'Hero3 contribution only; excludes Normal/SP base and final soldier correction'
  },
  recordCount: records.length,
  records
};
fs.mkdirSync(path.dirname(outPath), {recursive:true});
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n');
console.log(JSON.stringify({status:'PASS', output:outPath, recordCount:records.length, leon:records.find(r=>r.heroId===6)}, null, 2));
