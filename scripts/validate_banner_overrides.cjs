const fs = require('fs');
const path = require('path');

const overridesJsonPath = 'c:/Users/whddn/Documents/langrisser-future-guide/data/banner-overrides.v1.json';
const cnJsonPath = 'c:/Users/whddn/Downloads/banner-data.v1.json';
const krSchedulePath = 'c:/Users/whddn/Documents/langrisser-future-guide/data/kr-banner-schedule.v1.json';
const bannerDir = 'c:/Users/whddn/Documents/langrisser-future-guide/public/images/banners/Banner';
const noticeDir = 'c:/Users/whddn/Documents/langrisser-future-guide/public/images/banners/Picture_Notice';

const overrides = JSON.parse(fs.readFileSync(overridesJsonPath, 'utf8'));
const cnData = JSON.parse(fs.readFileSync(cnJsonPath, 'utf8'));
const krData = JSON.parse(fs.readFileSync(krSchedulePath, 'utf8'));

const bannerFiles = new Set(fs.readdirSync(bannerDir));
const noticeFiles = new Set(fs.readdirSync(noticeDir));

console.log('==================================================');
console.log('       BANNER OVERRIDES V1 VALIDATION REPORT      ');
console.log('==================================================');

// 1. Check counts
const manualCount = overrides.manualReplacements.length;
const legacyCount = overrides.legacyReusable.length;
console.log(`1. manualReplacements 건수: ${manualCount} (기대: 4) -> ${manualCount === 4 ? 'PASS' : 'FAIL'}`);
console.log(`2. legacyReusable 건수: ${legacyCount} (기대: 5) -> ${legacyCount === 5 ? 'PASS' : 'FAIL'}`);

// 2. Check 4 manual replacement files in Picture_Notice
console.log('\n--- 2. Manual Replacement Files Existence in Picture_Notice ---');
let allManualFilesExist = true;
overrides.manualReplacements.forEach(item => {
  const fileName = item.displayImageFile;
  const exists = noticeFiles.has(fileName);
  if (!exists) allManualFilesExist = false;
  console.log(`- [${item.bannerCode || item.identifier}] File: ${fileName} | Exists: ${exists}`);
});
console.log(`>> 4개 대체 이미지 파일 모두 존재 여부: ${allManualFilesExist ? 'PASS (모두 존재)' : 'FAIL'}`);

// 3. Check CN source linkage for 7404, 7804, 7902
console.log('\n--- 3. Source Record Linkage for Numeric Replacements ---');
let allSourceLinksValid = true;
['7404', '7804', '7902'].forEach(code => {
  const rep = overrides.manualReplacements.find(r => r.bannerCode === code);
  const cnMatch = cnData.banners.find(b => b.bannerCode === code);
  const valid = rep && cnMatch && rep.sourceRecordKey === cnMatch.recordKey && rep.patchCode === cnMatch.patchCode;
  if (!valid) allSourceLinksValid = false;
  console.log(`- BannerCode ${code}: sourceRecordKey=${rep.sourceRecordKey} (CN match: ${cnMatch ? cnMatch.recordKey : 'NOT_FOUND'}) | Valid: ${valid}`);
});
console.log(`>> 숫자형 7404/7804/7902 원본 연결 유효성: ${allSourceLinksValid ? 'PASS' : 'FAIL'}`);

// 4. Check ChuanShuoReturn
const cs = overrides.manualReplacements.find(r => r.identifier === 'ChuanShuoReturn');
console.log('\n--- 4. ChuanShuoReturn Status ---');
console.log(`- Identifier: ${cs.identifier}`);
console.log(`- sourceRecordKey: ${cs.sourceRecordKey} (null expected)`);
console.log(`- displayImageFile: ${cs.displayImageFile}`);
console.log(`- manualOverride: ${cs.manualOverride}`);

