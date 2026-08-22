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
console.log('       KR BANNER SCHEDULE V1 MARCH 2027 AUDIT    ');
console.log('==================================================');

console.log(`1. 전체 recordCount: ${krData.records.length} (기대: 93)`);

// 2. Dates breakdown
const byDate = {};
let marCount = 0;

krData.records.forEach(r => {
  byDate[r.krDisplayDate] = (byDate[r.krDisplayDate] || 0) + 1;
  if (r.krDisplayDate.startsWith('2027-03')) marCount++;
});
console.log('2. 날짜별 레코드 수:', byDate);
console.log(`- 3월 레코드 수: ${marCount} (기대: 13)`);

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
let chuanShuoCount = 0;
let under3000Count = 0;
let missingImageCount = 0;
const bannerCodeFrequency = {};

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
  if (r.displayImageFile === 'Picture_Notice_ChuanShuoReturn.webp') chuanShuoCount++;
  if (r.bannerCode) {
    bannerCodeFrequency[r.bannerCode] = (bannerCodeFrequency[r.bannerCode] || 0) + 1;
    const num = parseInt(r.bannerCode, 10);
    if (!isNaN(num) && num < 3000) under3000Count++;
  }
  if (r.displayImageFile === null && r.visualType !== 'prefab' && r.matchStatus !== 'unresolved') missingImageCount++;
});

// Reused bannerCodes count in schedule
const reusedBannerCodes = Object.keys(bannerCodeFrequency).filter(k => bannerCodeFrequency[k] > 1);

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
console.log(`- 3000 미만 배너 사용 수: ${under3000Count}`);
console.log(`- manual replacement 사용 수: ${manualReplacementCount}`);
console.log(`- ChuanShuoReturn 재사용 수: ${chuanShuoCount}`);
console.log(`- 스케줄 내 bannerCode 재사용 항목 수: ${reusedBannerCodes.length} (코드들: ${reusedBannerCodes.join(', ')})`);
console.log(`- 이미지 파일 미확정 수 (비-prefab & 비-unresolved): ${missingImageCount}`);

// 4. Check typo fix in 2027-01-20 #1
const rJan20 = krData.records.find(r => r.recordKey === 'kr-banner:20270120:1');
console.log('\n--- 4. 1/20 #1 Typo Fix Verification ---');
console.log(`- 1/20 #1 heroesKr[0]: ${rJan20 ? rJan20.heroesKr[0] : 'null'} (기대: 이리아) -> ${rJan20 && rJan20.heroesKr[0] === '이리아' ? 'PASS' : 'FAIL'}`);

// 5. Check March specific banners
const r10201 = krData.records.find(r => r.krDisplayDate === '2027-03-03');
console.log('\n--- 5. 3/3 Shurato Collab (10201) Verification ---');
console.log(`- 10201 존재: ${r10201 && r10201.bannerCode === '10201' ? 'PASS' : 'FAIL'}`);
if (r10201) {
  console.log(`    sourceType: ${r10201.sourceType} | scheduleType: ${r10201.scheduleType} (new 기대: ${r10201.scheduleType === 'new'})`);
  console.log(`    displayImageType: ${r10201.displayImageType} (Banner 기대: ${r10201.displayImageType === 'Banner'})`);
  console.log(`    heroesKr: [${r10201.heroesKr.join(', ')}]`);
}

const r10301 = krData.records.find(r => r.krDisplayDate === '2027-03-31' && r.displayOrder === 1);
console.log('\n--- 6. 3/31 마검의 화신 (10301) Verification ---');
console.log(`- 10301 존재: ${r10301 && r10301.bannerCode === '10301' ? 'PASS' : 'FAIL'}`);
if (r10301) {
  console.log(`    sourceType: ${r10301.sourceType} | scheduleType: ${r10301.scheduleType} (new 기대: ${r10301.scheduleType === 'new'})`);
  console.log(`    displayImageType: ${r10301.displayImageType} (Banner 기대: ${r10301.displayImageType === 'Banner'})`);
}

const r5701 = krData.records.find(r => r.krDisplayDate === '2027-03-31' && r.displayOrder === 3);
console.log('\n--- 7. 3/31 각성자 (5701) Verification ---');
console.log(`- 5701 존재: ${r5701 && r5701.bannerCode === '5701' ? 'PASS' : 'FAIL'}`);
if (r5701) {
  console.log(`    sourceType: ${r5701.sourceType} | scheduleType: ${r5701.scheduleType} (single 기대: ${r5701.scheduleType === 'single'})`);
  console.log(`    displayImageType: ${r5701.displayImageType} (Picture_Notice 기대: ${r5701.displayImageType === 'Picture_Notice'})`);
}

console.log('==================================================');
const isSuccess = krData.records.length === 93 && marCount === 13 && unresolvedCount === 0 && verifiedCount === 84 && manualCount === 9 && rJan20.heroesKr[0] === '이리아' && r10201.scheduleType === 'new' && r10301.scheduleType === 'new' && r5701.scheduleType === 'single';
console.log(` OVERALL VALIDATION STATUS: ${isSuccess ? 'PASS (100% 검증 통과)' : 'FAIL'}`);
console.log('==================================================');
if (!isSuccess) process.exit(1);
