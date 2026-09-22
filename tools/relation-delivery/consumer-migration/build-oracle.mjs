import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const contractPath = 'data/contracts/relation-delivery-consumer-migration.v1.json';
const outArg = process.argv.indexOf('--out');
const outFile = path.resolve(outArg >= 0 ? process.argv[outArg + 1] : process.env.RELATION_DELIVERY_ORACLE || path.join(root, '.tmp/relation-delivery-oracle.json'));
const inputTrace = new Set([contractPath]);

const readJson = relativePath => {
  inputTrace.add(relativePath);
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
};
const gitBlob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(message); };

function assertBlob(pin, label) {
  const actual = gitBlob(pin.path);
  if (actual !== pin.gitBlobSha) fail(`${label} blob mismatch: expected ${pin.gitBlobSha}, got ${actual}`);
}

function typedFromId(raw, type) {
  if (type === 'number') {
    const value = Number(raw);
    if (!Number.isFinite(value)) fail(`invalid numeric fromId: ${raw}`);
    return value;
  }
  if (type === 'string') return String(raw);
  fail(`unsupported fromIdType: ${type}`);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function acceptedLookup(accepted, lookup) {
  const index = accepted?.[lookup.sourceIndex];
  if (!index || typeof index !== 'object' || Array.isArray(index)) fail(`oracle missing ${lookup.sourceIndex}`);
  return {
    direction: lookup.direction,
    fromIdType: lookup.fromIdType,
    targetIdType: lookup.targetIdType,
    keyPresence: lookup.keyPresence,
    entries: Object.entries(index).map(([rawFromId, rawTargets]) => ({
      fromId: typedFromId(rawFromId, lookup.fromIdType),
      present: true,
      targets: lookup.sourceShape === 'SINGLE_TARGET' ? [clone(rawTargets)] : clone(rawTargets),
    })),
  };
}

function a3Lookups(source, profile) {
  const byHeroId = {};
  const bySoldierId = {};
  let provenanceCount = 0;
  for (const edge of source.edges || []) {
    const { heroId, soldierId, ...metadata } = edge;
    if (!byHeroId[String(heroId)]) byHeroId[String(heroId)] = [];
    if (!bySoldierId[String(soldierId)]) bySoldierId[String(soldierId)] = [];
    byHeroId[String(heroId)].push({ targetId: soldierId, ...clone(metadata) });
    bySoldierId[String(soldierId)].push({ targetId: heroId, ...clone(metadata) });
    provenanceCount += Array.isArray(edge.provenance) ? edge.provenance.length : 0;
  }
  if ((source.edges || []).length !== profile.semanticCounts.edgeCount) fail('oracle A3 edge count mismatch');
  if (provenanceCount !== profile.semanticCounts.provenanceEntryCount) fail('oracle A3 provenance count mismatch');
  const indexes = { 'Hero->Soldier': byHeroId, 'Soldier->Hero': bySoldierId };
  return profile.lookups.map(lookup => ({
    direction: lookup.direction,
    fromIdType: lookup.fromIdType,
    targetIdType: lookup.targetIdType,
    keyPresence: lookup.keyPresence,
    entries: Object.entries(indexes[lookup.direction]).map(([rawFromId, targets]) => ({
      fromId: typedFromId(rawFromId, lookup.fromIdType),
      present: true,
      targets,
    })),
  }));
}

const contract = readJson(contractPath);
if (contract.status !== 'DESIGN_FROZEN') fail('migration contract must be DESIGN_FROZEN');
assertBlob(contract.authority.a5Contract, 'A5 contract');
assertBlob(contract.authority.a5Validation, 'A5 validation');

const profiles = [];
for (const profile of contract.profiles) {
  assertBlob(profile.validation, `${profile.relationKey} validation`);
  const validation = readJson(profile.validation.path);
  if (validation.status !== 'PASS' || validation.completion !== 'COMPLETE') fail(`${profile.relationKey} validation must remain PASS/COMPLETE`);
  let lookups;
  if (profile.acceptedDelivery) {
    assertBlob(profile.acceptedDelivery, `${profile.relationKey} accepted delivery`);
    const accepted = readJson(profile.acceptedDelivery.path);
    lookups = profile.lookups.map(lookup => acceptedLookup(accepted, lookup));
  } else {
    assertBlob(profile.runtimeSource, `${profile.relationKey} runtime source`);
    const source = readJson(profile.runtimeSource.path);
    lookups = a3Lookups(source, profile);
  }
  profiles.push({ relationKey: profile.relationKey, lookups });
}

const probe = contract.consumer.absentLookupProbe;
const equipmentProfile = contract.profiles.find(profile => profile.relationKey === probe.relationKey);
const equipmentAccepted = readJson(equipmentProfile.acceptedDelivery.path);
const probeLookup = equipmentProfile.lookups.find(lookup => lookup.direction === probe.direction);
const rawProbe = equipmentAccepted[probeLookup.sourceIndex]?.[String(probe.fromId)];
const probes = [{
  relationKey: probe.relationKey,
  direction: probe.direction,
  fromId: probe.fromId,
  claim: probe.claim,
  present: rawProbe !== undefined,
  targets: rawProbe === undefined ? [] : clone(Array.isArray(rawProbe) ? rawProbe : [rawProbe]),
}];

const expectedOutput = {
  version: 1,
  schemaId: 'relation-delivery-consumer-output/v1',
  experimentId: contract.experimentId,
  profiles,
  probes,
};
const canonicalText = JSON.stringify(canonicalize(expectedOutput));
const oracle = {
  version: 1,
  schemaId: 'relation-delivery-consumer-oracle/v1',
  experimentId: contract.experimentId,
  mode: contract.oracle.mode,
  packageReadAllowed: false,
  packageBuilderImportAllowed: false,
  expectedOutputCanonicalSha256: sha256(canonicalText),
  expectedOutput,
  inputTrace: [...inputTrace],
};
if (oracle.inputTrace.some(value => value.includes('package') || value.includes('build-package'))) fail(`oracle forbidden input trace: ${JSON.stringify(oracle.inputTrace)}`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(oracle, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', checkpoint: 'RELATION_DELIVERY_2_2_ORACLE_BUILD', outFile, expectedOutputCanonicalSha256: oracle.expectedOutputCanonicalSha256, inputTrace: oracle.inputTrace }, null, 2));
