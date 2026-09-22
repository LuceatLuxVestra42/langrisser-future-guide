import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDelivery as buildA3Delivery } from '../../../scripts/build-hero-soldier-delivery-a3.mjs';
import { assertOpaqueTarget, createLookupEnvelope } from '../lib/contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const contractPath = 'data/contracts/relation-delivery-consumer-migration.v1.json';
const outArg = process.argv.indexOf('--out-dir');
const outDir = path.resolve(outArg >= 0 ? process.argv[outArg + 1] : process.env.RELATION_DELIVERY_PACKAGE_DIR || path.join(root, '.tmp/relation-delivery-package'));

const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const gitBlob = relativePath => execFileSync('git', ['hash-object', relativePath], { cwd: root, encoding: 'utf8' }).trim();
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
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

function normalizeAcceptedIndex(source, lookup) {
  const index = source?.[lookup.sourceIndex];
  if (!index || typeof index !== 'object' || Array.isArray(index)) fail(`missing lookup index ${lookup.sourceIndex}`);
  return Object.entries(index).map(([rawFromId, rawTargets]) => {
    let targets;
    if (lookup.sourceShape === 'TARGET_ARRAY') {
      if (!Array.isArray(rawTargets)) fail(`${lookup.sourceIndex}.${rawFromId} must be an array`);
      targets = rawTargets.map(clone);
    } else if (lookup.sourceShape === 'SINGLE_TARGET') {
      if (rawTargets === null || typeof rawTargets !== 'object' || Array.isArray(rawTargets)) fail(`${lookup.sourceIndex}.${rawFromId} must be a target object`);
      targets = [clone(rawTargets)];
    } else {
      fail(`normalizeAcceptedIndex cannot handle ${lookup.sourceShape}`);
    }
    for (const target of targets) assertOpaqueTarget(target);
    const envelope = createLookupEnvelope({ present: true, targets });
    return { fromId: typedFromId(rawFromId, lookup.fromIdType), present: envelope.present, targets: clone(envelope.targets) };
  });
}

function edgeMetadata(edge) {
  const { heroId, soldierId, ...metadata } = edge;
  return clone(metadata);
}

function normalizeA3(runtime, profile) {
  const pairMap = new Map();
  let semanticProvenanceEntryCount = 0;
  for (const edge of runtime.edges || []) {
    const key = `${edge.heroId}:${edge.soldierId}`;
    if (pairMap.has(key)) fail(`A3 duplicate edge ${key}`);
    pairMap.set(key, edge);
    semanticProvenanceEntryCount += Array.isArray(edge.provenance) ? edge.provenance.length : 0;
  }
  if (pairMap.size !== profile.semanticCounts.edgeCount) fail(`A3 semantic edge count mismatch: ${pairMap.size}`);
  if (semanticProvenanceEntryCount !== profile.semanticCounts.provenanceEntryCount) fail(`A3 semantic provenance count mismatch: ${semanticProvenanceEntryCount}`);

  let transportMetadataInstanceCount = 0;
  const lookups = profile.lookups.map(lookup => {
    const index = runtime?.[lookup.sourceIndex];
    if (!index || typeof index !== 'object' || Array.isArray(index)) fail(`A3 missing lookup ${lookup.sourceIndex}`);
    const entries = Object.entries(index).map(([rawFromId, ids]) => {
      if (!Array.isArray(ids)) fail(`A3 ${lookup.sourceIndex}.${rawFromId} must be an array`);
      const targets = ids.map(rawTargetId => {
        const heroId = lookup.direction === 'Hero->Soldier' ? Number(rawFromId) : Number(rawTargetId);
        const soldierId = lookup.direction === 'Hero->Soldier' ? Number(rawTargetId) : Number(rawFromId);
        const edge = pairMap.get(`${heroId}:${soldierId}`);
        if (!edge) fail(`A3 transport join missing edge ${heroId}:${soldierId}`);
        const target = { targetId: Number(rawTargetId), ...edgeMetadata(edge) };
        assertOpaqueTarget(target);
        transportMetadataInstanceCount += Array.isArray(target.provenance) ? target.provenance.length : 0;
        return target;
      });
      const envelope = createLookupEnvelope({ present: true, targets });
      return { fromId: typedFromId(rawFromId, lookup.fromIdType), present: envelope.present, targets: clone(envelope.targets) };
    });
    return {
      direction: lookup.direction,
      fromIdType: lookup.fromIdType,
      targetIdType: lookup.targetIdType,
      keyPresence: lookup.keyPresence,
      entries,
    };
  });

  const heroLookup = lookups.find(item => item.direction === 'Hero->Soldier');
  const soldierLookup = lookups.find(item => item.direction === 'Soldier->Hero');
  const heroTargetCount = heroLookup.entries.reduce((sum, entry) => sum + entry.targets.length, 0);
  const soldierTargetCount = soldierLookup.entries.reduce((sum, entry) => sum + entry.targets.length, 0);
  if (heroTargetCount !== profile.semanticCounts.edgeCount || soldierTargetCount !== profile.semanticCounts.edgeCount) fail('A3 transport target count mismatch');

  return {
    lookups,
    transportSummary: {
      semanticEdgeCount: profile.semanticCounts.edgeCount,
      semanticProvenanceEntryCount: profile.semanticCounts.provenanceEntryCount,
      transportHeroLookupTargetCount: heroTargetCount,
      transportSoldierLookupTargetCount: soldierTargetCount,
      transportMetadataInstanceCount,
    },
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function listPayloadFiles(dir) {
  const files = [];
  const walk = current => {
    for (const name of fs.readdirSync(current)) {
      const absolute = path.join(current, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`symlink not allowed in package: ${absolute}`);
      if (stat.isDirectory()) walk(absolute);
      else if (stat.isFile()) files.push(path.relative(dir, absolute).split(path.sep).join('/'));
      else fail(`unsupported package entry: ${absolute}`);
    }
  };
  walk(dir);
  return files.filter(file => file !== 'manifest.v1.json');
}

const contract = readJson(contractPath);
if (contract.status !== 'DESIGN_FROZEN') fail('migration contract must be DESIGN_FROZEN');
assertBlob(contract.authority.a5Contract, 'A5 contract');
assertBlob(contract.authority.a5Validation, 'A5 validation');
assertBlob(contract.authority.portableContractLibrary, 'portable contract library');
const a5Validation = readJson(contract.authority.a5Validation.path);
if (a5Validation.status !== 'PASS' || a5Validation.completion !== 'COMPLETE') fail('A5 validation must remain PASS/COMPLETE');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'contract'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'projections'), { recursive: true });
fs.copyFileSync(path.join(root, contract.authority.portableContractLibrary.path), path.join(outDir, 'contract/contract.mjs'));

