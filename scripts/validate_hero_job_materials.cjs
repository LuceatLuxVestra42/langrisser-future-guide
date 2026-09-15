'use strict';

const fs = require('fs');
const path = require('path');
const { loadArray } = require('./lib/configdata-direct.cjs');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const UPSTREAM = P('data/generated/hero-job-links.v1.json');
const OUTPUT = P('data/generated/hero-job-materials.v1.json');
const SUMMARY = P('data/validation/hero-job-materials-summary.v1.json');

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function indexUnique(rows, label, errors) {
  const map = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row?.ID) || row.ID <= 0) continue;
    if (map.has(row.ID)) errors.push(`${label} duplicate ID=${row.ID}`);
    else map.set(row.ID, row);
  }
  return map;
}
function snapshot(row) {
  return {
    jobMaterialId: row.ID,
    nameCn: row.Name ?? '',
    descriptionCn: row.Desc ?? '',
    rank: Number.isInteger(row.Rank) ? row.Rank : null,
    icon: row.Icon ?? null,
  };
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function main() {
  const errors = [];
  const upstream = read(UPSTREAM);
  const output = read(OUTPUT);
  const summary = read(SUMMARY);
  const levels = loadArray('ConfigDataJobLevelInfo');
  const masters = loadArray('ConfigDataJobMaterialInfo');
  const levelById = indexUnique(levels, 'JobLevelInfo', errors);
  const masterById = indexUnique(masters, 'JobMaterialInfo', errors);

  if (upstream.status !== 'PASS') errors.push(`upstream status=${upstream.status}`);
  if (output.status !== 'PASS') errors.push(`output status=${output.status}`);
  if (summary.status !== 'PASS') errors.push(`summary status=${summary.status}`);

  const expectedHeroes = upstream.records || [];
  const actualHeroes = output.records || [];
  if (actualHeroes.length !== expectedHeroes.length) errors.push(`hero count=${actualHeroes.length}, expected=${expectedHeroes.length}`);
  const actualByHero = new Map();
  for (const hero of actualHeroes) {
    if (!Number.isInteger(hero?.heroId)) { errors.push('generated hero with invalid heroId'); continue; }
    if (actualByHero.has(hero.heroId)) errors.push(`generated duplicate heroId=${hero.heroId}`);
    else actualByHero.set(hero.heroId, hero);
  }

  let connectionCount = 0;
  let jobLevelCount = 0;
  let materialEntryCount = 0;
  const usedMaterialIds = new Set();

  for (const expectedHero of expectedHeroes) {
    const actualHero = actualByHero.get(expectedHero.heroId);
    if (!actualHero) { errors.push(`missing heroId=${expectedHero.heroId}`); continue; }
    if ((actualHero.connections || []).length !== (expectedHero.connections || []).length) {
      errors.push(`heroId ${expectedHero.heroId}: connection count mismatch`);
      continue;
    }
    for (let ci = 0; ci < expectedHero.connections.length; ci += 1) {
      connectionCount += 1;
      const expectedConnection = expectedHero.connections[ci];
      const actualConnection = actualHero.connections[ci];
      if (actualConnection?.jobConnectionId !== expectedConnection.jobConnectionId) {
        errors.push(`heroId ${expectedHero.heroId}: connection[${ci}] identity/order mismatch`);
        continue;
      }
      const expectedLevelIds = expectedConnection.jobLevelIds || [];
      const actualLevels = actualConnection.levels || [];
      if (actualLevels.length !== expectedLevelIds.length) {
        errors.push(`JobConnection ${expectedConnection.jobConnectionId}: level count mismatch`);
        continue;
      }
      for (let li = 0; li < expectedLevelIds.length; li += 1) {
        jobLevelCount += 1;
        const jobLevelId = expectedLevelIds[li];
        const actualLevel = actualLevels[li];
        if (actualLevel?.jobLevelId !== jobLevelId) {
          errors.push(`JobConnection ${expectedConnection.jobConnectionId}: level[${li}] identity/order mismatch`);
          continue;
        }
        const sourceLevel = levelById.get(jobLevelId);
        if (!sourceLevel) { errors.push(`missing source JobLevel ${jobLevelId}`); continue; }
        const expectedMaterials = sourceLevel.Materials == null ? [] : sourceLevel.Materials;
        if (!Array.isArray(expectedMaterials)) { errors.push(`JobLevel ${jobLevelId}: source Materials not array`); continue; }
        const actualMaterials = actualLevel.materials || [];
        if (actualMaterials.length !== expectedMaterials.length) {
          errors.push(`JobLevel ${jobLevelId}: material count mismatch`);
          continue;
        }
        for (let mi = 0; mi < expectedMaterials.length; mi += 1) {
          materialEntryCount += 1;
          const expected = expectedMaterials[mi];
          const actual = actualMaterials[mi];
          if (!Number.isInteger(expected?.GoodsType) || expected.GoodsType !== 5) {
            errors.push(`JobLevel ${jobLevelId} Materials[${mi}]: unsupported source GoodsType=${String(expected?.GoodsType)}`);
            continue;
          }
          if (!Number.isInteger(expected?.Id) || expected.Id <= 0 || !Number.isInteger(expected?.Count) || expected.Count <= 0) {
            errors.push(`JobLevel ${jobLevelId} Materials[${mi}]: malformed source Goods`);
            continue;
          }
          const master = masterById.get(expected.Id);
          if (!master) { errors.push(`JobLevel ${jobLevelId}: missing JobMaterial ${expected.Id}`); continue; }
          usedMaterialIds.add(expected.Id);
          const expectedGenerated = {
            goodsType: expected.GoodsType,
            id: expected.Id,
            count: expected.Count,
            jobMaterial: snapshot(master),
          };
          if (!same(actual, expectedGenerated)) errors.push(`JobLevel ${jobLevelId} Materials[${mi}]: generated payload mismatch`);
        }
      }
    }
  }

  const expectedSummary = {
    heroCount: expectedHeroes.length,
    connectionCount,
    jobLevelCount,
    materialEntryCount,
    distinctJobMaterialCount: usedMaterialIds.size,
    jobLevelInfo: levels.length,
    jobMaterialInfo: masters.length,
  };
  if (summary.heroCount !== expectedSummary.heroCount) errors.push(`summary.heroCount=${summary.heroCount}, expected=${expectedSummary.heroCount}`);
  if (summary.connectionCount !== expectedSummary.connectionCount) errors.push(`summary.connectionCount=${summary.connectionCount}, expected=${expectedSummary.connectionCount}`);
  if (summary.jobLevelCount !== expectedSummary.jobLevelCount) errors.push(`summary.jobLevelCount=${summary.jobLevelCount}, expected=${expectedSummary.jobLevelCount}`);
  if (summary.materialEntryCount !== expectedSummary.materialEntryCount) errors.push(`summary.materialEntryCount=${summary.materialEntryCount}, expected=${expectedSummary.materialEntryCount}`);
  if (summary.distinctJobMaterialCount !== expectedSummary.distinctJobMaterialCount) errors.push(`summary.distinctJobMaterialCount=${summary.distinctJobMaterialCount}, expected=${expectedSummary.distinctJobMaterialCount}`);
  if (summary.sourceRecordCounts?.jobLevelInfo !== levels.length) errors.push('summary source JobLevel count mismatch');
  if (summary.sourceRecordCounts?.jobMaterialInfo !== masters.length) errors.push('summary source JobMaterial count mismatch');
  if ((summary.hardErrors || []).length !== 0) errors.push(`summary hardErrors=${summary.hardErrors.length}`);

  console.log(`HERO JOB MATERIAL VALIDATION: ${errors.length ? 'FAIL' : 'PASS'}`);
  console.log(`heroes=${expectedHeroes.length} connections=${connectionCount} jobLevels=${jobLevelCount} materialEntries=${materialEntryCount} distinctJobMaterials=${usedMaterialIds.size} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
