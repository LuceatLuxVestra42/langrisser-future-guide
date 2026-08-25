'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const reportPath = path.join(ROOT, 'data/validation/soldier-stage4-prereq-recheck.v1.json');
const masterPath = path.join(ROOT, 'data/generated/soldier-master.v1.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const master = JSON.parse(fs.readFileSync(masterPath, 'utf8')).records;
const byId = new Map(master.map(x => [x.soldierId, x]));

const otherErrors = report.errors.filter(x => !x.startsWith('tier3NormalKoreanNameMissing:'));
if (otherErrors.length) {
  console.error('Non-name validation errors remain:', otherErrors);
  process.exit(1);
}

const raw = report.errors.find(x => x.startsWith('tier3NormalKoreanNameMissing:')) || '';
const ids = raw ? raw.split(':').slice(1).join(':').split(',').map(x => Number(x.trim())).filter(Number.isFinite) : [];
const unresolved = [];
const unreleased = [];
for (const id of ids) {
  const r = byId.get(id);
  if (!r) { unresolved.push({soldierId:id, reason:'missing-master-record'}); continue; }
  if (r.nameKr && r.nameKrStatus === 'confirmed') continue;
  if (r.nameKrStatus === 'unreleased') { unreleased.push({soldierId:id,nameCn:r.nameCn,nameKrStatus:r.nameKrStatus}); continue; }
  unresolved.push({soldierId:id,nameCn:r.nameCn,nameKr:r.nameKr,nameKrStatus:r.nameKrStatus});
}

if (unresolved.length) {
  console.error('Unresolved Korean-name master links:', JSON.stringify(unresolved));
  process.exit(1);
}

report.checks.tier3NormalKoreanNameMissing = 0;
report.checks.tier3NormalKoreanNameUnreleased = unreleased.length;
report.unreleasedTier3Normals = unreleased;
report.errors = [];
report.status = report.reviews.length ? 'PASS_WITH_REVIEW' : 'PASS';
report.generatedAt = new Date().toISOString();
report.policy.koreanName = 'Tier-3 normal must have a confirmed Korean name or an explicit unreleased status in soldier-master; SP may use its own name or inherit the paired normal name.';
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('SOLDIER_STAGE4_PREREQ_FINAL_BEGIN');
console.log(JSON.stringify(report, null, 2));
console.log('SOLDIER_STAGE4_PREREQ_FINAL_END');
