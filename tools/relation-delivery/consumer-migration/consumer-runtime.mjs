import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

class ExperimentError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new ExperimentError(code, message); };
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const packageDir = path.resolve(process.argv[2] || 'package');
const requestFile = path.resolve(process.argv[3] || 'consumer-request-spec.v1.json');
const outFile = path.resolve(process.argv[4] || 'consumer-output.json');

function safeRelative(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && !path.isAbsolute(relativePath)
    && !relativePath.split('/').includes('..')
    && !relativePath.includes('\\');
}

function listFiles(root) {
  const files = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const absolute = path.join(dir, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail('FAIL_PACKAGE_INTEGRITY', `symlink not allowed: ${absolute}`);
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
      else fail('FAIL_PACKAGE_INTEGRITY', `unsupported package entry: ${absolute}`);
    }
  };
  walk(root);
  return files;
}

function readJson(file, code = 'FAIL_PACKAGE_INTEGRITY') {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(code, `invalid JSON ${file}: ${error.message}`); }
}

async function main() {
  const manifestPath = path.join(packageDir, 'manifest.v1.json');
  if (!fs.existsSync(manifestPath)) fail('FAIL_PACKAGE_INTEGRITY', 'manifest.v1.json is missing');
  const manifest = readJson(manifestPath);
  if (manifest.schemaId !== 'relation-delivery-portable-package/v1') fail('FAIL_PACKAGE_INTEGRITY', 'unexpected package schema');
  if (!Array.isArray(manifest.payloads) || !Array.isArray(manifest.profiles)) fail('FAIL_PACKAGE_INTEGRITY', 'manifest arrays missing');

  const declared = new Set(['manifest.v1.json']);
  for (const payload of manifest.payloads) {
    if (!safeRelative(payload.path)) fail('FAIL_PACKAGE_INTEGRITY', `unsafe payload path: ${payload.path}`);
    if (declared.has(payload.path)) fail('FAIL_PACKAGE_INTEGRITY', `duplicate payload path: ${payload.path}`);
    declared.add(payload.path);
    const file = path.join(packageDir, payload.path);
    if (!fs.existsSync(file)) fail('FAIL_PACKAGE_INTEGRITY', `missing payload: ${payload.path}`);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('FAIL_PACKAGE_INTEGRITY', `payload must be regular file: ${payload.path}`);
    const bytes = fs.readFileSync(file);
    if (bytes.length !== payload.bytes || sha256(bytes) !== payload.sha256) fail('FAIL_PACKAGE_INTEGRITY', `payload digest mismatch: ${payload.path}`);
  }
  const actualFiles = listFiles(packageDir);
  if (actualFiles.length !== declared.size || actualFiles.some(file => !declared.has(file))) fail('FAIL_PACKAGE_INTEGRITY', `package closure mismatch: ${JSON.stringify(actualFiles)}`);

  const request = readJson(requestFile, 'FAIL_CONSUMER_REQUEST_SPEC');
  if (request.expectedAnswersIncluded !== false) fail('FAIL_CONSUMER_REQUEST_SPEC', 'request spec must not include expected answers');
  const profileKeys = manifest.profiles.map(profile => profile.relationKey);
  for (const required of request.requiredProfiles || []) {
    if (!profileKeys.includes(required)) fail('FAIL_MISSING_RELATION_DELIVERY', `required profile missing: ${required}`);
  }

  const contractUrl = pathToFileURL(path.join(packageDir, 'contract/contract.mjs')).href;
  const { assertOpaqueTarget, createLookupEnvelope } = await import(contractUrl);
  const outputProfiles = [];
  const loaded = new Map();

  for (const profileMeta of manifest.profiles) {
    if (!safeRelative(profileMeta.file)) fail('FAIL_PACKAGE_INTEGRITY', `unsafe profile path: ${profileMeta.file}`);
    const profile = readJson(path.join(packageDir, profileMeta.file));
    if (profile.schemaId !== 'relation-delivery-portable-profile/v1' || profile.relationKey !== profileMeta.relationKey) fail('FAIL_PACKAGE_INTEGRITY', `profile identity mismatch: ${profileMeta.relationKey}`);
    const lookups = [];
    for (const lookup of profile.lookups || []) {
      if (!Array.isArray(lookup.entries)) fail('FAIL_PACKAGE_INTEGRITY', `lookup entries missing: ${lookup.direction}`);
      const entries = lookup.entries.map(entry => {
        if (!Array.isArray(entry.targets)) fail('FAIL_INVALID_LOOKUP_ENVELOPE', `targets not array: ${lookup.direction}`);
        try {
          for (const target of entry.targets) assertOpaqueTarget(target);
          const envelope = createLookupEnvelope({ present: entry.present, targets: entry.targets });
          return { fromId: entry.fromId, present: envelope.present, targets: JSON.parse(JSON.stringify(envelope.targets)) };
        } catch (error) {
          fail('FAIL_INVALID_LOOKUP_ENVELOPE', `${lookup.direction}/${entry.fromId}: ${error.message}`);
        }
      });
      lookups.push({
        direction: lookup.direction,
        fromIdType: lookup.fromIdType,
        targetIdType: lookup.targetIdType,
        keyPresence: lookup.keyPresence,
        entries,
      });
    }
    const normalized = { relationKey: profile.relationKey, lookups };
    outputProfiles.push(normalized);
    loaded.set(profile.relationKey, normalized);
  }

  const probes = (request.probes || []).map(probe => {
    const profile = loaded.get(probe.relationKey);
    const lookup = profile?.lookups.find(item => item.direction === probe.direction);
    if (!lookup) fail('FAIL_MISSING_RELATION_DELIVERY', `probe lookup missing: ${probe.relationKey}/${probe.direction}`);
    const entry = lookup.entries.find(item => item.fromId === probe.fromId);
    try {
      const envelope = entry
        ? createLookupEnvelope({ present: entry.present, targets: entry.targets })
        : createLookupEnvelope({ present: false, targets: [] });
      return { ...probe, present: envelope.present, targets: JSON.parse(JSON.stringify(envelope.targets)) };
    } catch (error) {
      fail('FAIL_INVALID_LOOKUP_ENVELOPE', `probe invalid: ${error.message}`);
    }
  });

  const output = {
    version: 1,
    schemaId: 'relation-delivery-consumer-output/v1',
    experimentId: manifest.experimentId,
    profiles: outputProfiles,
    probes,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'PASS', checkpoint: 'RELATION_DELIVERY_2_2_FRESH_CONSUMER', profileCount: outputProfiles.length, probeCount: probes.length }, null, 2));
}

main().catch(error => {
  const code = error instanceof ExperimentError ? error.code : 'FAIL_CONSUMER_RUNTIME';
  console.error(`${code}: ${error.message}`);
  process.exit(1);
});
