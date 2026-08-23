const fs = require('fs');
const path = require('path');

const krJsonPath = path.resolve(__dirname, '../data/kr-banner-schedule.v1.json');
const bannerDir = path.resolve(__dirname, '../public/images/banners/Banner');
const noticeDir = path.resolve(__dirname, '../public/images/banners/Picture_Notice');

const krData = JSON.parse(fs.readFileSync(krJsonPath, 'utf8'));
const rawKrText = fs.readFileSync(krJsonPath, 'utf8');

const bannerFiles = new Set(fs.readdirSync(bannerDir));
const noticeFiles = new Set(fs.readdirSync(noticeDir));

console.log('==================================================');
console.log('       KR BANNER SCHEDULE V1 COMPREHENSIVE AUDIT ');
console.log('==================================================\n');

let allPassed = true;
function check(description, condition, details = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) allPassed = false;
  console.log(`[${status}] ${description}${details ? ` -> ${details}` : ''}`);
  return condition;
}

// 1. recordCount = 93
check('1. recordCount === 93', krData.records.length === 93, `Actual: ${krData.records.length}`);

// 2. startDate = 2026-09-02
check('2. startDate === "2026-09-02"', krData.startDate === '2026-09-02', `Actual: ${krData.startDate}`);

// 3. 8/26 레코드 0건
const r0826 = krData.records.filter(r => r.krDisplayDate === '2026-08-26');
check('3. 2026-08-26 레코드 0건', r0826.length === 0, `Count: ${r0826.length}`);

// 4. 3/31 레코드 4건
const r0331 = krData.records.filter(r => r.krDisplayDate === '2027-03-31');
check('4. 2027-03-31 레코드 4건', r0331.length === 4, `Count: ${r0331.length}`);

// 5. 3/31 빙설 심연의 지배자 존재
const r0331_ice = r0331.find(r => r.bannerCode === '7001' && r.scheduleType === 'single');
check('5. 3/31 빙설 심연의 지배자 (7001 single) 존재', !!r0331_ice && r0331_ice.heroesKr.includes('빙설 심연의 지배자') && r0331_ice.displayImageFile === 'Picture_Notice_7001.webp');

// 6. 날짜별 displayOrder 중복 없음
const byDate = {};
let hasOrderDup = false;
krData.records.forEach(r => {
  if (!byDate[r.krDisplayDate]) byDate[r.krDisplayDate] = [];
  byDate[r.krDisplayDate].push(r.displayOrder);
});
for (const [date, orders] of Object.entries(byDate)) {
  const set = new Set(orders);
  if (set.size !== orders.length) hasOrderDup = true;
}
check('6. 날짜별 displayOrder 중복 없음', !hasOrderDup);

// 7. scheduleType별 이미지 타입 규칙
let typeRuleViolations = 0;
krData.records.forEach(r => {
  if (r.scheduleType === 'new' && r.displayImageType !== 'Banner') typeRuleViolations++;
  if (r.scheduleType === 'single' && r.displayImageType !== 'Picture_Notice') typeRuleViolations++;
  if (r.scheduleType === 'dual' && r.displayImageType !== 'Picture_Notice') typeRuleViolations++;
  if (r.scheduleType === 'triple' && r.displayImageType !== 'Banner') typeRuleViolations++;
  if (r.scheduleType === 'wish' && r.displayImageType !== 'Picture_Notice') typeRuleViolations++;
});
check('7. scheduleType별 이미지 규격 준수 (new/triple->Banner, single/dual/wish->Picture_Notice)', typeRuleViolations === 0, `Violations: ${typeRuleViolations}`);

// 8. 9/16 라인가하르트 II가 남아 있지 않음
const r0916_old = krData.records.find(r => (r.heroesKr || []).includes('라인가하르트 II') || (r.note || '').includes('라인가하르트 II'));
check('8. 9/16 라인가하르트 II 잔존 0건', !r0916_old);

