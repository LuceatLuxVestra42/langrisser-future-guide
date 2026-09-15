'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = (...parts) => path.join(ROOT, ...parts);
const ARTIFACT = P('data/generated/hero-job-materials.v1.json');
const SUMMARY = P('data/validation/hero-job-materials-summary.v1.json');
const POLICY = P('data/generated/hero-job-material-presentation-policy.v1.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const artifact = readJson(ARTIFACT);
  const summary = readJson(SUMMARY);
  const policy = readJson(POLICY);
  const errors = [];

  if (artifact?.status !== 'PASS') errors.push(`artifact status=${artifact?.status ?? 'missing'}`);
  if (summary?.status !== 'PASS') errors.push(`summary status=${summary?.status ?? 'missing'}`);
  if (policy?.status !== 'PASS') errors.push(`policy status=${policy?.status ?? 'missing'}`);

  const sentinel = policy?.terminalSentinel || {};
  if (sentinel.goodsType !== 5 || sentinel.jobMaterialId !== 40 || sentinel.count !== 999) {
    errors.push('policy terminal sentinel identity must be GoodsType=5, JobMaterial ID=40, Count=999');
  }
  if (sentinel.terminalRelation !== 'FINAL_PRESERVED_SOURCE_LEVEL') {
    errors.push(`unsupported terminalRelation=${String(sentinel.terminalRelation)}`);
  }
  if (sentinel.requireSoleMaterialInTerminalLevel !== true) {
    errors.push('policy must require the terminal sentinel to be the sole terminal-level material');
  }
  if (sentinel.presentationEligible !== false) {
    errors.push('policy terminal sentinel must be presentationEligible=false');
  }

  let heroCount = 0;
  let connectionCount = 0;
  let materialEntryCount = 0;
  let sentinelCount = 0;
  let count999Count = 0;

  for (const hero of artifact.records || []) {
    heroCount += 1;
    for (const connection of hero.connections || []) {
      connectionCount += 1;
      const levels = connection.levels || [];
      if (levels.length === 0) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: no levels`);
        continue;
      }

      const candidates = [];
      for (let li = 0; li < levels.length; li += 1) {
        const materials = levels[li].materials || [];
        for (let mi = 0; mi < materials.length; mi += 1) {
          const material = materials[mi];
          materialEntryCount += 1;
          if (material?.count === 999) count999Count += 1;
          if (
            material?.goodsType === sentinel.goodsType &&
            material?.id === sentinel.jobMaterialId &&
            material?.count === sentinel.count
          ) {
            candidates.push({ li, mi, level: levels[li], material });
          }
        }
      }

      if (candidates.length !== 1) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: sentinel candidates=${candidates.length}, expected=1`);
        continue;
      }

      sentinelCount += 1;
      const candidate = candidates[0];
      const terminalIndex = levels.length - 1;
      if (candidate.li !== terminalIndex) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: sentinel JobLevel ${candidate.level.jobLevelId} is not final preserved source level`);
      }
      if ((candidate.level.materials || []).length !== 1) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: terminal JobLevel ${candidate.level.jobLevelId} materials=${candidate.level.materials.length}, expected=1`);
      }
      if (candidate.mi !== 0) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: sentinel material index=${candidate.mi}, expected=0`);
      }
      if (candidate.material?.jobMaterial?.jobMaterialId !== 40) {
        errors.push(`heroId ${hero.heroId} JobConnection ${connection.jobConnectionId}: resolved JobMaterial identity mismatch`);
      }
    }
  }

  if (count999Count !== sentinelCount) {
    errors.push(`Count 999 entries=${count999Count}, validated terminal sentinels=${sentinelCount}`);
  }

  const expected = policy.validatedPopulation || {};
  const eligibleCount = materialEntryCount - sentinelCount;
  const checks = [
    ['heroCount', heroCount, expected.heroCount],
    ['connectionCount', connectionCount, expected.connectionCount],
    ['materialEntryCount', materialEntryCount, expected.materialEntryCount],
    ['terminalSentinelCount', sentinelCount, expected.terminalSentinelCount],
    ['presentationEligibleMaterialEntryCount', eligibleCount, expected.presentationEligibleMaterialEntryCount],
  ];
  for (const [label, actual, wanted] of checks) {
    if (actual !== wanted) errors.push(`${label}=${actual}, expected=${wanted}`);
  }

  if (summary.heroCount !== heroCount) errors.push(`summary.heroCount=${summary.heroCount}, observed=${heroCount}`);
  if (summary.connectionCount !== connectionCount) errors.push(`summary.connectionCount=${summary.connectionCount}, observed=${connectionCount}`);
  if (summary.materialEntryCount !== materialEntryCount) errors.push(`summary.materialEntryCount=${summary.materialEntryCount}, observed=${materialEntryCount}`);

  const status = errors.length ? 'FAIL' : 'PASS';
  console.log(`HERO JOB MATERIAL TERMINAL SENTINEL VALIDATION: ${status}`);
  console.log(`heroes=${heroCount} connections=${connectionCount} materialEntries=${materialEntryCount} sentinels=${sentinelCount} eligible=${eligibleCount} count999=${count999Count} errors=${errors.length}`);
  if (errors.length) {
    for (const error of errors.slice(0, 100)) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}

main();
