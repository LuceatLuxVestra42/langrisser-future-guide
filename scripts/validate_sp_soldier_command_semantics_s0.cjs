'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONTRACT = path.join(DATA, 'contracts', 'sp-soldier-command-semantics.v1.json');
const N2_CHECKPOINT = path.join(DATA, 'validation', 'hero-soldier-command-base-n2-f.v1.json');
const N2_ARTIFACT = path.join(DATA, 'generated', 'hero-soldier-command-base.v1.json');
const R5_CHECKPOINT = path.join(DATA, 'validation', 'hero-soldier-bond-command-contribution-r5-f.v1.json');
const R5_ARTIFACT = path.join(DATA, 'generated', 'hero-soldier-bond-command-contribution.v1.json');
const SP = path.join(DATA, 'generated', 'hero-page-stage5-4-sp.v1.json');
const OUTPUT = path.join(DATA, 'validation', 'sp-soldier-command-semantics-s0.v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function mapBy(rows, key) { const m = new Map(); for (const row of rows || []) { const id = Number(row[key]); if (!Number.isInteger(id) || m.has(id)) throw new Error(`invalid/duplicate ${key}=${row[key]}`); m.set(id, row); } return m; }
function vecAdd(...vs) { const out={hp:0,at:0,df:0,magicDf:0}; for(const v of vs) for(const k of Object.keys(out)) out[k]+=Number(v?.[k]||0); return out; }
function equal(a,b) { return JSON.stringify(a) === JSON.stringify(b); }

function main() {
  const c = readJson(CONTRACT), n2c = readJson(N2_CHECKPOINT), n2 = readJson(N2_ARTIFACT), r5c = readJson(R5_CHECKPOINT), r5 = readJson(R5_ARTIFACT), sp = readJson(SP);
  const hardErrors=[];
  if (n2c.status !== c.authority.n2ExpectedStatus) hardErrors.push(`N2 checkpoint=${n2c.status}`);
  if (r5c.status !== c.authority.r5ExpectedStatus) hardErrors.push(`R5 checkpoint=${r5c.status}`);
  if (sp.status !== c.authority.spExpectedStatus) hardErrors.push(`SP predecessor=${sp.status}`);
  const released=(sp.records||[]).filter(x=>x?.sp?.status==='RELEASED');
  if (released.length !== c.authority.spReleasedCount) hardErrors.push(`SP released=${released.length}`);

  const spBy=mapBy(sp.records,'heroId'), n2By=mapBy(n2.records,'heroId'), r5By=mapBy(r5.records,'heroId');
  const fieldMap=c.fieldMapping;
  const fixtures=[];
  for (const fixture of c.evidence.behavioralCrossCheck.fixtures) {
    const heroId=fixture.heroId, row=spBy.get(heroId), stats=row?.sp?.stats;
    if (!row || row.sp?.status!=='RELEASED' || !stats) { hardErrors.push(`Hero ${heroId}: missing RELEASED SP stats`); continue; }
    const raw={};
    for (const [sourceKey,targetKey] of Object.entries(fieldMap)) {
      const value=Object.prototype.hasOwnProperty.call(stats,sourceKey) ? Number(stats[sourceKey]) : 0;
      if (!Number.isFinite(value) || !Number.isInteger(value)) hardErrors.push(`Hero ${heroId}: invalid ${sourceKey}`);
      raw[targetKey]=value;
    }
    const base=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/100]));
    const r5v=r5By.get(heroId)?.contribution;
    const n2v=n2By.get(heroId)?.base;
    if (!r5v || !n2v) { hardErrors.push(`Hero ${heroId}: missing N2/R5 vector`); continue; }
    const replacementTotal=vecAdd(base,r5v);
    const additiveTotal=vecAdd(n2v,base,r5v);
    const rawPass=equal(raw,fixture.expectedSpRaw);
    const r5Pass=equal(r5v,fixture.expectedR5);
    const replacementPass=equal(replacementTotal,fixture.publishedFinal);
    const additiveRejected=!equal(additiveTotal,fixture.publishedFinal);
    if (!rawPass) hardErrors.push(`Hero ${heroId}: SP raw fixture mismatch ${JSON.stringify(raw)}`);
    if (!r5Pass) hardErrors.push(`Hero ${heroId}: R5 fixture mismatch ${JSON.stringify(r5v)}`);
    if (!replacementPass) hardErrors.push(`Hero ${heroId}: replacement total mismatch ${JSON.stringify(replacementTotal)}`);
    if (!additiveRejected) hardErrors.push(`Hero ${heroId}: additive model was not rejected`);
    fixtures.push({heroId,raw,base,n2Base:n2v,r5:r5v,replacementTotal,additiveTotal,publishedFinal:fixture.publishedFinal,rawPass,r5Pass,replacementPass,additiveRejected});
  }

  const result={version:1,stage:'S0',status:hardErrors.length?'FAIL':'PASS',owner:c.owner,spReleasedCount:released.length,selectionRule:c.semantics.selectionRule,combinationWithN2:c.semantics.combinationWithN2,missingCommandField:c.semantics.missingCommandField,hero3Combination:c.semantics.hero3Combination,fixtures,hardErrors,blockers:hardErrors.length?['S0_VALIDATION_FAILED']:[],review:['Behavioral published values are corroboration only; canonical numeric sources remain pinned project artifacts/ConfigData projections.']};
  writeJson(OUTPUT,result);
  console.log(JSON.stringify(result,null,2));
  if(hardErrors.length) process.exitCode=1;
}
main();