// 9. 9/16 리인카네이션2 연결 확인 & heroesCn 빈 배열 확인
const r0916_wish = krData.records.find(r => r.krDisplayDate === '2026-09-16' && r.scheduleType === 'wish');
const r0916_wish_valid = r0916_wish && r0916_wish.bannerCode === '7902' && r0916_wish.sourceRecordKey === 'cardpool:305' && r0916_wish.displayImageFile === 'Picture_Notice_7902.webp' && r0916_wish.matchStatus === 'verified' && r0916_wish.heroesCn.length === 0;
check('9. 9/16 리인카네이션2 (7902 / cardpool:305 / heroesCn=[]) 연결 확인', !!r0916_wish_valid);

// 10. 9/9 / 11/18 소원 이미지 재매칭 확인
const r0909_wish = krData.records.find(r => r.krDisplayDate === '2026-09-09' && r.bannerCode === '9616');
const r1118_wish = krData.records.find(r => r.krDisplayDate === '2026-11-18' && r.bannerCode === '9605');
const wishSwapValid = r0909_wish && r0909_wish.displayImageFile === 'Picture_Notice_9605.webp' && r1118_wish && r1118_wish.displayImageFile === 'Picture_Notice_9616.webp';
check('10. 9/9(9616->Notice_9605) & 11/18(9605->Notice_9616) 소원 이미지 재매칭 확인', !!wishSwapValid);

// 11. Picture_Notice_4405.webp 연결 확인
const r1007_4405 = krData.records.find(r => r.krDisplayDate === '2026-10-07' && r.bannerCode === '4405');
const r1007_4405_valid = r1007_4405 && r1007_4405.displayImageFile === 'Picture_Notice_4405.webp' && r1007_4405.displayImageStatus === 'matched';
check('11. 10/7 로젠실/클로테르 (4405 -> Picture_Notice_4405.webp) 연결 확인', !!r1007_4405_valid);

// 12. OptionalWish 이미지 연결 및 verified 상태 확인
const r1216_opt = krData.records.find(r => r.krDisplayDate === '2026-12-16' && r.sourceRecordKey === 'cardpool:99143');
const r1216_opt_valid = r1216_opt && r1216_opt.displayImageFile === 'Picture_Notice_OptionalWish.webp' && r1216_opt.displayImageStatus === 'manual-replacement' && r1216_opt.matchStatus === 'verified' && r1216_opt.manualOverride === true;
check('12. 12/16 성자 강림 (cardpool:99143 -> matchStatus=verified / Notice_OptionalWish) 연결 확인', !!r1216_opt_valid);

// 13. 새로 추가된 신규 Banner 이미지 연결 여부
const expectedNewBanners = [
  { date: '2026-09-23', code: '9601', file: 'Banner_9601.png' },
  { date: '2026-10-21', code: '9701', file: 'Banner_9701.png' },
  { date: '2026-11-11', code: '9801', file: 'Banner_9801.png' },
  { date: '2026-12-09', code: '9901', file: 'Banner_9901.png' },
  { date: '2027-01-06', code: '10001', file: 'Banner_10001.png' },
  { date: '2027-02-03', code: '10101', file: 'Banner_10101.png' },
  { date: '2027-03-03', code: '10201', file: 'Banner_10201.png' },
  { date: '2027-03-31', code: '10301', file: 'Banner_10301.png' },
];
let newBannersValid = true;
expectedNewBanners.forEach(nb => {
  const r = krData.records.find(item => item.krDisplayDate === nb.date && item.scheduleType === 'new');
  const valid = r && r.bannerCode === nb.code && r.displayImageFile === nb.file && r.displayImageStatus === 'matched' && r.visualType === 'static' && bannerFiles.has(nb.file);
  if (!valid) newBannersValid = false;
});
check('13. 신규 8개 배너 Banner_*.png 연결 및 정적 파일 존재 확인', newBannersValid);

// 14. heroesCn 내 '转生' 잔존 0건 확인
let zhuanShengCount = 0;
krData.records.forEach(r => {
  if (r.heroesCn && r.heroesCn.includes('转生')) zhuanShengCount++;
});
check('14. heroesCn 내 "转生" 잔존 0건', zhuanShengCount === 0, `Count: ${zhuanShengCount}`);

// 15. 沙律 및 塞拉菲娜 매핑 확인
const r0901_new = krData.records.find(r => r.krDisplayDate === '2026-12-09' && r.bannerCode === '9901');
const r0310_dual = krData.records.find(r => r.krDisplayDate === '2027-03-10' && r.bannerCode === '10202');
const shaLuValid = r0901_new && r0901_new.heroesKr.includes('사륜') && r0310_dual && r0310_dual.heroesKr.includes('사륜');
check('15. 沙律 포함 배너(12/9, 3/10) heroesKr "사륜" 매핑 확인', !!shaLuValid);

