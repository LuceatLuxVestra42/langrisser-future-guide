const fs = require('fs');
const path = require('path');

const bannerJsonPath = 'c:/Users/whddn/Downloads/banner-data.v1.json';
const bannerDir = 'c:/Users/whddn/Documents/langrisser-future-guide/public/images/banners/Banner';

const data = JSON.parse(fs.readFileSync(bannerJsonPath, 'utf8'));
const filesInDir = new Set(fs.readdirSync(bannerDir));

// Count BannerCode occurrences to identify reused codes
const codeCounts = {};
data.banners.forEach(b => {
  codeCounts[b.bannerCode] = (codeCounts[b.bannerCode] || 0) + 1;
});

// Sort banners by bannerCode ascending (numeric), then cardPoolId
const sortedBanners = [...data.banners].sort((a, b) => {
  const codeA = Number(a.bannerCode);
  const codeB = Number(b.bannerCode);
  if (codeA !== codeB) return codeA - codeB;
  return a.cardPoolId - b.cardPoolId;
});

const usedFileNames = new Set();

// Headers for main verification CSV
const mainHeaders = [
  'bannerCode',
  'cardPoolId',
  'nameCn',
  'type',
  'visualType',
  'bannerImage',
  'expectedFileName',
  'fileExists',
  'status',
  'note'
];

// Manual replacement banner codes (Korean edition manual replacement, intentionally not extracted from CN)
const manualReplacementCodes = new Set(['7404', '7804', '7902']);

const mainRows = sortedBanners.map(b => {
  const isReused = codeCounts[b.bannerCode] > 1;
  const isPrefab = b.visualType === 'prefab' || (b.bannerImage === null && b.prefabSource !== null);
  const isManualReplacement = manualReplacementCodes.has(b.bannerCode);

  const expectedFileName = b.bannerImage 
    ? path.basename(b.bannerImage) 
    : `Banner_${b.bannerCode}.webp`;

  const fileExists = filesInDir.has(expectedFileName);

  let status = '';
  let note = '';

  if (isReused) {
    status = 'reused';
    note = `동일 BannerCode(${b.bannerCode}) 배너 이미지 정상 재사용 (총 ${codeCounts[b.bannerCode]}개 CardPool에서 공유)`;
    if (b.bannerImage && fileExists) {
      usedFileNames.add(path.basename(b.bannerImage));
    }
  } else if (isManualReplacement) {
    status = 'manual-replacement';
    note = '한글판 이미지로 수동 대체 예정 / 중국판 이미지 의도적 미추출 (소원소환 배너)';
  } else if (isPrefab) {
    const staticFileName = `Banner_${b.bannerCode}.webp`;
    if (filesInDir.has(staticFileName)) {
      status = 'prefab+static';
      note = `프리팹 기반 신규 배너이나 정적 배너 이미지(${staticFileName})가 폴더에 존재하여 사용 리소스로 처리`;
      usedFileNames.add(staticFileName);
    } else {
      status = 'prefab';
      note = '프리팹 기반 신규 배너 (bannerImage=null, prefabSource 사용)';
    }
  } else if (b.bannerImage && fileExists) {
    status = 'matched';
    note = '이미지 경로 및 실제 파일 일치';
    usedFileNames.add(path.basename(b.bannerImage));
  } else {
    status = 'missing';
    note = `실제 원인불명 이미지 누락 (${expectedFileName})`;
  }

  return [
    b.bannerCode,
    b.cardPoolId,
    b.nameCn,
    b.type,
    b.visualType,
    b.bannerImage ?? '',
    expectedFileName,
    fileExists ? 'true' : 'false',
    status,
    note
  ];
});

// CSV helper
function toCSV(headers, rows) {
  const escapeCell = (c) => {
    const s = String(c ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map(r => r.map(escapeCell).join(','));
  return [headerLine, ...rowLines].join('\n');
}

// 1. Save Main Verification CSV
const mainCsvContent = '\uFEFF' + toCSV(mainHeaders, mainRows);
const mainCsvPath = 'c:/Users/whddn/Downloads/banner-verification-result.csv';
fs.writeFileSync(mainCsvPath, mainCsvContent, 'utf8');

// 2. Find and Categorize Orphan Files (legacy / generic / special / other)
const allFiles = Array.from(filesInDir).sort((a, b) => {
  const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
  if (numA !== numB) return numA - numB;
  return a.localeCompare(b);
});

const orphanFiles = allFiles.filter(f => !usedFileNames.has(f));

const orphanHeaders = ['fileName', 'category', 'description', 'status'];
const orphanRows = orphanFiles.map(f => {
  let category = 'other';
  let description = '';

  const numMatch = f.match(/^Banner_(\d+)\.webp$/i);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num < 3000) {
      category = 'legacy';
      description = `3000 미만 초기/구버전 배너 리소스 (BannerCode: ${num})`;
    } else {
      category = 'other';
      description = `3000 이상 미참조 리소스 (CardPoolInfo scope 외 또는 미개방 배너)`;
    }
  } else if (/^Banner_(Wish|Wish\d+|New\d+)\.webp$/i.test(f)) {
    category = 'generic';
    description = '공용 기본 소환/신규 배너 템플릿 리소스';
  } else if (/^Banner_(OptionalWish|OptionalWish\d+|ReturnWish|ReturnWish\d+|EquipWish|EquipWish\d+)\.webp$/i.test(f)) {
    category = 'special';
    description = '소원/복귀/장비소환 특수 배너 템플릿 리소스';
  } else {
    category = 'other';
    description = '기타 보존 리소스';
  }

  return [
    f,
    category,
    description,
    'preserved'
  ];
});

const orphanCsvContent = '\uFEFF' + toCSV(orphanHeaders, orphanRows);
const orphanCsvPath = 'c:/Users/whddn/Downloads/banner-orphan-files.csv';
fs.writeFileSync(orphanCsvPath, orphanCsvContent, 'utf8');

// Summary statistics
const matchedCount = mainRows.filter(r => r[8] === 'matched').length;
const prefabCount = mainRows.filter(r => r[8] === 'prefab').length;
const prefabStaticCount = mainRows.filter(r => r[8] === 'prefab+static').length;
const reusedCount = mainRows.filter(r => r[8] === 'reused').length;
const manualReplacementCount = mainRows.filter(r => r[8] === 'manual-replacement').length;
const missingCount = mainRows.filter(r => r[8] === 'missing').length;

console.log('========================================');
console.log('       BANNER VERIFICATION SUMMARY      ');
console.log('========================================');
console.log(`총 JSON 레코드 수: ${sortedBanners.length}`);
console.log(`- matched: ${matchedCount}`);
console.log(`- prefab: ${prefabCount}`);
console.log(`- prefab+static: ${prefabStaticCount}`);
console.log(`- reused: ${reusedCount}`);
console.log(`- manual-replacement: ${manualReplacementCount}`);
console.log(`- 실제 원인불명 missing: ${missingCount}`);
console.log(`- orphan: ${orphanFiles.length}`);
console.log('========================================');

// Orphan category breakdown
const orphanCategories = {};
orphanRows.forEach(r => {
  orphanCategories[r[1]] = (orphanCategories[r[1]] || 0) + 1;
});
console.log('Orphan category breakdown:', orphanCategories);

if (missingCount > 0) {
  console.log('\n[WARNING] Unexpected missing banners found:');
  mainRows.filter(r => r[8] === 'missing').forEach(r => {
    console.log(`BannerCode: ${r[0]}, CardPoolId: ${r[1]}, Name: ${r[2]}, ExpectedFile: ${r[6]}`);
  });
}
