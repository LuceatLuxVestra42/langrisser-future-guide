import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const [packageDirArg, requestFileArg, oracleFileArg, consumerScriptArg, validatorScriptArg] = process.argv.slice(2);
if (!packageDirArg || !requestFileArg || !oracleFileArg || !consumerScriptArg || !validatorScriptArg) {
  console.error('usage: negative-controls.mjs <package-dir> <request-spec> <oracle> <consumer-script> <validator-script>');
  process.exit(2);
}
const packageDir = path.resolve(packageDirArg);
const requestFile = path.resolve(requestFileArg);
const oracleFile = path.resolve(oracleFileArg);
const consumerScript = path.resolve(consumerScriptArg);
const validatorScript = path.resolve(validatorScriptArg);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };

function runNode(args) {
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}
function combined(result) { return `${result.stdout || ''}\n${result.stderr || ''}`; }
function expectFailure(result, code, id) {
  if (result.status === 0) fail(`${id} unexpectedly passed`);
  if (!combined(result).includes(code)) fail(`${id} failed with wrong class: expected ${code}, got ${combined(result)}`);
}
function copyPackage(id) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `relation-delivery-${id}-`));
  fs.cpSync(packageDir, dir, { recursive: true });
  return dir;
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function updatePayloadIntegrity(dir, manifest, relativePath) {
  const bytes = fs.readFileSync(path.join(dir, relativePath));
  const payload = manifest.payloads.find(item => item.path === relativePath);
  if (!payload) fail(`payload declaration missing for ${relativePath}`);
  payload.bytes = bytes.length;
  payload.sha256 = sha256(bytes);
}

const results = [];

{
  const dir = copyPackage('n1a');
  const manifest = readJson(path.join(dir, 'manifest.v1.json'));
  const victim = manifest.profiles.find(item => item.relationKey === 'hero-exclusive-equipment').file;
  fs.rmSync(path.join(dir, victim));
  const out = path.join(dir, 'out.json');
  const result = runNode([consumerScript, dir, requestFile, out]);
  expectFailure(result, 'FAIL_PACKAGE_INTEGRITY', 'N1a');
  results.push({ id: 'N1a', expected: 'FAIL_PACKAGE_INTEGRITY', observed: 'FAIL_PACKAGE_INTEGRITY', pass: true });
}

{
  const dir = copyPackage('n1b');
  const manifestPath = path.join(dir, 'manifest.v1.json');
  const manifest = readJson(manifestPath);
  const profile = manifest.profiles.find(item => item.relationKey === 'hero-exclusive-equipment');
  fs.rmSync(path.join(dir, profile.file));
  manifest.profiles = manifest.profiles.filter(item => item.relationKey !== 'hero-exclusive-equipment');
  manifest.payloads = manifest.payloads.filter(item => item.path !== profile.file);
  writeJson(manifestPath, manifest);
  const out = path.join(dir, 'out.json');
  const result = runNode([consumerScript, dir, requestFile, out]);
  expectFailure(result, 'FAIL_MISSING_RELATION_DELIVERY', 'N1b');
  results.push({ id: 'N1b', expected: 'FAIL_MISSING_RELATION_DELIVERY', observed: 'FAIL_MISSING_RELATION_DELIVERY', pass: true });
}

{
  const dir = copyPackage('n2');
  const manifestPath = path.join(dir, 'manifest.v1.json');
  const manifest = readJson(manifestPath);
  const profileMeta = manifest.profiles.find(item => item.relationKey === 'hero-exclusive-equipment');
  const profilePath = path.join(dir, profileMeta.file);
  const profile = readJson(profilePath);
  const lookup = profile.lookups.find(item => item.direction === 'Hero->ExclusiveEquipment');
  const entry = lookup.entries.find(item => item.targets.length > 0);
  entry.present = false;
  writeJson(profilePath, profile);
  updatePayloadIntegrity(dir, manifest, profileMeta.file);
  writeJson(manifestPath, manifest);
  const out = path.join(dir, 'out.json');
  const result = runNode([consumerScript, dir, requestFile, out]);
  expectFailure(result, 'FAIL_INVALID_LOOKUP_ENVELOPE', 'N2');
  results.push({ id: 'N2', expected: 'FAIL_INVALID_LOOKUP_ENVELOPE', observed: 'FAIL_INVALID_LOOKUP_ENVELOPE', pass: true });
}

{
  const dir = copyPackage('n3');
  const manifestPath = path.join(dir, 'manifest.v1.json');
  const manifest = readJson(manifestPath);
  const profileMeta = manifest.profiles.find(item => item.relationKey === 'hero-soldier');
  const profilePath = path.join(dir, profileMeta.file);
  const profile = readJson(profilePath);
  let mutated = false;
  for (const lookup of profile.lookups) {
    for (const entry of lookup.entries) {
      for (const target of entry.targets) {
        if (Array.isArray(target.provenance) && target.provenance.length > 0) {
          target.provenance = target.provenance.slice(1);
          mutated = true;
          break;
        }
      }
      if (mutated) break;
    }
    if (mutated) break;
  }
  if (!mutated) fail('N3 could not find A3 provenance to mutate');
  writeJson(profilePath, profile);
  updatePayloadIntegrity(dir, manifest, profileMeta.file);
  writeJson(manifestPath, manifest);
  const out = path.join(dir, 'out.json');
  const consumer = runNode([consumerScript, dir, requestFile, out]);
  if (consumer.status !== 0) fail(`N3 consumer should pass integrity/runtime before parity: ${combined(consumer)}`);
  const parity = runNode([validatorScript, out, oracleFile]);
  expectFailure(parity, 'FAIL_DELIVERY_PARITY', 'N3');
  results.push({ id: 'N3', expected: 'FAIL_DELIVERY_PARITY', observed: 'FAIL_DELIVERY_PARITY', pass: true, packageIntegrityPassed: true, consumerExecutionPassed: true });
}

console.log(JSON.stringify({ status: 'PASS', checkpoint: 'RELATION_DELIVERY_2_2_NEGATIVE_CONTROLS', resultCount: results.length, results }, null, 2));
