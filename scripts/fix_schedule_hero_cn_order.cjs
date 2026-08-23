const fs = require('fs');
const path = require('path');

const schedulePath = path.resolve(__dirname, '../data/kr-banner-schedule.v1.json');
const masterPath = path.resolve(__dirname, '../data/hero-name-master.v1.json');

const schedule = JSON.parse(fs.readFileSync(schedulePath, 'utf8'));
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
const masterRecords = Array.isArray(master) ? master : master.records;

if (!Array.isArray(masterRecords)) {
  throw new Error('hero-name-master.v1.json: records 배열을 찾을 수 없습니다.');
}

// 한국명 -> 가능한 중국명 목록
// 동일 한국명이 여러 중국명에 대응할 가능성까지 안전하게 처리한다.
const cnCandidatesByKr = new Map();
for (const h of masterRecords) {
  if (!cnCandidatesByKr.has(h.nameKr)) cnCandidatesByKr.set(h.nameKr, []);
  cnCandidatesByKr.get(h.nameKr).push(h.nameCn);
}

let changedRecords = 0;
let changedSlots = 0;
const errors = [];

for (const r of schedule.records) {
  if (!Array.isArray(r.heroesCn) || r.heroesCn.length === 0) continue;
  if (!Array.isArray(r.heroesKr)) {
    errors.push(`${r.recordKey}: heroesKr 배열이 없음`);
    continue;
  }
  if (r.heroesCn.length !== r.heroesKr.length) {
    errors.push(`${r.recordKey}: heroesCn(${r.heroesCn.length}) / heroesKr(${r.heroesKr.length}) 길이 불일치`);
    continue;
  }

  const originalCn = [...r.heroesCn];
  const availableCn = new Set(originalCn);
  const reorderedCn = [];
  let recordError = false;

  for (const kr of r.heroesKr) {
    const candidates = cnCandidatesByKr.get(kr) || [];
    const matchesInRecord = candidates.filter(cn => availableCn.has(cn));

    if (matchesInRecord.length !== 1) {
      errors.push(
        `${r.recordKey}: "${kr}"에 대응하는 중국명을 현재 heroesCn에서 1개로 확정할 수 없음 ` +
        `(후보=${JSON.stringify(candidates)}, 현재=${JSON.stringify(originalCn)})`
      );
      recordError = true;
      break;
    }

    const cn = matchesInRecord[0];
    reorderedCn.push(cn);
    availableCn.delete(cn);
  }

  if (recordError) continue;

  const changed = originalCn.some((cn, i) => cn !== reorderedCn[i]);
  if (!changed) continue;

  changedRecords++;
  for (let i = 0; i < originalCn.length; i++) {
    if (originalCn[i] !== reorderedCn[i]) changedSlots++;
  }

  // 한국명 표시 순서는 유지하고, 중국명 배열만 그 순서에 맞춘다.
  r.heroesCn = reorderedCn;

  // matchBasis에 "(중국명 -> 한국명)" 구조가 있으면 현재 순서로 갱신한다.
  if (typeof r.matchBasis === 'string' && r.matchBasis.includes('->')) {
    const cnJoined = reorderedCn.join('/');
    const krJoined = r.heroesKr.join('/');
    r.matchBasis = r.matchBasis.replace(
      /\(([^()]*)\s*->\s*([^()]*)\)/,
      `(${cnJoined} -> ${krJoined})`
    );
  }
}

if (errors.length > 0) {
  console.error('==================================================');
  console.error(' HERO CN ORDER FIX: ABORTED');
  console.error('==================================================');
  errors.forEach(e => console.error(`- ${e}`));
  console.error('파일은 저장하지 않았습니다.');
  process.exit(1);
}

fs.writeFileSync(schedulePath, JSON.stringify(schedule, null, 2) + '\n', 'utf8');

console.log('==================================================');
console.log(' HERO CN ORDER FIX: COMPLETE');
console.log('==================================================');
console.log(`- 수정된 레코드 수: ${changedRecords}`);
console.log(`- 위치가 바뀐 CN 슬롯 수: ${changedSlots}`);
console.log('- heroesKr 순서 변경: 0');
console.log('- 오류/모호한 매핑: 0');
console.log('==================================================');
console.log('다음 명령으로 검증하세요:');
console.log('node scripts/validate_hero_names.cjs');