const r0113_triple = krData.records.find(r => r.krDisplayDate === '2027-01-13' && r.bannerCode === '8703');
const r0310_triple = krData.records.find(r => r.krDisplayDate === '2027-03-10' && r.bannerCode === '8403');
const seraphinaValid = r0113_triple && r0113_triple.heroesKr.includes('세라피나') && r0310_triple && r0310_triple.heroesKr.includes('세라피나');
check('16. 塞拉菲娜 포함 배너(1/13, 3/10) heroesKr "세라피나" 매핑 확인', !!seraphinaValid);

// 17~31. 한국어 표기 검증 (잔존 금지 단어 0건)
const bannedKeywords = [
  '샤르', '세리피나', '이미아', '샤프린', '생겨', '호프먼', '에쉬엘', '레이카', '레이미', '은(백사)', '랑그릿사 1~5', '파사르', '사리크', '알베르타', '홍바바'
];
bannedKeywords.forEach((kw, idx) => {
  const count = rawKrText.split(kw).length - 1;
  check(`${17 + idx}. "${kw}" 잔존 0건`, count === 0, `Count: ${count}`);
});

// 32. 존재하지 않는 이미지 파일 참조 0건
let nonExistentImageCount = 0;
krData.records.forEach(r => {
  if (r.displayImageFile !== null) {
    const dir = r.displayImageType === 'Banner' ? bannerFiles : noticeFiles;
    if (!dir.has(r.displayImageFile)) {
      nonExistentImageCount++;
      console.log(`  [Missing File] ${r.krDisplayDate} #${r.displayOrder}: ${r.displayImageType}/${r.displayImageFile}`);
    }
  }
});
check('32. 존재하지 않는 이미지 파일 참조 0건', nonExistentImageCount === 0, `Missing files: ${nonExistentImageCount}`);

// 33. 번호 연속성으로 새 bannerCode를 추정한 항목 0건
let guessedBannerCodeCount = 0;
krData.records.forEach(r => {
  if (r.matchBasis && r.matchBasis.includes('guessed')) guessedBannerCodeCount++;
});
check('33. 번호 연속성 추정 bannerCode 0건', guessedBannerCodeCount === 0);

// Summary Statistics
let verifiedCount = 0;
let probableCount = 0;
let unresolvedCount = 0;
let manualCount = 0;
let matchedCount = 0;
let manualReplacementCount = 0;
let nullImageCount = 0;

krData.records.forEach(r => {
  if (r.matchStatus === 'verified') verifiedCount++;
  if (r.matchStatus === 'probable') probableCount++;
  if (r.matchStatus === 'unresolved') unresolvedCount++;
  if (r.matchStatus === 'manual') manualCount++;

  if (r.displayImageStatus === 'matched') matchedCount++;
  if (r.displayImageStatus === 'manual-replacement') manualReplacementCount++;
  if (r.displayImageFile === null) nullImageCount++;
});

console.log('\n==================================================');
console.log('                 FINAL STATISTICS                 ');
console.log('==================================================');
console.log(`- 전체 recordCount: ${krData.records.length}`);
console.log(`- 시작일(startDate): ${krData.startDate}`);
console.log(`- verified 수: ${verifiedCount}`);
console.log(`- probable 수: ${probableCount}`);
console.log(`- unresolved 수: ${unresolvedCount}`);
console.log(`- manual 수: ${manualCount}`);
console.log(`- 이미지 matched 수: ${matchedCount}`);
console.log(`- 이미지 manual-replacement 수: ${manualReplacementCount}`);
console.log(`- 이미지 null 수: ${nullImageCount}`);
console.log(`- 존재하지 않는 파일 참조 수: ${nonExistentImageCount}`);
console.log('==================================================');
console.log(` OVERALL VALIDATION: ${allPassed ? 'PASS (모든 검증 조건 100% 만족)' : 'FAIL'}`);
console.log('==================================================');

if (!allPassed) process.exit(1);
