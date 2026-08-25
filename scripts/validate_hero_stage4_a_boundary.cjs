const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const OUT = P('data/validation/hero-stage4-a-boundary.v1.json');

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function setOfHeroIds(doc) { return new Set((doc.records || []).map(x => x.heroId).filter(Number.isInteger)); }
function diff(a,b) { return [...a].filter(x => !b.has(x)).sort((x,y)=>x-y); }
function duplicates(xs) { const seen=new Set(), dup=new Set(); for(const x of xs){ if(seen.has(x)) dup.add(x); else seen.add(x); } return [...dup].sort((a,b)=>a-b); }
function hasForbiddenMembershipKey(value, pathParts=[], out=[]) {
  if (!value || typeof value !== 'object') return out;
  const forbidden = new Set(['usableSoldiers','soldierIds','usableSoldierIds','heroSoldierRelations','soldierMembership','relationEdges']);
  if (Array.isArray(value)) { value.forEach((v,i)=>hasForbiddenMembershipKey(v,[...pathParts,String(i)],out)); return out; }
  for (const [k,v] of Object.entries(value)) {
    if (forbidden.has(k)) out.push([...pathParts,k].join('.'));
    hasForbiddenMembershipKey(v,[...pathParts,k],out);
  }
  return out;
}

const stage4 = readJson(P('data/hero-basic-combat-stage4-5.v1.json'));
const heroContract = readJson(P('data/contracts/hero-identity-contract.v1.json'));
const ownership = readJson(P('data/contracts/hero-soldier-relation-ownership-contract.v1.json'));
const heroMaster = readJson(P('data/hero-name-master.v1.json'));
const jobTree = readJson(P('data/generated/hero-job-trees.v1.json'));
const skills = readJson(P('data/generated/hero-skill-acquisition.v1.json'));
const combat = readJson(P('data/generated/hero-basic-combat.v1.json'));

const masterIds = setOfHeroIds(heroMaster);
const treeIds = setOfHeroIds(jobTree);
const skillIds = setOfHeroIds(skills);
const combatIds = setOfHeroIds(combat);
const errors = [];
const checks = {
  heroContractFrozen: heroContract.status === 'FROZEN' ? 0 : 1,
  canonicalHeroKeyMismatch: heroContract.canonicalKey?.field === 'heroId' ? 0 : 1,
  canonicalHeroCountMismatch: heroMaster.recordCount === 267 && heroMaster.records?.length === 267 && masterIds.size === 267 ? 0 : 1,
  duplicateMasterHeroIds: duplicates((heroMaster.records||[]).map(x=>x.heroId).filter(Number.isInteger)).length,
  stage4PrimaryKeyMismatch: stage4.primaryKey === 'heroId' ? 0 : 1,
  stage4BoundaryNotAdopted: stage4.sharedRelationBoundary?.status === 'A1_A9_ADOPTED' ? 0 : 1,
  soldierModifierMeaningMismatch: /not Hero-Soldier membership/i.test(stage4.sharedRelationBoundary?.soldierModifiersMeaning || '') ? 0 : 1,
  usableMembershipScopeMismatch: stage4.sharedRelationBoundary?.usableSoldierMembership === 'OUT_OF_SCOPE' ? 0 : 1,
  ownershipContractFrozen: ownership.status === 'FROZEN' ? 0 : 1,
  ownershipSemanticOwnerMismatch: ownership.singleWriterPrinciple?.semanticOwner === 'Hero-Soldier Relation Layer' ? 0 : 1,
  heroPipelineRoleMismatch: ownership.heroPipelineBoundary?.role === 'CONSUMER' ? 0 : 1,
  hero53MappingMismatch: /byHeroId only/i.test(ownership.heroPipelineBoundary?.heroStageMapping?.['Hero 5-3 usable Soldiers'] || '') ? 0 : 1,
  jobTreeMissingCanonicalHeroes: diff(masterIds, treeIds).length,
  jobTreeUnknownHeroes: diff(treeIds, masterIds).length,
  skillMissingCanonicalHeroes: diff(masterIds, skillIds).length,
  skillUnknownHeroes: diff(skillIds, masterIds).length,
  combatMissingCanonicalHeroes: diff(masterIds, combatIds).length,
  combatUnknownHeroes: diff(combatIds, masterIds).length,
  combatMembershipFieldLeaks: hasForbiddenMembershipKey(combat.records || []).length,
};

for (const [k,v] of Object.entries(checks)) if (v !== 0) errors.push(`${k}: ${v}`);
const output = {
  version: 1,
  stage: 'hero-page-4-a-boundary',
  status: errors.length ? 'FAIL' : 'PASS',
  purpose: 'Verify Hero Stage 4 adoption of A-1 canonical Hero identity and A-9 Hero-Soldier Relation Layer ownership without changing the remaining Stage 4 semantic gates.',
  counts: { canonicalHeroes: masterIds.size, jobTreeHeroes: treeIds.size, skillHeroes: skillIds.size, combatHeroes: combatIds.size },
  checks,
  policy: {
    canonicalHeroKey: 'heroId only',
    soldierModifiers: 'Hero-owned troop stat modifier percentages; not membership',
    usableSoldierMembership: 'OUT_OF_SCOPE for Hero Stage 4',
    futureMembershipConsumer: 'Hero 5-3 -> validated A-7 byHeroId index',
    semanticOwner: 'Hero-Soldier Relation Layer'
  },
  errors
};
fs.mkdirSync(path.dirname(OUT), {recursive:true});
fs.writeFileSync(OUT, JSON.stringify(output,null,2)+'\n');
console.log(`HERO STAGE 4 A-BOUNDARY: ${output.status}`);
console.log(JSON.stringify(output.counts));
if (errors.length) { errors.forEach(e=>console.error(`- ${e}`)); process.exitCode=1; }
