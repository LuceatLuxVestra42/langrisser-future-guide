'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const configDir = path.join(dataDir, 'configdata');
const validationDir = path.join(dataDir, 'validation');
const outPath = path.join(validationDir, 'hero-page-stage5-5-2-skins-semantics.v1.json');

const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const masterRoot = load(path.join(dataDir, 'hero-name-master.v1.json'));
const heroes = Array.isArray(masterRoot) ? masterRoot : (masterRoot.records || []);
const heroInfo = load(path.join(configDir, 'ConfigDataHeroInfo.json'));
const skinInfo = load(path.join(configDir, 'ConfigDataHeroSkinInfo.json'));
if (!Array.isArray(heroInfo) || !Array.isArray(skinInfo)) throw new Error('HeroInfo/HeroSkinInfo must be arrays');
if (heroes.length !== 267) throw new Error(`Expected 267 canonical heroes; got ${heroes.length}`);

function byInt(rows, field) {
  const m = new Map();
  for (const row of rows) {
    if (!row || !Number.isInteger(row[field])) continue;
    const a = m.get(row[field]) || [];
    a.push(row); m.set(row[field], a);
  }
  return m;
}
function countValues(values) {
  const m = new Map();
  for (const v of values) {
    const k = v === undefined ? '__MISSING__' : v === null ? '__NULL__' : String(v);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Object.fromEntries([...m.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])));
}
function mono(arr, dir) {
  if (arr.length < 2) return true;
  for (let i=1;i<arr.length;i++) {
    if (dir === 'asc' && !(arr[i-1] <= arr[i])) return false;
    if (dir === 'desc' && !(arr[i-1] >= arr[i])) return false;
  }
  return true;
}
function sampleObj(obj, maxKeys=30) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(Object.entries(obj).slice(0,maxKeys).map(([k,v]) => [k, Array.isArray(v) ? v.slice(0,8) : (v && typeof v === 'object' ? '[object]' : v)]));
}
function collectNumericFields(node, out, prefix='', depth=0) {
  if (depth > 4 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0,5000)) collectNumericFields(item, out, prefix, depth+1);
    return;
  }
  if (typeof node !== 'object') return;
  for (const [k,v] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (Number.isInteger(v)) {
      let s = out.get(p); if (!s) { s = new Set(); out.set(p,s); }
      if (s.size < 20000) s.add(v);
    } else if (Array.isArray(v) || (v && typeof v === 'object')) {
      collectNumericFields(v, out, p, depth+1);
    }
  }
}
function collectPathFields(node, out, prefix='', depth=0) {
  if (depth > 4 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0,3000)) collectPathFields(item, out, prefix, depth+1);
    return;
  }
  if (typeof node !== 'object') return;
  for (const [k,v] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string' && /(?:UI\/|Spine\/|\.prefab$|\.png$)/i.test(v)) {
      let a = out.get(p); if (!a) { a=[]; out.set(p,a); }
      if (a.length < 8 && !a.includes(v)) a.push(v);
    } else if (Array.isArray(v) || (v && typeof v === 'object')) {
      collectPathFields(v, out, p, depth+1);
    }
  }
}

const heroById = byInt(heroInfo, 'ID');
const skinById = byInt(skinInfo, 'ID');
const masterById = new Map(heroes.map(h => [Number(h.heroId), h]));
const canonicalSkinIds = [];
const heroSequences = [];
const structuralErrors = [];
for (const h of heroes) {
  const heroId = Number(h.heroId);
  const rows = heroById.get(heroId) || [];
  if (rows.length !== 1) { structuralErrors.push({heroId, heroInfoRowCount:rows.length}); continue; }
  const ids = rows[0].Skins_ID === undefined ? [] : rows[0].Skins_ID;
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) { structuralErrors.push({heroId, invalidSkinsIdValue:true}); continue; }
  const seq = [];
  for (let index=0; index<ids.length; index++) {
    const skinId = ids[index]; canonicalSkinIds.push(skinId);
    const sRows = skinById.get(skinId) || [];
    if (sRows.length !== 1) { structuralErrors.push({heroId, skinId, skinRowCount:sRows.length}); continue; }
    const s = sRows[0];
    seq.push({
      index,
      skinId,
      name:s.Name ?? null,
      score:Number.isInteger(s.Score)?s.Score:null,
      getPathType:Number.isInteger(s.GetPathType)?s.GetPathType:null,
      charImageSkinResourceId:Number.isInteger(s.CharImageSkinResource_ID)?s.CharImageSkinResource_ID:null,
      enablePreview:s.EnablePreview ?? null,
    });
  }
  if (seq.length) heroSequences.push({heroId,nameKr:h.nameKr??null,skins:seq});
}
const canonicalSet = new Set(canonicalSkinIds);
const canonicalSkinRows = canonicalSkinIds.map(id => (skinById.get(id)||[])[0]).filter(Boolean);
const resourceIds = new Set(canonicalSkinRows.map(s=>s.CharImageSkinResource_ID).filter(Number.isInteger));
const modelResourceIds = new Set();
for (const s of canonicalSkinRows) {
  for (const x of (Array.isArray(s.SpecifiedModelSkinResource)?s.SpecifiedModelSkinResource:[])) {
    if (Number.isInteger(x?.SkinResourceId)) modelResourceIds.add(x.SkinResourceId);
  }
}

