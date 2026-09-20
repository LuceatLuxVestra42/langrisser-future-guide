'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveConfigDataDir } = require('./configdata-source-pack-maintenance-root.cjs');

const outRoot = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'hero-sp-artwork-charimage-probe', 'report');
fs.mkdirSync(outRoot, { recursive: true });
const dir = resolveConfigDataDir();
const files = fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort();
if (files.length !== 753) throw new Error(`expected 753 ConfigData files, got ${files.length}`);

const nameHints = files.filter(x => /char.*image|image.*char|hero.*image|portrait|painting/i.test(x));
const hits = [];

function walk(value, jsonPath, file, parent) {
  if (value === 1013) {
    hits.push({ file, jsonPath, parent: parent && typeof parent === 'object' && !Array.isArray(parent) ? parent : null });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v,i)=>walk(v,`${jsonPath}[${i}]`,file,value));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k,v] of Object.entries(value)) walk(v, jsonPath ? `${jsonPath}.${k}` : k, file, value);
  }
}

for (const file of files) {
  const full = path.join(dir,file);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(full,'utf8')); }
  catch { continue; }
  walk(doc,'$',file,null);
}

const id1013Rows = [];
for (const file of files) {
  const full = path.join(dir,file);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(full,'utf8')); } catch { continue; }
  const rows = Array.isArray(doc) ? doc : Array.isArray(doc?.records) ? doc.records : Array.isArray(doc?.rows) ? doc.rows : Array.isArray(doc?.data) ? doc.data : [];
  rows.forEach((row,index)=>{
    if (row && typeof row === 'object' && Number(row.ID) === 1013) id1013Rows.push({file,index,row});
  });
}

const result = {
  schemaVersion: 1,
  status: 'COMPLETE',
  source: { logicalNamespace: 'data/configdata', hydratedFileCount: files.length },
  target: { heroId: 6, charImageId: 1013 },
  filenameHints: nameHints,
  scalar1013HitCount: hits.length,
  scalar1013Hits: hits.slice(0,200),
  id1013RowCount: id1013Rows.length,
  id1013Rows: id1013Rows.slice(0,100),
  boundaries: { semanticMutationCount:0, nameJoin:false, idArithmetic:false, exactScalarSearchOnly:true }
};
fs.writeFileSync(path.join(outRoot,'hero-sp-charimage-configdata-1013-probe.json'), JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,filenameHintCount:nameHints.length,scalar1013HitCount:hits.length,id1013RowCount:id1013Rows.length,filenameHints:nameHints},null,2));
