import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const STATUS_PATH = 'data/generated/project-doctor-d1-1-status.v1.json';
const GATE_PATH = 'data/validation/project-doctor-d1-2-summary.v1.json';
const steps = [
  ['active-source-registry', 'scripts/validate-project-doctor-active-source-registry.mjs'],
  ['collect', 'scripts/collect-project-doctor-d1-1.mjs'],
  ['validate', 'scripts/validate-project-doctor-d1-2.mjs'],
];

const runStep = (label, script) => {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.error) {
    console.error(`[doctor] ${label} could not start: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(`[doctor] ${label} failed with exit code ${result.status ?? 'unknown'}.`);
    return result.status ?? 1;
  }
  return 0;
};

for (const [label, script] of steps) {
  const exitCode = runStep(label, script);
  if (exitCode !== 0) process.exit(exitCode);
}

const status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
const gate = JSON.parse(fs.readFileSync(GATE_PATH, 'utf8'));
if (gate.status !== 'PASS_PROJECT_DOCTOR_D1_2_HEALTH_GATE') {
  console.error(`[doctor] health gate did not pass: ${gate.status}`);
  process.exit(1);
}

const populationSummary = record => {
  const entries = Object.entries(record.population ?? {});
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
};

const width = (value, size) => String(value).padEnd(size, ' ');
console.log('\nPROJECT DOCTOR');
console.log(`${width('Domain', 14)} ${width('Lifecycle', 12)} ${width('Health', 13)} Population`);
console.log('-'.repeat(86));
for (const record of status.domains ?? []) {
  console.log(`${width(record.domain, 14)} ${width(record.lifecycle, 12)} ${width(record.health, 13)} ${populationSummary(record)}`);
}
console.log('-'.repeat(86));
console.log(`Project health : ${status.projectHealth}`);
console.log(`Hard errors    : ${status.knownHardErrorTotal}`);
console.log(`Reviews        : ${status.reviewTotal}`);
console.log(`Blockers       : ${status.blockerTotal}`);

const blockingHealth = new Set(['MISSING', 'FAIL', 'INCONSISTENT', 'UNKNOWN']);
if (blockingHealth.has(status.projectHealth)) {
  console.error(`[doctor] blocking project health: ${status.projectHealth}`);
  process.exitCode = 1;
}