const multi = heroSequences.filter(x=>x.skins.length>=2);
const ordering = {
  heroesWithSkins:heroSequences.length,
  heroesWithMultipleSkins:multi.length,
  listOrderIdAscending:multi.filter(x=>mono(x.skins.map(s=>s.skinId),'asc')).length,
  listOrderIdDescending:multi.filter(x=>mono(x.skins.map(s=>s.skinId),'desc')).length,
  listOrderScoreAscending:multi.filter(x=>x.skins.every(s=>s.score!==null)&&mono(x.skins.map(s=>s.score),'asc')).length,
  listOrderScoreDescending:multi.filter(x=>x.skins.every(s=>s.score!==null)&&mono(x.skins.map(s=>s.score),'desc')).length,
  exactDuplicateSkinIds: canonicalSkinIds.length - canonicalSet.size,
  representativeSequences: multi.slice(0,30),
};

const getPathGroups = new Map();
for (const s of canonicalSkinRows) {
  const k = Number.isInteger(s.GetPathType) ? String(s.GetPathType) : 'MISSING';
  const a = getPathGroups.get(k)||[];
  if (a.length<25) a.push({skinId:s.ID,name:s.Name??null,specifiedHero:s.SpecifiedHero??null,score:s.Score??null,icon:s.Icon??null});
  getPathGroups.set(k,a);
}

const candidateNameRe = /(Skin|CharImage|Resource|Painting|Fashion|Costume|Appearance|Shop|Mall|Store|Goods|Purchase|Unlock)/i;
const files = fs.readdirSync(configDir).filter(f=>f.endsWith('.json'));
const candidateFiles = files.filter(f=>candidateNameRe.test(f)).sort();
const candidateTables = [];
for (const file of candidateFiles) {
  const p = path.join(configDir,file);
  let data;
  try { data=load(p); } catch { continue; }
  const rows = Array.isArray(data) ? data : (data && typeof data==='object' ? [data] : []);
  const nums = new Map(); collectNumericFields(rows,nums);
  const paths = new Map(); collectPathFields(rows,paths);
  const matches=[];
  for (const [field,vals] of nums) {
    let skinHits=0, resourceHits=0, modelHits=0;
    for (const v of vals) {
      if (canonicalSet.has(v)) skinHits++;
      if (resourceIds.has(v)) resourceHits++;
      if (modelResourceIds.has(v)) modelHits++;
    }
    if (skinHits||resourceHits||modelHits) matches.push({field,distinctNumericValues:vals.size,skinIdHits:skinHits,skinResourceIdHits:resourceHits,modelResourceIdHits:modelHits});
  }
  if (matches.length || paths.size || /Skin|CharImage/i.test(file)) {
    candidateTables.push({
      file,
      rowCount:Array.isArray(data)?data.length:1,
      sampleKeys: rows[0]&&typeof rows[0]==='object'?Object.keys(rows[0]).slice(0,50):[],
      numericIdMatches:matches.sort((a,b)=>(b.skinResourceIdHits+b.modelResourceIdHits+b.skinIdHits)-(a.skinResourceIdHits+a.modelResourceIdHits+a.skinIdHits)).slice(0,30),
      pathFields:[...paths.entries()].map(([field,samples])=>({field,samples})).slice(0,30),
      sampleRow:sampleObj(rows[0]),
    });
  }
}

const result = {
  version:1,
  status:structuralErrors.length?'REVIEW_WITH_STRUCTURAL_ERRORS':'REVIEW',
  purpose:'Resolve Hero skin main-artwork, display-order and GetPathType acquisition semantics without assuming numeric coincidences.',
  canonicalHeroCount:heroes.length,
  canonicalSkinRefCount:canonicalSkinIds.length,
  canonicalDistinctSkinIdCount:canonicalSet.size,
  canonicalSkinRowCount:canonicalSkinRows.length,
  structuralErrors,
  directSkinFields:{
    getPathTypeDistribution:countValues(canonicalSkinRows.map(s=>s.GetPathType)),
    scoreDistribution:countValues(canonicalSkinRows.map(s=>s.Score)),
    enablePreviewDistribution:countValues(canonicalSkinRows.map(s=>s.EnablePreview)),
    charImageSkinResourceIdPresent:canonicalSkinRows.filter(s=>Number.isInteger(s.CharImageSkinResource_ID)).length,
    distinctCharImageSkinResourceIds:resourceIds.size,
    distinctModelSkinResourceIds:modelResourceIds.size,
    getPathTypeSamples:Object.fromEntries([...getPathGroups.entries()]),
  },
  ordering,
  candidateScan:{
    allConfigFileCount:files.length,
    candidateFileCount:candidateFiles.length,
    candidateFiles,
    candidateTables,
  },
  interpretation:{
    artwork:{status:'UNRESOLVED',source:null,rule:null},
    ordering:{status:'UNRESOLVED',source:null,rule:null},
    acquisition:{status:'UNRESOLVED',source:'ConfigDataHeroSkinInfo.GetPathType',dictionary:null,rule:null},
  },
};
fs.mkdirSync(validationDir,{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({
  status:result.status,
  canonicalSkinRefCount:result.canonicalSkinRefCount,
  getPathTypeDistribution:result.directSkinFields.getPathTypeDistribution,
  scoreDistribution:result.directSkinFields.scoreDistribution,
  ordering:{...ordering,representativeSequences:undefined},
  candidateFiles,
  candidateTables:candidateTables.map(t=>({file:t.file,rowCount:t.rowCount,sampleKeys:t.sampleKeys,numericIdMatches:t.numericIdMatches,pathFields:t.pathFields})),
  output:path.relative(root,outPath),
},null,2));
