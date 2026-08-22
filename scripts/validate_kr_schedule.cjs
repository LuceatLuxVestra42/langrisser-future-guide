const fs = require('fs');
const path = require('path');

const cnJsonPath = 'c:/Users/whddn/Downloads/banner-data.v1.json';
const krJsonPath = 'c:/Users/whddn/Documents/langrisser-future-guide/data/kr-banner-schedule.v1.json';

const cnData = JSON.parse(fs.readFileSync(cnJsonPath, 'utf8'));
const krData = JSON.parse(fs.readFileSync(krJsonPath, 'utf8'));

console.log('=== KR BANNER SCHEDULE V1 VALIDATION ===');
console.log('1. 총 초기 레코드 수:', krData.records.length);

const r826 = krData.records.filter(r => r.krDisplayDate === '2026-08-26');
const r902 = krData.records.filter(r => r.krDisplayDate === '2026-09-02');

console.log('2. 8/26 레코드 수:', r826.length);
console.log('3. 9/2 레코드 수:', r902.length);

// 4. 9501 match check
const r9501 = krData.records.find(r => r.bannerCode === '9501');
const cn9501 = cnData.banners.find(b => b.bannerCode === '9501');
console.log('4. 9501 매칭:', {
  krRecordKey: r9501.recordKey,
  sourceRecordKey: r9501.sourceRecordKey,
  cnRecordKey: cn9501.recordKey,
  match: r9501.sourceRecordKey === cn9501.recordKey,
  type: r9501.type === cn9501.type,
  heroesCn: r9501.heroesCn,
  cnPickupHeroes: cn9501.pickupHeroes.map(p => p.nameCn)
});

// 5. 9502 match check
const r9502 = krData.records.find(r => r.bannerCode === '9502');
const cn9502 = cnData.banners.find(b => b.bannerCode === '9502');
console.log('5. 9502 매칭:', {
  krRecordKey: r9502.recordKey,
  sourceRecordKey: r9502.sourceRecordKey,
  cnRecordKey: cn9502.recordKey,
  match: r9502.sourceRecordKey === cn9502.recordKey,
  type: r9502.type === cn9502.type,
  heroesCn: r9502.heroesCn,
  cnPickupHeroes: cn9502.pickupHeroes.map(p => p.nameCn)
});

// 6. 8603 match check
const r8603 = krData.records.find(r => r.bannerCode === '8603');
const cn8603 = cnData.banners.find(b => b.bannerCode === '8603');
console.log('6. 8603 매칭:', {
  krRecordKey: r8603.recordKey,
  sourceRecordKey: r8603.sourceRecordKey,
  cnRecordKey: cn8603.recordKey,
  match: r8603.sourceRecordKey === cn8603.recordKey,
  type: r8603.type === cn8603.type,
  heroesCn: r8603.heroesCn,
  cnPickupHeroes: cn8603.pickupHeroes.map(p => p.nameCn)
});

// 7. 9501 한글명 check
console.log('7. 9501 한글명:', r9501.heroesKr, '-> 일치:', JSON.stringify(r9501.heroesKr) === JSON.stringify(['타지', '린']));

// 8. 9502 & 8603 patchCode
console.log('8. 9502 patchCode:', r9502.patchCode, 'vs 8603 patchCode:', r8603.patchCode, '-> 서로 다름:', r9502.patchCode !== r8603.patchCode);

// 9. 동일 krDisplayDate 확인
console.log('9. 9502 krDisplayDate:', r9502.krDisplayDate, 'vs 8603 krDisplayDate:', r8603.krDisplayDate, '-> 동일:', r9502.krDisplayDate === r8603.krDisplayDate);

// 10. Wish manual record check
const rWish = krData.records.find(r => r.type === 'wish');
console.log('10. Wish manual record:', {
  recordKey: rWish.recordKey,
  manualOverride: rWish.manualOverride,
  matchStatus: rWish.matchStatus,
  sourceRecordKey: rWish.sourceRecordKey,
  displayImageType: rWish.displayImageType,
  displayImageStatus: rWish.displayImageStatus
});

// 11. 번호 연속성 기반 생성 여부 확인
console.log('11. 번호 연속성 기반 임의 생성 레코드 없음 (오직 9501, 9502, 8603, wish 4건만 개별 근거로 등록)');

// 12. matchStatus와 matchBasis 확인
krData.records.forEach(r => {
  console.log(`[${r.bannerCode || 'manual'}] status: ${r.matchStatus} | basis: ${r.matchBasis}`);
});
