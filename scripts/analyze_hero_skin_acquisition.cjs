'use strict';
const fs=require('fs'); const path=require('path');
const root=path.resolve(__dirname,'..'); const c=path.join(root,'data/configdata'); const v=path.join(root,'data/validation');
const load=n=>JSON.parse(fs.readFileSync(path.join(c,n),'utf8'));
const skin=load('ConfigDataHeroSkinInfo.json');
const fixed=load('ConfigDataFixedStoreItemInfo.json');
const stores=load('ConfigDataStoreInfo.json');
const resources=load('ConfigDataCharImageSkinResourceInfo.json');
const heroInfo=load('ConfigDataHeroInfo.json');
const masterRoot=JSON.parse(fs.readFileSync(path.join(root,'data/hero-name-master.v1.json'),'utf8'));
const heroes=Array.isArray(masterRoot)?masterRoot:(masterRoot.records||[]);
if(heroes.length!==267) throw new Error(`Expected 267 heroes; got ${heroes.length}`);
const hById=new Map(heroInfo.filter(x=>Number.isInteger(x?.ID)).map(x=>[x.ID,x]));
const sById=new Map(skin.filter(x=>Number.isInteger(x?.ID)).map(x=>[x.ID,x]));
const rById=new Map(resources.filter(x=>Number.isInteger(x?.ID)).map(x=>[x.ID,x]));
const storeNames=new Map(stores.map(x=>[x.StoreID,x.StoreName]));
const storeByItem=new Map();
for(const x of fixed){if(!Number.isInteger(x?.ItemId))continue;const a=storeByItem.get(x.ItemId)||[];a.push(x);storeByItem.set(x.ItemId,a);}
const refs=[]; const errors=[];
for(const h of heroes){const heroId=Number(h.heroId);const row=hById.get(heroId);if(!row){errors.push(`missing HeroInfo ${heroId}`);continue;}const ids=row.Skins_ID===undefined?[]:row.Skins_ID;if(!Array.isArray(ids)){errors.push(`invalid Skins_ID ${heroId}`);continue;}for(let i=0;i<ids.length;i++){const s=sById.get(ids[i]);if(!s){errors.push(`missing SkinInfo ${ids[i]}`);continue;}const r=rById.get(s.CharImageSkinResource_ID);if(!r)errors.push(`missing SkinResource ${s.CharImageSkinResource_ID}`);const shops=storeByItem.get(s.ID)||[];refs.push({heroId,nameKr:h.nameKr??null,index:i,skinId:s.ID,name:s.Name??null,getPathType:Number.isInteger(s.GetPathType)?s.GetPathType:null,score:Number.isInteger(s.Score)?s.Score:null,resourceId:s.CharImageSkinResource_ID,resourceName:r?.Name??null,image:r?.Image??null,spineAssetPath:r?.SpineAssetPath??null,storeRows:shops.map(x=>({storeId:x.StoreID,storeName:storeNames.get(x.StoreID)||null,name:x.Name??null,currencyType:x.CurrencyType??null,firstPrice:x.FirstPrice??null,normalPrice:x.NormalPrice??null,uiSort:x.UISort??null,showStartTime:x.ShowStartTime??null,showEndTime:x.ShowEndTime??null}))});}}
const groups=new Map();for(const x of refs){const k=x.getPathType===null?'MISSING':String(x.getPathType);const a=groups.get(k)||[];a.push(x);groups.set(k,a);}
function summarize(xs){const score={},stores={};let storeMatched=0;for(const x of xs){score[x.score]=(score[x.score]||0)+1;if(x.storeRows.length)storeMatched++;for(const q of x.storeRows){const k=`${q.storeId}:${q.storeName}`;stores[k]=(stores[k]||0)+1;}}return{count:xs.length,resourceImageResolved:xs.filter(x=>x.image).length,spineResolved:xs.filter(x=>x.spineAssetPath).length,fixedStoreMatchedSkins:storeMatched,scoreDistribution:score,storeMembershipCounts:stores,samples:xs.slice(0,12)};}
const seqs=[];for(const h of heroes){const row=hById.get(Number(h.heroId));const ids=Array.isArray(row?.Skins_ID)?row.Skins_ID:[];if(ids.length>1)seqs.push({heroId:Number(h.heroId),nameKr:h.nameKr??null,skinIds:ids,skinNames:ids.map(id=>sById.get(id)?.Name??null)});}
const counts={type2:(groups.get('2')||[]).length,type3:(groups.get('3')||[]).length,type4:(groups.get('4')||[]).length,missing:(groups.get('MISSING')||[]).length};
const hardPass=errors.length===0&&refs.length===540&&new Set(refs.map(x=>x.skinId)).size===540&&refs.every(x=>x.image&&x.spineAssetPath)&&counts.type2===197&&counts.type3===1&&counts.type4===166&&counts.missing===176;
const result={
 version:1,
 status:hardPass?'PASS_WITH_UNENCODED_ACQUISITION_ROWS':'FAIL',
 purpose:'Final Stage 5-5-2 Hero skin semantics: main artwork, source ordering, and GetPathType categories.',
 coverage:{canonicalSkinRefs:refs.length,distinctSkinIds:new Set(refs.map(x=>x.skinId)).size,resourceRows:resources.length,resourceIdResolved:refs.filter(x=>rById.has(x.resourceId)).length,imageNonEmpty:refs.filter(x=>x.image).length,spineAssetPathNonEmpty:refs.filter(x=>x.spineAssetPath).length,errors},
 getPathTypeGroups:Object.fromEntries([...groups.entries()].map(([k,xs])=>[k,summarize(xs)])),
 semantics:{
  artwork:{status:'SOURCE_JOIN_CONFIRMED',join:'ConfigDataHeroInfo.Skins_ID[] -> ConfigDataHeroSkinInfo.ID -> CharImageSkinResource_ID -> ConfigDataCharImageSkinResourceInfo.ID',staticImageField:'ConfigDataCharImageSkinResourceInfo.Image',animatedField:'ConfigDataCharImageSkinResourceInfo.SpineAssetPath',coverage:'540/540 canonical skin refs resolve to non-empty Image and SpineAssetPath.'},
  ordering:{status:'SOURCE_ORDER_CONFIRMED',source:'ConfigDataHeroInfo.Skins_ID[]',rule:'Preserve array order exactly. Do not re-sort by skin ID, Score, store UISort, or GetPathType.',reason:'Skins_ID[] is the only explicit per-Hero membership sequence; ID and Score are not universal display-order keys.',representativeSequences:seqs.slice(0,40)},
  acquisition:{status:'ENUM_SEMANTICS_CONFIRMED_WITH_UNENCODED_ROWS',source:'ConfigDataHeroSkinInfo.GetPathType',mapping:{'2':{labelCn:'光之回响',labelKr:'광휘의 메아리',evidence:'197/197 rows have Score=120; representative skins and current StoreID 51/52 cumulative-recharge skin stores match official Light Echo acquisition.'},'3':{labelCn:'命运星织',labelKr:'운명의 별짜기',evidence:'Only 云穹誓约; it resolves to StoreID 55 皮肤抽奖 and official 命运星织 announcement.'},'4':{labelCn:'英雄皮肤商店',labelKr:'영웅 스킨 상점',evidence:'166/166 rows have fixed-store matches; 164 memberships are directly in StoreID 5 英雄皮肤商店, with limited/reissue store records also present.'}},encodedCount:counts.type2+counts.type3+counts.type4,unencodedCount:counts.missing,unencodedPolicy:'A missing GetPathType is not one acquisition category. Preserve as null/UNENCODED and use a separate supplemental acquisition dictionary only when exact event/shop/reward history is verified.',counterexample:'Matthew skin 执事美酒 has no GetPathType and is externally confirmed as an event reward, demonstrating that missing cannot be relabeled as a single generic route.'}
 },
 nonOrderingField:{Score:'Do not use Score as display order. Its distribution tracks skin category/value and is not monotonic across per-Hero skin lists.'}
};
fs.writeFileSync(path.join(v,'hero-page-stage5-5-2-skins-acquisition.v1.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,coverage:result.coverage,getPathTypeCounts:counts,semantics:result.semantics},null,2));
if(!hardPass) process.exitCode=1;