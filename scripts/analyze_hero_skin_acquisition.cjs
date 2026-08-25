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
const hById=new Map(heroInfo.filter(x=>Number.isInteger(x?.ID)).map(x=>[x.ID,x]));
const sById=new Map(skin.filter(x=>Number.isInteger(x?.ID)).map(x=>[x.ID,x]));
const rById=new Map(resources.filter(x=>Number.isInteger(x?.ID)).map(x=>[x.ID,x]));
const storeNames=new Map(stores.map(x=>[x.StoreID,x.StoreName]));
const storeByItem=new Map();
for(const x of fixed){ if(!Number.isInteger(x?.ItemId))continue; const a=storeByItem.get(x.ItemId)||[]; a.push(x); storeByItem.set(x.ItemId,a); }
const refs=[];
for(const h of heroes){ const row=hById.get(Number(h.heroId)); const ids=Array.isArray(row?.Skins_ID)?row.Skins_ID:[]; for(let i=0;i<ids.length;i++){ const s=sById.get(ids[i]); if(!s)continue; const r=rById.get(s.CharImageSkinResource_ID); const shops=storeByItem.get(s.ID)||[]; refs.push({heroId:Number(h.heroId),nameKr:h.nameKr??null,index:i,skinId:s.ID,name:s.Name??null,getPathType:Number.isInteger(s.GetPathType)?s.GetPathType:null,score:Number.isInteger(s.Score)?s.Score:null,resourceId:s.CharImageSkinResource_ID,resourceName:r?.Name??null,image:r?.Image??null,spineAssetPath:r?.SpineAssetPath??null,storeRows:shops.map(x=>({storeId:x.StoreID,storeName:storeNames.get(x.StoreID)||null,name:x.Name??null,currencyType:x.CurrencyType??null,firstPrice:x.FirstPrice??null,normalPrice:x.NormalPrice??null,uiSort:x.UISort??null,showStartTime:x.ShowStartTime??null,showEndTime:x.ShowEndTime??null}))}); }}
const group=new Map();
for(const x of refs){const k=x.getPathType===null?'MISSING':String(x.getPathType); const a=group.get(k)||[]; a.push(x); group.set(k,a);}
function summarize(xs){const score={};const store={};let image=0,spine=0,storeMatch=0;for(const x of xs){score[x.score]=(score[x.score]||0)+1;if(x.image)image++;if(x.spineAssetPath)spine++;if(x.storeRows.length)storeMatch++;for(const r of x.storeRows){const k=`${r.storeId}:${r.storeName}`;store[k]=(store[k]||0)+1;}}return{count:xs.length,resourceImageResolved:image,spineResolved:spine,fixedStoreMatchedSkins:storeMatch,scoreDistribution:score,storeMembershipCounts:store,samples:xs.slice(0,15)};}
const sequences=[];for(const h of heroes){const row=hById.get(Number(h.heroId));const ids=Array.isArray(row?.Skins_ID)?row.Skins_ID:[];if(ids.length>1)sequences.push({heroId:Number(h.heroId),nameKr:h.nameKr??null,skinIds:ids,skinNames:ids.map(id=>sById.get(id)?.Name??null)});}
const result={version:1,status:'REVIEW',purpose:'Cross-check skin artwork resources, source-preserved display order, and GetPathType acquisition categories.',coverage:{canonicalSkinRefs:refs.length,distinctSkinIds:new Set(refs.map(x=>x.skinId)).size,resourceRows:resources.length,resourceIdResolved:refs.filter(x=>rById.has(x.resourceId)).length,imageNonEmpty:refs.filter(x=>typeof x.image==='string'&&x.image.trim()).length,spineAssetPathNonEmpty:refs.filter(x=>typeof x.spineAssetPath==='string'&&x.spineAssetPath.trim()).length},getPathTypeGroups:Object.fromEntries([...group.entries()].map(([k,xs])=>[k,summarize(xs)])),ordering:{source:'ConfigDataHeroInfo.Skins_ID[]',heroSequences:sequences.slice(0,50),note:'Array position is measured as the only explicit per-Hero skin ordering source; numeric ID/Score sorting is not substituted.'},interpretation:{artwork:{status:'SOURCE_JOIN_CONFIRMED',join:'ConfigDataHeroInfo.Skins_ID[] -> ConfigDataHeroSkinInfo.ID -> CharImageSkinResource_ID -> ConfigDataCharImageSkinResourceInfo.ID',staticImageField:'ConfigDataCharImageSkinResourceInfo.Image',animatedField:'ConfigDataCharImageSkinResourceInfo.SpineAssetPath'},ordering:{status:'SOURCE_ORDER_CONFIRMED',source:'ConfigDataHeroInfo.Skins_ID[]',rule:'Preserve array order exactly; do not sort by skin ID or Score.'},acquisition:{status:'SEMANTIC_LABELS_PENDING_EXTERNAL_CROSSCHECK',source:'ConfigDataHeroSkinInfo.GetPathType',observedValues:[...group.keys()]}}};
fs.writeFileSync(path.join(v,'hero-page-stage5-5-2-skins-acquisition.v1.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({coverage:result.coverage,getPathTypeGroups:Object.fromEntries([...group.entries()].map(([k,xs])=>[k,{...summarize(xs),samples:summarize(xs).samples.slice(0,4)}])),orderingSamples:sequences.slice(0,12)},null,2));