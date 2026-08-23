const fs = require('fs');
const path = require('path');

const masterPath = path.resolve(__dirname, '../data/hero-name-master.v1.json');
const schedulePath = path.resolve(__dirname, '../data/kr-banner-schedule.v1.json');

const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));

let allPassed = true;
function check(description, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) allPassed = false;
  console.log(`[${status}] ${description}${details ? ` -> ${details}` : ''}`);
}

const records = master.records || [];
check('1. master recordCount === 267', master.recordCount === 267 && records.length === 267, `recordCount=${master.recordCount}, records=${records.length}`);

const heroIds = records.map(r => r.heroId);
const cnNames = records.map(r => r.nameCn);
check('2. heroId 중복 0건', new Set(heroIds).size === heroIds.length);
check('3. nameCn 중복 0건', new Set(cnNames).size === cnNames.length);
check('4. 필수 필드 누락 0건', records.every(r => Number.isInteger(r.heroId) && r.nameCn && r.nameKr && typeof r.nameEn === 'string' && Array.isArray(r.aliasesKr) && r.status));
check('5. 모든 이름 상태 verified', records.every(r => r.status === 'verified'));

const byCn = new Map(records.map(r => [r.nameCn, r]));
const schedulePairs = [];
const missingCn = [];
const mismatchedKr = [];

for (const banner of schedule.records || []) {
  const cn = banner.heroesCn || [];
  const kr = banner.heroesKr || [];

  // wish/manual labels can live only on the Korean side, so only compare aligned CN hero slots.
  for (let i = 0; i < cn.length; i++) {
    const cnName = cn[i];
    const krName = kr[i];
    const hero = byCn.get(cnName);
    schedulePairs.push({ banner: banner.recordKey, cnName, krName });

    if (!hero) {
      missingCn.push(`${banner.recordKey}: ${cnName}`);
      continue;
    }
    if (hero.nameKr !== krName) {
      mismatchedKr.push(`${banner.recordKey}: ${cnName} -> schedule=${krName}, master=${hero.nameKr}`);
    }
  }
}

check('6. 배너 heroesCn 중 master 미등록 영웅 0건', missingCn.length === 0, missingCn.slice(0, 10).join(' | '));
check('7. 배너 CN↔KR 이름 불일치 0건', mismatchedKr.length === 0, mismatchedKr.slice(0, 10).join(' | '));

const bannedOldNames = ['아브사이트', '아원(쿠모)'];
const rawMaster = fs.readFileSync(masterPath, 'utf8');
for (let i = 0; i < bannedOldNames.length; i++) {
  const oldName = bannedOldNames[i];
  check(`${8 + i}. master 내 "${oldName}" 잔존 0건`, !rawMaster.includes(oldName));
}

console.log('\n==================================================');
console.log(` HERO NAME MASTER VALIDATION: ${allPassed ? 'PASS' : 'FAIL'}`);
console.log(`- master heroes: ${records.length}`);
console.log(`- schedule hero slots checked: ${schedulePairs.length}`);
console.log(`- missing CN names: ${missingCn.length}`);
console.log(`- CN↔KR mismatches: ${mismatchedKr.length}`);
console.log('==================================================');

if (!allPassed) process.exit(1);
