'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GENERATED = path.join(ROOT, 'data', 'generated', 'hero-page-stage5-6-stat-composition.v1.json');
const STAGE4 = path.join(ROOT, 'data', 'generated', 'hero-basic-combat.v1.json');
const STAGE54 = path.join(ROOT, 'data', 'generated', 'hero-page-stage5-4-sp.v1.json');
const OUTPUT = path.join(ROOT, 'data', 'validation', 'hero-page-stage5-6-stat-composition.v1.json');
const STAT_KEYS = ['hp', 'at', 'magic', 'df', 'magicDf', 'dex'];

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
function sameValues(actual, expected) {
  return STAT_KEYS.every((key) => actual?.[key] === expected[key]);
}
function statValuesValid(values) {
  return STAT_KEYS.every((key) => Number.isInteger(values?.[key]) && values[key] >= 0);
}

const artifact = read(GENERATED);
const stage4 = read(STAGE4);
const stage54 = read(STAGE54);
const errors = [];

if (artifact.stage !== 'hero-page-5-6-stat-composition') errors.push(`stage=${artifact.stage}`);
if (artifact.status !== 'CANDIDATE') errors.push(`status=${artifact.status}`);
if (artifact.authority?.owner !== 'hero-canonical') errors.push(`owner=${artifact.authority?.owner}`);
if (artifact.authority?.stage4Recomputed !== false) errors.push('Stage4 recomputation boundary violated');
if (artifact.authority?.relationReDerivedByName !== false) errors.push('name JOIN boundary violated');
if (artifact.authority?.idArithmeticUsed !== false) errors.push('ID arithmetic boundary violated');
if (artifact.authority?.rawRuntimeDependencyIntroduced !== false) errors.push('raw runtime dependency boundary violated');

const records = artifact.records || [];
const stage4Records = stage4.records || [];
const stage54Records = stage54.records || [];
if (records.length !== 267) errors.push(`record count=${records.length}`);
if (new Set(records.map((r) => r.heroId)).size !== records.length) errors.push('duplicate heroId');
if (artifact.summary?.canonicalHeroCount !== 267) errors.push(`summary canonicalHeroCount=${artifact.summary?.canonicalHeroCount}`);

const stage4By = new Map(stage4Records.map((r) => [Number(r.heroId), r]));
const stage54By = new Map(stage54Records.map((r) => [Number(r.heroId), r]));
let released = 0;
for (const record of records) {
  const heroId = Number(record.heroId);
  const source4 = stage4By.get(heroId);
  const source54 = stage54By.get(heroId);
  if (!source4 || !source54) { errors.push(`Hero ${heroId}: missing predecessor`); continue; }
  const expectedNormal = source4.jobTree?.connections?.length || 0;
  if ((record.normalJobs || []).length !== expectedNormal) errors.push(`Hero ${heroId}: normal job count ${(record.normalJobs || []).length}/${expectedNormal}`);
  for (const job of record.normalJobs || []) if (!statValuesValid(job.values)) errors.push(`Hero ${heroId}: invalid normal job ${job.jobId} values`);
  if (record.centralBond?.rate !== 0.05) errors.push(`Hero ${heroId}: central rate=${record.centralBond?.rate}`);
  if (!STAT_KEYS.every((key) => Number.isFinite(record.normalBond?.rates?.[key]))) errors.push(`Hero ${heroId}: incomplete normal bond rates`);
  const sourceReleased = source54.sp?.status === 'RELEASED';
  if (sourceReleased) released += 1;
  if ((record.sp?.status === 'RELEASED') !== sourceReleased) errors.push(`Hero ${heroId}: SP release parity mismatch`);
  if (record.sp?.status === 'RELEASED' && !statValuesValid(record.sp.values)) errors.push(`Hero ${heroId}: invalid SP values`);
}
if (released !== 25) errors.push(`SP released=${released}`);
if (artifact.summary?.spReleasedCount !== 25) errors.push(`summary spReleasedCount=${artifact.summary?.spReleasedCount}`);

const leon = records.find((r) => Number(r.heroId) === 6);
const expectedLeon = { hp: 4929, at: 623, magic: 233, df: 300, magicDf: 280, dex: 130 };
if (!leon) errors.push('Leon missing');
else {
  if (leon.sp?.status !== 'RELEASED') errors.push(`Leon SP status=${leon.sp?.status}`);
  if (leon.sp?.jobId !== 377) errors.push(`Leon SP jobId=${leon.sp?.jobId}`);
  if (!sameValues(leon.sp?.values, expectedLeon)) errors.push(`Leon SP values=${JSON.stringify(leon.sp?.values)} expected=${JSON.stringify(expectedLeon)}`);
  for (const key of STAT_KEYS) if (leon.normalBond?.rates?.[key] !== 0.25) errors.push(`Leon normalBond ${key}=${leon.normalBond?.rates?.[key]}`);
  if (leon.centralBond?.flat?.hp !== 750 || leon.centralBond?.flat?.df !== 30 || leon.centralBond?.flat?.magicDf !== 40) {
    errors.push(`Leon central flat=${JSON.stringify(leon.centralBond?.flat)}`);
  }
  if (leon.sp?.spBonus?.rates?.hp !== 0.05 || leon.sp?.spBonus?.rates?.df !== 0.05) errors.push(`Leon SP bonus=${JSON.stringify(leon.sp?.spBonus?.rates)}`);
}

const validation = {
  version: 1,
  stage: 'hero-page-5-6-stat-composition',
  status: errors.length ? 'FAIL' : 'PASS',
  completion: errors.length ? 'BLOCKED' : 'COMPLETE',
  owner: 'hero-canonical',
  checks: {
    canonicalHeroCount: { expected: 267, actual: records.length, pass: records.length === 267 },
    spReleasedCount: { expected: 25, actual: released, pass: released === 25 },
    leonSpJob377ExactFinal: { expected: expectedLeon, actual: leon?.sp?.values ?? null, pass: Boolean(leon && leon.sp?.jobId === 377 && sameValues(leon.sp?.values, expectedLeon)) },
    predecessorParity: { stage4: stage4.status, stage54: stage54.status, pass: stage4Records.length === 267 && stage54Records.length === 267 },
    boundary: { stage4Recomputed: artifact.authority?.stage4Recomputed, relationReDerivedByName: artifact.authority?.relationReDerivedByName, idArithmeticUsed: artifact.authority?.idArithmeticUsed, rawRuntimeDependencyIntroduced: artifact.authority?.rawRuntimeDependencyIntroduced, pass: artifact.authority?.stage4Recomputed === false && artifact.authority?.relationReDerivedByName === false && artifact.authority?.idArithmeticUsed === false && artifact.authority?.rawRuntimeDependencyIntroduced === false },
  },
  errors,
  decision: errors.length ? 'Do not promote Stage 5-6 stat composition.' : 'Stage 5-6 stat composition is complete and may be promoted as the Hero production stat-composition predecessor for Stage 6 materialization.',
};
write(OUTPUT, validation);
console.log(JSON.stringify(validation, null, 2));
if (errors.length) process.exitCode = 1;
