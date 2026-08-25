const fs = require('fs');
const path = require('path');
const {
  loadSoldiers,
  loadSpSoldiers,
  loadArmies,
  loadTrainingTechs,
  loadTrainingLevels,
  loadMissions,
  loadMissionSubmitBundles,
  loadSpHeroes,
  ROOT,
} = require('./lib/configdata-direct.cjs');

function duplicates(xs){ const seen=new Set(), dup=new Set(); for(const x of xs) seen.has(x)?dup.add(x):seen.add(x); return [...dup]; }

const soldiers=loadSoldiers();
const spSoldiers=loadSpSoldiers();
const armies=loadArmies();
const trainings=loadTrainingTechs();
const trainingLevels=loadTrainingLevels();
const missions=loadMissions();
const submitBundles=loadMissionSubmitBundles();
const spHeroes=loadSpHeroes();
const errors=[];

const expectCount=(label,actual,expected)=>{ if(actual!==expected) errors.push(`${label} count ${actual} != validated baseline ${expected}`); };
expectCount('SoldierInfo',soldiers.length,777);
expectCount('SPSoldierInfo',spSoldiers.length,56);
expectCount('TrainingTechInfo',trainings.length,287);
expectCount('TrainingTechLevelInfo',trainingLevels.length,2945);
expectCount('MissionInfo',missions.length,3347);
expectCount('MissionSumitItemInfo',submitBundles.length,160);
expectCount('SPHeroInfo',spHeroes.length,25);

for(const [label,rows,key] of [
  ['SoldierInfo',soldiers,'soldierId'],
  ['SPSoldierInfo',spSoldiers,'spSoldierId'],
  ['ArmyInfo',armies,'armyId'],
  ['TrainingTechInfo',trainings,'techId'],
  ['TrainingTechLevelInfo',trainingLevels,'levelInfoId'],
  ['MissionInfo',missions,'missionId'],
  ['MissionSumitItemInfo',submitBundles,'bundleId'],
  ['SPHeroInfo',spHeroes,'heroId'],
]){
  const dup=duplicates(rows.map(x=>x[key]));
  if(dup.length) errors.push(`${label} duplicate normalized IDs: ${dup.join(',')}`);
  if(rows.some(x=>!x[key])) errors.push(`${label} contains zero/missing normalized ID`);
}

const secondStageTrue=spSoldiers.filter(x=>x.secondStageUnlock).length;
const secondStageFalse=spSoldiers.length-secondStageTrue;
if(secondStageTrue!==45||secondStageFalse!==11) errors.push(`SP second-stage split ${secondStageTrue}/${secondStageFalse} != validated baseline 45/11`);

const rewardEdges=spHeroes.reduce((n,x)=>n+x.rewardSoldierIds.length,0);
if(rewardEdges!==25) errors.push(`SPHero reward edges ${rewardEdges} != validated baseline 25`);

const requiredSoldierFields=soldiers.filter(x=>x.useable&&!x.isEnemy).filter(x=>!x.nameCn||![1,2,3].includes(x.tier)||!x.armyId);
if(requiredSoldierFields.length) errors.push(`${requiredSoldierFields.length} displayable SoldierInfo rows failed normalized identity/classification fields`);

const result={
  version:1,
  stage:'soldier-page-4-1',
  status:errors.length?'FAIL':'PASS',
  inputFormat:'UnityDataTool direct JSON arrays',
  legacyTextAssetParsing:false,
  counts:{
    sourceSoldiers:soldiers.length,
    spSoldiers:spSoldiers.length,
    armies:armies.length,
    trainingTechRecords:trainings.length,
    trainingLevelRecords:trainingLevels.length,
    missionRecords:missions.length,
    missionSubmitBundles:submitBundles.length,
    spHeroRecords:spHeroes.length,
    spHeroRewardEdges:rewardEdges,
    secondStageTrue,
    secondStageFalse,
  },
  errors,
  completion:'All Soldier-stage ConfigData inputs required by Stage2/Stage3 load through the shared direct-JSON adapter without m_bytes/protobuf decoding.'
};
const outPath=path.join(ROOT,'data/validation/soldier-stage4-1-input.v1.json');
fs.mkdirSync(path.dirname(outPath),{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(errors.length) process.exit(1);