const manifestProfiles = [];
for (const profile of contract.profiles) {
  assertBlob(profile.validation, `${profile.relationKey} validation`);
  const validation = readJson(profile.validation.path);
  if (validation.status !== 'PASS' || validation.completion !== 'COMPLETE') fail(`${profile.relationKey} validation must remain PASS/COMPLETE`);

  let portable;
  if (profile.acceptedDelivery) {
    assertBlob(profile.acceptedDelivery, `${profile.relationKey} accepted delivery`);
    if (validation.deliveryArtifact?.gitBlobSha !== profile.acceptedDelivery.gitBlobSha) fail(`${profile.relationKey} validation delivery pin mismatch`);
    const accepted = readJson(profile.acceptedDelivery.path);
    portable = {
      version: 1,
      schemaId: contract.transport.profileSchema,
      relationKey: profile.relationKey,
      transportOnly: true,
      semanticAuthority: false,
      sourceEvidenceGitBlobSha: profile.acceptedDelivery.gitBlobSha,
      lookups: profile.lookups.map(lookup => ({
        direction: lookup.direction,
        fromIdType: lookup.fromIdType,
        targetIdType: lookup.targetIdType,
        keyPresence: lookup.keyPresence,
        entries: normalizeAcceptedIndex(accepted, lookup),
      })),
    };
  } else {
    assertBlob(profile.runtimeSource, `${profile.relationKey} runtime source`);
    assertBlob(profile.runtimeBuilder, `${profile.relationKey} runtime builder`);
    assertBlob(profile.runtimeValidator, `${profile.relationKey} runtime validator`);
    if (validation.runtimeProjection?.persisted !== false || validation.runtimeProjection?.sourceGitBlobSha !== profile.runtimeSource.gitBlobSha) fail('A3 runtime projection pin mismatch');
    const runtime = buildA3Delivery();
    if (runtime.sourceArtifact?.gitBlobSha !== profile.runtimeSource.gitBlobSha) fail('A3 builder source pin mismatch');
    const normalized = normalizeA3(runtime, profile);
    portable = {
      version: 1,
      schemaId: contract.transport.profileSchema,
      relationKey: profile.relationKey,
      transportOnly: true,
      semanticAuthority: false,
      sourceEvidenceGitBlobSha: profile.runtimeSource.gitBlobSha,
      lookups: normalized.lookups,
      transportSummary: normalized.transportSummary,
    };
  }

  const file = `projections/${profile.relationKey}.json`;
  writeJson(path.join(outDir, file), portable);
  manifestProfiles.push({
    relationKey: profile.relationKey,
    file,
    lookups: profile.lookups.map(lookup => ({
      direction: lookup.direction,
      fromIdType: lookup.fromIdType,
      targetIdType: lookup.targetIdType,
      keyPresence: lookup.keyPresence,
      transportSourceShape: lookup.sourceShape,
    })),
  });
}

const payloadFiles = listPayloadFiles(outDir).sort();
const payloads = payloadFiles.map(relativePath => {
  const bytes = fs.readFileSync(path.join(outDir, relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
});
const manifest = {
  version: 1,
  schemaId: contract.transport.packageSchema,
  experimentId: contract.experimentId,
  transportOnly: true,
  semanticAuthority: false,
  persistence: contract.transport.persistence,
  a5ContractGitBlobSha: contract.authority.a5Contract.gitBlobSha,
  profiles: manifestProfiles,
  payloads,
  boundary: {
    rawConfigDataIncluded: false,
    canonicalRelationArtifactIncluded: false,
    domainValidatorIncluded: false,
    genericSemanticArtifact: false,
    genericSortingApplied: false
  }
};
writeJson(path.join(outDir, 'manifest.v1.json'), manifest);

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'RELATION_DELIVERY_2_2_PACKAGE_BUILD',
  outDir,
  profileCount: manifestProfiles.length,
  payloadCount: payloads.length,
  manifestSha256: sha256(fs.readFileSync(path.join(outDir, 'manifest.v1.json'))),
  a3TransportSummary: JSON.parse(fs.readFileSync(path.join(outDir, 'projections/hero-soldier.json'), 'utf8')).transportSummary,
}, null, 2));
