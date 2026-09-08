'use strict';
const fs=require('fs'),path=require('path'); const ROOT=path.resolve(__dirname,'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const rows=d=>Array.isArray(d)?d:(d?.records||d?.rows||d?.data||[]);
const sp=read('data/generated/hero-page-stage5-4-sp.v1.json');
const records=sp.records||[]; const released=records.filter(r=>r?.sp?.status==='RELEASED');
console.log('SP_SUMMARY',JSON.stringify({heroRecords:records.length,releasedCount:released.length,releasedHeroIds:released.map(r=>r.heroId)},null,2));
const leon=records.find(r=>Number(r.heroId)===6); console.log('LEON_STAGE54',JSON.stringify(leon,null,2));

const tables=['ConfigDataSPHeroInfo.json','ConfigDataJobConnectionInfo.json','ConfigDataJobInfo.json','ConfigDataJobLevelInfo.json','ConfigDataHeroInfo.json','ConfigDataPropertyModifyInfo.json'];
for(const name of tables){const p='data/configdata/'+name;if(!fs.existsSync(path.join(ROOT,p))){console.log('TABLE_MISSING',name);continue;}const a=rows(read(p));console.log('TABLE',name,'COUNT',a.length,'KEYS',JSON.stringify(Object.keys(a[0]||{}))); if(name==='ConfigDataSPHeroInfo.json')console.log('RAW_SP6',JSON.stringify(a.find(x=>Number(x.ID)===6),null,2)); if(name==='ConfigDataJobConnectionInfo.json')console.log('RAW_JC66',JSON.stringify(a.find(x=>Number(x.ID)===66),null,2)); if(name==='ConfigDataJobInfo.json')console.log('RAW_JOB377',JSON.stringify(a.find(x=>Number(x.ID)===377),null,2));}

for(const name of ['ConfigDataJobLevelInfo.json']){const p='data/configdata/'+name;if(!fs.existsSync(path.join(ROOT,p)))continue;const a=rows(read(p));const hits=a.filter(x=>Object.values(x).some(v=>Number(v)===377||Number(v)===66));console.log('JOBLEVEL_377_66_HITS',JSON.stringify(hits.slice(0,30),null,2));}

const skip=new Set(['.git','node_modules','.next','dist','build','coverage','public','data']); const exts=new Set(['.cjs','.mjs','.js','.ts','.tsx','.json','.yml','.yaml','.md']); const needles=['ATStar','HPStar','ConfigDataSPHeroInfo','ConfigDataJobLevelInfo','masteryRewards','Property1']; const hits=[];
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(e.name))continue;const a=path.join(dir,e.name);if(e.isDirectory()){scan(a);continue;}if(!exts.has(path.extname(e.name)))continue;let t;try{t=fs.readFileSync(a,'utf8')}catch{continue}const found=needles.filter(n=>t.includes(n));if(found.length)hits.push({path:path.relative(ROOT,a).replaceAll('\\','/'),found});}}
scan(ROOT);console.log('SOURCE_HITS',JSON.stringify(hits,null,2));
