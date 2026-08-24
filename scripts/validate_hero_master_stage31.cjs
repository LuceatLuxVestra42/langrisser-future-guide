const fs = require('fs');
const path = require('path');

const masterPath = path.resolve(__dirname, '../data/hero-name-master.v1.json');
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));

let allPassed = true;
function check(description, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) allPassed = false;
  console.log(`[${status}] ${description}${details ? ` -> ${details}` : ''}`);
}

const records = master.records || [];
const heroIds = records.map((record) => record.heroId);
const cnNames = records.map((record) => record.nameCn);
const krNames = records.map((record) => record.nameKr);

check(
  '1. canonical playable hero count = 267',
  master.recordCount === 267 && records.length === 267,
  `recordCount=${master.recordCount}, records=${records.length}`,
);
check('2. heroId duplicate = 0', new Set(heroIds).size === heroIds.length);
check('3. Chinese name duplicate = 0', new Set(cnNames).size === cnNames.length);
check(
  '4. required identity fields present',
  records.every(
    (record) =>
      Number.isInteger(record.heroId) &&
      typeof record.nameCn === 'string' && record.nameCn.length > 0 &&
      typeof record.nameKr === 'string' && record.nameKr.length > 0 &&
      typeof record.nameEn === 'string' &&
      Array.isArray(record.aliasesKr) &&
      record.status === 'verified',
  ),
);

const krGroups = new Map();
for (const record of records) {
  const group = krGroups.get(record.nameKr) || [];
  group.push(record);
  krGroups.set(record.nameKr, group);
}

const duplicateKrGroups = [...krGroups.entries()]
  .filter(([, group]) => group.length > 1)
  .map(([nameKr, group]) => ({
    nameKr,
    heroIds: group.map((record) => record.heroId).sort((a, b) => a - b),
    nameCn: group.map((record) => record.nameCn),
  }));

const expectedKrCollision =
  duplicateKrGroups.length === 1 &&
  duplicateKrGroups[0].nameKr === '베르너' &&
  duplicateKrGroups[0].heroIds.length === 2 &&
  duplicateKrGroups[0].heroIds[0] === 123 &&
  duplicateKrGroups[0].heroIds[1] === 99164;

check(
  '5. Korean-name collision is only the known 베르너 pair',
  expectedKrCollision,
  JSON.stringify(duplicateKrGroups),
);

check(
  '6. heroId is safe as the canonical primary key',
  new Set(heroIds).size === records.length,
);
check(
  '7. nameKr must not be used as a unique key',
  new Set(krNames).size < records.length,
  `uniqueKr=${new Set(krNames).size}, records=${records.length}`,
);

console.log('\n==================================================');
console.log(` HERO MASTER STAGE 3-1 VALIDATION: ${allPassed ? 'PASS' : 'FAIL'}`);
console.log(`- canonical file: data/hero-name-master.v1.json`);
console.log(`- playable heroes: ${records.length}`);
console.log(`- unique heroIds: ${new Set(heroIds).size}`);
console.log(`- unique CN names: ${new Set(cnNames).size}`);
console.log(`- unique KR names: ${new Set(krNames).size}`);
console.log(`- KR collision groups: ${duplicateKrGroups.length}`);
console.log('- primary key policy: heroId');
console.log('==================================================');

if (!allPassed) process.exit(1);
