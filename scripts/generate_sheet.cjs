const fs = require('fs');
const path = require('path');

const inputPath = 'c:/Users/whddn/Downloads/banner-data.v1.json';
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// 1. Sort by bannerCode ascending (numeric), then cardPoolId ascending for deterministic order
const sortedBanners = [...data.banners].sort((a, b) => {
  const codeA = Number(a.bannerCode);
  const codeB = Number(b.bannerCode);
  if (codeA !== codeB) return codeA - codeB;
  return a.cardPoolId - b.cardPoolId;
});

console.log('Original JSON banner count:', data.banners.length);
console.log('Processed row count:', sortedBanners.length);

// Headers matching all banner fields + split pickupHeroes (Pickup1~Pickup3) + selectableHeroes as joined string
const headers = [
  'recordKey',
  'bannerNo',
  'bannerCode',
  'patchCode',
  'slotCode',
  'cardPoolId',
  'nameCn',
  'type',
  'isNew',
  'visualType',
  'pickupCount',
  'Pickup1',
  'Pickup2',
  'Pickup3',
  'selectableCount',
  'selectableHeroes',
  'bannerImage',
  'adsImageSource',
  'prefabSource',
  'noticeImage',
  'noticeImageCandidate',
  'noticeVerified'
];

const rows = sortedBanners.map(b => {
  const p1 = b.pickupHeroes && b.pickupHeroes[0] ? b.pickupHeroes[0].nameCn : '';
  const p2 = b.pickupHeroes && b.pickupHeroes[1] ? b.pickupHeroes[1].nameCn : '';
  const p3 = b.pickupHeroes && b.pickupHeroes[2] ? b.pickupHeroes[2].nameCn : '';
  const selectable = b.selectableHeroes && b.selectableHeroes.length > 0 
    ? b.selectableHeroes.map(h => h.nameCn).join(', ') 
    : '';

  return [
    b.recordKey ?? '',
    b.bannerNo ?? '',
    b.bannerCode ?? '',
    b.patchCode ?? '',
    b.slotCode ?? '',
    b.cardPoolId ?? '',
    b.nameCn ?? '',
    b.type ?? '',
    b.isNew !== undefined ? String(b.isNew) : '',
    b.visualType ?? '',
    b.pickupCount ?? 0,
    p1,
    p2,
    p3,
    b.selectableCount ?? 0,
    selectable,
    b.bannerImage ?? '',
    b.adsImageSource ?? '',
    b.prefabSource ?? '',
    b.noticeImage ?? '',
    b.noticeImageCandidate ?? '',
    b.noticeVerified !== undefined ? String(b.noticeVerified) : ''
  ];
});

// Verification check on specific exceptions
const b3902 = sortedBanners.filter(b => b.bannerCode === '3902');
console.log('3902 count:', b3902.length, b3902.map(b => b.nameCn));

const b9616 = sortedBanners.filter(b => b.bannerCode === '9616');
console.log('9616 count:', b9616.length, b9616.map(b => b.nameCn));

const b9404 = sortedBanners.filter(b => b.bannerCode === '9404');
console.log('9404 count:', b9404.length, b9404.map(b => ({ cardPoolId: b.cardPoolId, nameCn: b.nameCn, selectableCount: b.selectableCount })));

// Check noticeVerified
const noticeVerifiedCount = sortedBanners.filter(b => b.noticeVerified === true).length;
console.log('noticeVerified === true count:', noticeVerifiedCount);

// Generate TSV
function toTSV(headers, rows) {
  const escapeCell = (c) => String(c).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  const headerLine = headers.map(escapeCell).join('\t');
  const rowLines = rows.map(r => r.map(escapeCell).join('\t'));
  return [headerLine, ...rowLines].join('\n');
}

// Generate CSV
function toCSV(headers, rows) {
  const escapeCell = (c) => {
    const s = String(c);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map(r => r.map(escapeCell).join(','));
  return [headerLine, ...rowLines].join('\n');
}

const tsvContent = toTSV(headers, rows);
const csvContent = toCSV(headers, rows);

const tsvPath = 'c:/Users/whddn/Downloads/banner-verification-sheet.tsv';
const csvPath = 'c:/Users/whddn/Downloads/banner-verification-sheet.csv';

fs.writeFileSync(tsvPath, tsvContent, 'utf8');
fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf8');

console.log('Successfully written:');
console.log('TSV:', tsvPath, `(${fs.statSync(tsvPath).size} bytes)`);
console.log('CSV:', csvPath, `(${fs.statSync(csvPath).size} bytes)`);
console.log('Rows count verification: Total lines in CSV =', csvContent.split('\n').length);