// 5. Check legacyReusable 5 items detailed fields
console.log('\n--- 5. Legacy Reusable 5 Items Detailed Verification ---');
let allLegacyValid = true;
const expectedLegacy = {
  '1304': { cardPoolId: 52, sourceRecordKey: 'cardpool:52', type: 'triple', heroesCn: ['雷丁', '亚鲁特缪拉', '蕾伽尔'] },
  '1404': { cardPoolId: 57, sourceRecordKey: 'cardpool:57', type: 'triple', heroesCn: ['巴恩哈特', '艾尔文', '利昂'] },
  '1503': { cardPoolId: 60, sourceRecordKey: 'cardpool:60', type: 'triple', heroesCn: ['莉亚娜', '露娜', '波赞鲁'] },
  '1602': { cardPoolId: 64, sourceRecordKey: 'cardpool:64', type: 'triple', heroesCn: ['拉娜', '蒂亚莉丝', '蕾伽尔'] },
  '1704': { cardPoolId: 68, sourceRecordKey: 'cardpool:68', type: 'triple', heroesCn: ['兰迪乌斯', '尤利娅', '古巨拉'] }
};

overrides.legacyReusable.forEach(item => {
  const exp = expectedLegacy[item.bannerCode];
  const bFile = path.basename(item.bannerImage);
  const nFile = path.basename(item.noticeImageCandidate);
  const bExists = bannerFiles.has(bFile);
  const nExists = noticeFiles.has(nFile);
  
  const hasKey = item.sourceRecordKey !== null && item.sourceRecordKey === exp.sourceRecordKey;
  const hasId = item.cardPoolId === exp.cardPoolId;
  const isTypeValid = item.type === exp.type;
  const heroesMatch = JSON.stringify(item.heroesCn) === JSON.stringify(exp.heroesCn);
  const isVerified = item.matchStatus === 'verified';
  const isLegacyReusable = item.legacyReusable === true;

  const valid = hasKey && hasId && isTypeValid && heroesMatch && bExists && nExists && isVerified && isLegacyReusable;
  if (!valid) allLegacyValid = false;

  console.log(`- BannerCode ${item.bannerCode} (${item.nameCn}):`);
  console.log(`    cardPoolId: ${item.cardPoolId} | sourceRecordKey: ${item.sourceRecordKey}`);
  console.log(`    type: ${item.type} | heroesCn: [${item.heroesCn.join(', ')}]`);
  console.log(`    Banner: ${bFile} (${bExists}) | Notice: ${nFile} (${nExists})`);
  console.log(`    matchStatus: ${item.matchStatus} | legacyReusable: ${item.legacyReusable} -> Valid: ${valid}`);
});
console.log(`>> legacyReusable 5개 상세 원본 검증: ${allLegacyValid ? 'PASS (100% 검증 완료)' : 'FAIL'}`);

// 6. Check duplicate / typo in bannerCodes
console.log('\n--- 6. Duplicate / Typo Check in Overrides ---');
const allCodes = [];
overrides.manualReplacements.forEach(r => { if (r.bannerCode) allCodes.push(r.bannerCode); });
overrides.legacyReusable.forEach(r => { if (r.bannerCode) allCodes.push(r.bannerCode); });
const duplicates = allCodes.filter((item, index) => allCodes.indexOf(item) !== index);
console.log(`- Overrides bannerCodes: [${allCodes.join(', ')}]`);
console.log(`- Duplicates found: ${duplicates.length === 0 ? 'None (PASS)' : duplicates.join(', ')}`);

// 7. Check original banner-data.v1.json Integrity
console.log('\n--- 7. Original banner-data.v1.json Integrity ---');
console.log(`- CN Total Banners: ${cnData.banners.length} (기대: 248) -> ${cnData.banners.length === 248 ? 'PASS' : 'FAIL'}`);

// 8. Check kr-banner-schedule.v1.json Integrity
console.log('\n--- 8. Original kr-banner-schedule.v1.json Integrity ---');
console.log(`- KR Schedule Records: ${krData.records.length} (기대: >=4) -> ${krData.records.length >= 4 ? 'PASS' : 'FAIL'}`);

console.log('==================================================');
console.log(` OVERALL STATUS: ${allManualFilesExist && allSourceLinksValid && allLegacyValid && krData.records.length >= 4 ? 'SUCCESS' : 'FAILURE'}`);
console.log('==================================================');
