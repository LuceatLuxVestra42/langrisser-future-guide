import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const contract = readJson('data/contracts/skin-fullart-reference.v1.json');
const manifest = readJson('data/generated/skin-fullart-reference.v1.json');
const shard = readJson('data/generated/hero-detail/by-id/6.json');
const fail = m => { throw new Error(m); };
const eq = (a,b,m) => { if (JSON.stringify(a)!==JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

if (contract.status !== 'DESIGN_FROZEN' || contract.referenceHeroId !== 6) fail('invalid fullart contract');
if (manifest.status !== 'LEON_REFERENCE_FULLART_MATERIALIZED' || manifest.referenceHeroId !== 6) fail('invalid fullart manifest');
eq(contract.expectedSkinIds, [601,602,603,604,605,606], 'reference Skin IDs changed');
if (!manifest.boundaries || manifest.boundaries.semanticRecomputed !== false || manifest.boundaries.relationRecomputed !== false || manifest.boundaries.nameJoin !== false || manifest.boundaries.idArithmetic !== false || manifest.boundaries.legacyStaticAssetConsumed !== false) fail('fullart non-semantic boundaries changed');
if (manifest.authority?.officialInstallerVersion !== '1.1.113') fail('official installer version changed');
if (manifest.authority?.officialBundle?.bundleSha256 !== '3fde9e1d477bfb8c7426e11036a7432f213237ef36944706948789a2e1c717da') fail('official Leon bundle hash changed');

const shardSkins = shard.presentation?.skins ?? [];
const byId = new Map(shardSkins.map(x => [x.skinId, x]));
if (manifest.records.length !== 6) fail(`fullart record count ${manifest.records.length} != 6`);
const expectedFiles = new Set(contract.expectedSkinIds.map(id => `${id}.webp`));
const seen = new Set();
let totalBytes = 0;
for (const r of manifest.records) {
  if (seen.has(r.skinId)) fail(`duplicate skinId ${r.skinId}`); seen.add(r.skinId);
  const source = byId.get(r.skinId); if (!source) fail(`skin ${r.skinId} absent from current Hero 6 shard`);
  if (r.heroId !== 6 || r.sourceOrder !== source.order || r.sourceSpinePath !== source.sourceSpinePath || r.nameCn !== source.nameCn) fail(`source parity changed for ${r.skinId}`);
  const expectedRepo = `public/images/skin-fullart/${r.skinId}.webp`;
  const expectedPublic = `/images/skin-fullart/${r.skinId}.webp`;
  if (r.repoPath !== expectedRepo || r.publicPath !== expectedPublic) fail(`path contract changed for ${r.skinId}`);
  if (r.maxDimension > contract.format.maxDimension || Math.max(r.width,r.height) !== r.maxDimension || r.hasAlpha !== true) fail(`image metadata invalid for ${r.skinId}`);
  const b = fs.readFileSync(r.repoPath);
  if (b.length !== r.sizeBytes || sha256(b) !== r.sha256) fail(`byte parity failed for ${r.skinId}`);
  if (b.toString('ascii',0,4) !== 'RIFF' || b.toString('ascii',8,12) !== 'WEBP') fail(`not WebP for ${r.skinId}`);
  let off=12, vp8x=null;
  while (off+8<=b.length) {
    const tag=b.toString('ascii',off,off+4); const size=b.readUInt32LE(off+4); const start=off+8;
    if (tag==='VP8X' && size>=10) { vp8x=b.subarray(start,start+10); break; }
    off=start+size+(size%2);
  }
  if (!vp8x) fail(`VP8X missing for ${r.skinId}`);
  const alpha=(vp8x[0] & 0x10)!==0;
  const width=1+vp8x[4]+(vp8x[5]<<8)+(vp8x[6]<<16);
  const height=1+vp8x[7]+(vp8x[8]<<8)+(vp8x[9]<<16);
  if (!alpha || width!==r.width || height!==r.height) fail(`WebP alpha/dimension parity failed for ${r.skinId}`);
  totalBytes += b.length;
}
eq([...seen].sort((a,b)=>a-b), contract.expectedSkinIds, 'Skin ID set changed');
const actual = fs.readdirSync(contract.outputRoot,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();
eq(actual,[...expectedFiles].sort(),'unexpected fullart files');
const result={status:'PASS_SKIN_FULLART_REFERENCE_ASSETS',referenceHeroId:6,acceptedSkinCount:6,totalBytes,repositoryMutation:false};
const frozenPath='data/validation/skin-fullart-reference.v1.json';
if (fs.existsSync(frozenPath)) eq(readJson(frozenPath),result,'frozen fullart validation changed');
console.log(JSON.stringify(result,null,2));
