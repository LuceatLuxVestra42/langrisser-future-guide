import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), read=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")), fail=(m)=>{throw new Error(m)};
const manifestPath="data/generated/hero-skill-icon-assets.v1.json";
const materialPath="data/generated/hero-skill-icon-sp-reward-materialization.v1.json";
const shardDir=path.join(root,"data/generated/hero-detail/by-id");
const manifest=read(manifestPath), material=read(materialPath);
if(manifest.schemaId!=="hero-skill-icon-assets/v1"||manifest.status!=="FROZEN") fail("manifest contract mismatch");
if(manifest.spRewardRecords||manifest.spRewardAdmission) fail("SP reward admission already exists");
if(!Array.isArray(manifest.records)||manifest.records.length!==1009) fail("general record drift");
if(!Array.isArray(manifest.awakeningRecords)||manifest.awakeningRecords.length!==256) fail("awakening record drift");
if(!Array.isArray(manifest.spTalentRecords)||manifest.spTalentRecords.length!==25) fail("SP talent record drift");
if(material.schemaId!=="hero-skill-icon-sp-reward-materialization/v1"||material.status!=="FROZEN"||material.completion!=="COMPLETE"||material.semanticReopen!==false) fail("materialization contract mismatch");
if(material.lookupAuthority!=="exact sp.secondStageRewards.skills[].icon only") fail("lookup authority mismatch");
if(material.scope?.excludedHeroIds?.length!==1||material.scope.excludedHeroIds[0]!==6||material.scope?.spTalentIconsIncluded!==false) fail("scope mismatch");
if(material.summary?.targetUsageCount!==48||material.summary?.targetUniqueIconPathCount!==48||material.summary?.packageScanCount!==68||material.summary?.bundleScanCount!==3045||material.summary?.provedCount!==48||material.summary?.missingCount!==0||material.summary?.publicPathCollisionCount!==0) fail("materialization summary mismatch");
const byPath=new Map();let released=0,total=0,excluded=0;
for(const name of fs.readdirSync(shardDir).filter(n=>/^\d+\.json$/.test(n))){
 const hero=read("data/generated/hero-detail/by-id/"+name), sp=hero.sp??{};
 if(sp.status!=="RELEASED") continue;
 released++; const heroId=Number(hero.heroId), rows=sp.secondStageRewards?.skills??[];
 if(rows.length!==2) fail("SP reward skill count drift hero="+heroId);
 for(const row of rows){total++; if(heroId===6){excluded++;continue;} const p=row.icon;if(typeof p!=="string"||!p) fail("missing SP reward icon hero="+heroId);
  let x=byPath.get(p);if(!x){x={usageCount:0,heroIds:new Set(),skillIds:new Set()};byPath.set(p,x)} x.usageCount++;x.heroIds.add(heroId);x.skillIds.add(Number(row.skillId));
 }
}
if(released!==25||total!==50||excluded!==2||byPath.size!==48) fail("current SP reward source drift");
const existing=[...manifest.records,...manifest.awakeningRecords,...manifest.spTalentRecords];
const existingSource=new Set(existing.map(r=>r.sourcePath)), existingPublic=new Set(existing.map(r=>String(r.publicPath??"").toLowerCase()).filter(Boolean));
const records=[], seenSource=new Set(), seenPublic=new Set(existingPublic);
for(const row of material.records??[]){
 const src=byPath.get(row.sourcePath);if(!src) fail("materialized source absent from current source "+row.sourcePath);
 if(existingSource.has(row.sourcePath)||seenSource.has(row.sourcePath)) fail("sourcePath overlap "+row.sourcePath);seenSource.add(row.sourcePath);
 const pub=String(row.publicPath??"").toLowerCase();if(!pub||seenPublic.has(pub)) fail("publicPath collision "+row.publicPath);seenPublic.add(pub);
 const expected={usageCount:src.usageCount,heroIds:[...src.heroIds].sort((a,b)=>a-b),skillIds:[...src.skillIds].sort((a,b)=>a-b)};
 for(const k of ["usageCount","heroIds","skillIds"]) if(JSON.stringify(row[k])!==JSON.stringify(expected[k])) fail("usage parity "+row.sourcePath+" "+k);
 if(row.role!=="sp-reward"||row.verificationOwner!=="OFFICIAL_INSTALLER_EXHAUSTIVE_ALL_BUNDLES_EXACT_RUNTIME_PATH_UNITY_SPRITE"||row.objectType!=="Sprite") fail("proof contract "+row.sourcePath);
 const file=path.join(root,String(row.publicPath).replace(/^\//,"public/"));if(!fs.existsSync(file)) fail("missing PNG "+row.publicPath);
 records.push({...row});
}
records.sort((a,b)=>a.sourcePath.localeCompare(b.sourcePath));if(records.length!==48||seenSource.size!==48) fail("admission count mismatch");
manifest.spRewardRecords=records;
manifest.spRewardAdmission={status:"FROZEN",completion:"COMPLETE",semanticReopen:false,stage:"SP_REWARD_SKILL_ICON_MANIFEST_ADMISSION",lookupAuthority:"exact sp.secondStageRewards.skills[].icon only",excludedHeroIds:[6],excludedUsageCount:2,spTalentIconsIncluded:false,predecessor:{materializationSchemaId:material.schemaId,materializationSetSha256:material.materializationSetSha256},releasedSpHeroCount:released,totalSpRewardSkillUsageCount:total,targetUsageCount:48,targetUniqueIconPathCount:48,admittedNowCount:48,missingCount:0,manifestArray:"spRewardRecords"};
fs.writeFileSync(path.join(root,manifestPath),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify({status:"PASS_ADMITTED",records:48,released,total,excluded,materializationSetSha256:material.materializationSetSha256},null,2));