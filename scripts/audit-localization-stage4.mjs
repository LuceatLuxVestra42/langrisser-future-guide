import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const LEGACY = path.join(ROOT, 'scripts/audit-localization-stage4-legacy.mjs');

const oldBuildPolicy = `  let equipmentBuildPreparation = false;
  try {
    const packageJson = JSON.parse(sourceOf(overrides, contract.equipment.packageJson));
    const prefix = 'node scripts/build-equipment-name-kr-presentation.mjs &&';
    equipmentBuildPreparation = ['dev', 'build', 'build:dev'].every((key) => String(packageJson.scripts?.[key] ?? '').includes(prefix));
  } catch {
    equipmentBuildPreparation = false;
  }`;

const currentBuildPolicy = `  let equipmentBuildPreparation = false;
  try {
    const packageJson = JSON.parse(sourceOf(overrides, contract.equipment.packageJson));
    const prefix = 'node scripts/build-equipment-name-kr-presentation.mjs &&';
    const devPrepared = String(packageJson.scripts?.dev ?? '').includes(prefix);
    const buildDevPrepared = String(packageJson.scripts?.['build:dev'] ?? '').includes(prefix);
    const productionBuildReadOnly = String(packageJson.scripts?.build ?? '').trim() === 'vite build';
    equipmentBuildPreparation = devPrepared && buildDevPrepared && productionBuildReadOnly;
  } catch {
    equipmentBuildPreparation = false;
  }`;

const oldSelfTest = `  const packageJson = readJson(contract.equipment.packageJson);
  packageJson.scripts.build = 'vite build';
  add('equipment-build-prep-missing', hasCode(auditBoundary(contract, { [contract.equipment.packageJson]: \`${'${JSON.stringify(packageJson, null, 2)}'}\\n\` }), 'EQUIPMENT_BUILD_PREP_MISSING'));`;

const currentSelfTest = `  const packageJson = readJson(contract.equipment.packageJson);
  packageJson.scripts.dev = 'vite dev';
  add('equipment-build-prep-missing', hasCode(auditBoundary(contract, { [contract.equipment.packageJson]: \`${'${JSON.stringify(packageJson, null, 2)}'}\\n\` }), 'EQUIPMENT_BUILD_PREP_MISSING'));`;

let source = fs.readFileSync(LEGACY, 'utf8');
if (!source.includes(oldBuildPolicy) || !source.includes(oldSelfTest)) {
  console.error('Localization Audit Stage 4 compatibility adapter could not locate the frozen build-policy blocks.');
  process.exit(1);
}

source = source.replace(oldBuildPolicy, currentBuildPolicy).replace(oldSelfTest, currentSelfTest);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'localization-audit-stage4-current-'));
const tempScript = path.join(tempDir, 'audit-localization-stage4-current.mjs');

try {
  fs.writeFileSync(tempScript, source, 'utf8');
  const run = spawnSync(process.execPath, [tempScript, ...process.argv.slice(2)], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  process.exitCode = run.status ?? 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
