'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const sp = read('data/generated/hero-page-stage5-4-sp.v1.json');
const leonShard = read('data/generated/hero-detail/by-id/6.json');

const typeOf = v => Array.isArray(v) ? `array(${v.length})` : (v === null ? 'null' : typeof v);
console.log('TOP', JSON.stringify(Object.fromEntries(Object.entries(sp).map(([k,v]) => [k, typeOf(v)])), null, 2));

const heroArrays = [];
function walk(value, p = '$', depth = 0) {
  if (depth > 8 || value == null) return;
  if (Array.isArray(value)) {
    if (value.length && value.every(x => x && typeof x === 'object' && !Array.isArray(x)) && value.some(x => Number.isInteger(Number(x.heroId)))) {
      const keysets = [...new Set(value.slice(0, 50).map(x => Object.keys(x).sort().join(',')))];
      heroArrays.push({ path: p, length: value.length, keysets });
    }
    for (let i = 0; i < Math.min(value.length, 300); i++) walk(value[i], `${p}[${i}]`, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [k,v] of Object.entries(value)) walk(v, `${p}.${k}`, depth + 1);
  }
}
walk(sp);
console.log('HERO_ARRAYS', JSON.stringify(heroArrays, null, 2));

function findHero6(value, p = '$', out = [], depth = 0) {
  if (depth > 10 || value == null) return out;
  if (Array.isArray(value)) {
    for (let i=0;i<value.length;i++) findHero6(value[i], `${p}[${i}]`, out, depth+1);
  } else if (typeof value === 'object') {
    if (Number(value.heroId) === 6) out.push({ path:p, value });
    for (const [k,v] of Object.entries(value)) findHero6(v, `${p}.${k}`, out, depth+1);
  }
  return out;
}
const hero6 = findHero6(sp);
console.log('HERO6_COUNT', hero6.length);
for (const hit of hero6) {
  console.log('HERO6_PATH', hit.path);
  console.log(JSON.stringify(hit.value, null, 2));
}

const interesting = [];
function collectInteresting(value, p = '$', depth = 0) {
  if (depth > 10 || value == null) return;
  if (Array.isArray(value)) {
    for (let i=0;i<value.length;i++) collectInteresting(value[i], `${p}[${i}]`, depth+1);
  } else if (typeof value === 'object') {
    for (const [k,v] of Object.entries(value)) {
      if (/reward|buff|stage|star|job|property|stat|mastery|growth|correction/i.test(k)) {
        const rendered = (v && typeof v === 'object') ? typeOf(v) : v;
        interesting.push({ path:`${p}.${k}`, value:rendered });
      }
      collectInteresting(v, `${p}.${k}`, depth+1);
    }
  }
}
for (const hit of hero6) collectInteresting(hit.value, hit.path);
console.log('HERO6_INTERESTING', JSON.stringify(interesting, null, 2));
console.log('LEON_SHARD_SP_KEYS', JSON.stringify(leonShard.sp ? Object.keys(leonShard.sp) : null));
console.log('LEON_SHARD_SP', JSON.stringify(leonShard.sp, null, 2));
