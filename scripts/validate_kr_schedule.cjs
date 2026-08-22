const fs = require('fs');
const path = require('path');

const cnJsonPath = 'c:/Users/whddn/Downloads/banner-data.v1.json';
const krJsonPath = 'c:/Users/whddn/Documents/langrisser-future-guide/data/kr-banner-schedule.v1.json';
const overridesJsonPath = 'c:/Users/whddn/Documents/langrisser-future-guide/data/banner-overrides.v1.json';
const bannerDir = 'c:/Users/whddn/Documents/langrisser-future-guide/public/images/banners/Banner';
const noticeDir = 'c:/Users/whddn/Documents/langrisser-future-guide/public/images/banners/Picture_Notice';

const cnData = JSON.parse(fs.readFileSync(cnJsonPath, 'utf8'));
const krData = JSON.parse(fs.readFileSync(krJsonPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesJsonPath, 'utf8'));

const bannerFiles = new Set(fs.readdirSync(bannerDir));
const noticeFiles = new Set(fs.readdirSync(noticeDir));

console.log('==================================================');
console.log('       KR BANNER SCHEDULE V1 DECEMBER AUDIT       ');
console.log('==================================================');

console.log(`1. 전체 recordCount: ${krData.records.length} (기대: 60)`);

// 2. Dates breakdown
const byDate = {};
krData.records.forEach(r => {
  byDate[r.krDisplayDate] = (byDate[r.krDisplayDate] || 0) + 1;
});
console.log('2. 날짜별 레코드 수:', byDate);

// 3. Statistics
let verifiedCount = 0;
let probableCount = 0;
let unresolvedCount = 0;
let manualCount = 0;

let singleCount = 0;
let dualCount = 0;
let tripleCount = 0;
let newCount = 0;
let wishCount = 0;

let legacyReusableCount = 0;
let manualReplacementCount = 0;
let missingImageCount = 0;

krData.records.forEach((r, idx) => {
  if (r.matchStatus === 'verified') verifiedCount++;
  if (r.matchStatus === 'probable') probableCount++;
  if (r.matchStatus === 'unresolved') unresolvedCount++;
  if (r.matchStatus === 'manual') manualCount++;

  if (r.scheduleType === 'single') singleCount++;
  if (r.scheduleType === 'dual') dualCount++;
  if (r.scheduleType === 'triple') tripleCount++;
  if (r.scheduleType === 'new') newCount++;
  if (r.scheduleType === 'wish') wishCount++;

  if (r.matchBasis && r.matchBasis.includes('legacyReusable')) legacyReusableCount++;
  if (r.manualOverride === true) manualReplacementCount++;
  if (r.displayImageFile === null && r.visualType !== 'prefab' && r.matchStatus !== 'unresolved') missingImageCount++;
});

console.log('\n--- 3. Statistics ---');
console.log(`- verified 수: ${verifiedCount}`);
console.log(`- probable 수: ${probableCount}`);
console.log(`- unresolved 수: ${unresolvedCount}`);
console.log(`- manual 수: ${manualCount}`);
console.log(`- new 수: ${newCount}`);
console.log(`- single 수: ${singleCount}`);
console.log(`- dual 수: ${dualCount}`);
console.log(`- triple 수: ${tripleCount}`);
console.log(`- wish 수: ${wishCount}`);
console.log(`- legacyReusable 재사용 수: ${legacyReusableCount}`);
console.log(`- manual replacement 사용 수: ${manualReplacementCount}`);
console.log(`- 이미지 파일 미확정 수 (비-prefab & 비-unresolved): ${missingImageCount}`);

// 4. Check 성자 강림 소원소환 (12/16 #2)
const rSaintWish = krData.records.find(r => r.krDisplayDate === '2026-12-16' && r.displayOrder === 2);
console.log('\n--- 4. 12/16 #2 성자 강림 소원소환 (Banner_OptionalWish) Verification ---');
console.log(`- 성자 강림 소원소환 존재: ${rSaintWish ? 'PASS' : 'FAIL'}`);
if (rSaintWish) {
  console.log(`    sourceRecordKey: ${rSaintWish.sourceRecordKey} (기대: cardpool:99143)`);
  console.log(`    bannerCode: ${rSaintWish.bannerCode} (null 유지)`);
  console.log(`    sourceType: ${rSaintWish.sourceType}`);
  console.log(`    scheduleType: ${rSaintWish.scheduleType}`);
  console.log(`    selectableText: "${rSaintWish.selectableText}"`);
  console.log(`    displayImageFile: ${rSaintWish.displayImageFile}`);
  console.log(`    displayImageStatus: ${rSaintWish.displayImageStatus}`);
  console.log(`    matchStatus: ${rSaintWish.matchStatus}`);
  console.log(`    matchBasis: ${rSaintWish.matchBasis}`);
}

// 5. Check 12/2 1503 legacyReusable & 12/30 1404 legacyReusable
const r1503 = krData.records.find(r => r.krDisplayDate === '2026-12-02' && r.bannerCode === '1503');
const r1404 = krData.records.find(r => r.krDisplayDate === '2026-12-30' && r.bannerCode === '1404');
console.log('\n--- 5. Legacy Reusable (1503 & 1404) Verification ---');
console.log(`- 12/2 1503 (보젤/루나/리아나): ${r1503 ? 'PASS' : 'FAIL'} | sourceKey: ${r1503 ? r1503.sourceRecordKey : 'null'}`);
console.log(`- 12/30 1404 (레온/엘윈/베른하르트): ${r1404 ? 'PASS' : 'FAIL'} | sourceKey: ${r1404 ? r1404.sourceRecordKey : 'null'}`);

console.log('==================================================');
const isSuccess = krData.records.length === 60 && unresolvedCount === 0 && verifiedCount === 54 && manualCount === 6 && rSaintWish && rSaintWish.sourceRecordKey === 'cardpool:99143';
console.log(` OVERALL VALIDATION STATUS: ${isSuccess ? 'PASS (100% 검증 통과)' : 'FAIL'}`);
console.log('==================================================');
if (!isSuccess) process.exit(1);
