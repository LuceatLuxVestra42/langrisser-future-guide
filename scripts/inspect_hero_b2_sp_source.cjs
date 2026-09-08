'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const sp = read('data/generated/hero-page-stage5-4-sp.v1.json');
const leonShard = read('data/generated/hero-detail/by-id/6.json');
const records = Array.isArray(sp.records) ? sp.records : [];
const spRecords = records.filter(r => r && r.sp);
console.log('SP_SUMMARY', JSON.stringify({ heroRecords: records.length, spHeroCount: spRecords.length, spHeroIds: spRecords.map(r => r.heroId) }, null, 2));
const leon = records.find(r => Number(r?.heroId) === 6);
console.log('LEON_STAGE54', JSON.stringify(leon, null, 2));
console.log('LEON_SHARD_SP', JSON.stringify(leonShard.sp, null, 2));

const skipDirs = new Set(['.git','node_modules','.next','dist','build','coverage','public','data']);
const textExt = new Set(['.cjs','.mjs','.js','.ts','.tsx','.json','.yml','.yaml','.md']);
const needles = [
  'hero-page-stage5-4-sp.v1.json',
  'secondStageRewardBuffId',
  'propertyModifiers',
  'ConfigDataHeroSP',
  'ConfigDataJobLevel',
  'starCorrection',
  'masteryFlat',
  'JobConnection',
];
const hits = [];
function scan(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    if (skipDirs.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) { scan(abs); continue; }
    if (!textExt.has(path.extname(ent.name))) continue;
    let text;
    try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
    const found = needles.filter(n => text.includes(n));
    if (found.length) hits.push({ path: path.relative(ROOT, abs).replaceAll('\\','/'), found });
  }
}
scan(ROOT);
console.log('SOURCE_HITS', JSON.stringify(hits, null, 2));

const likelyFiles = [];
function listLikely(dir) {
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    if (skipDirs.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) { listLikely(abs); continue; }
    const rel = path.relative(ROOT, abs).replaceAll('\\','/');
    if (/hero.*(sp|stage5)|sp.*hero|job.*(level|mastery|star)/i.test(rel)) likelyFiles.push(rel);
  }
}
listLikely(ROOT);
console.log('LIKELY_FILES', JSON.stringify(likelyFiles.slice(0,300), null, 2));
