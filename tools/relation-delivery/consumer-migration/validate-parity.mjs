import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

class ExperimentError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new ExperimentError(code, message); };
const outputFile = process.argv[2] || 'consumer-output.json';
const oracleFile = process.argv[3] || 'oracle.json';
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail('FAIL_DELIVERY_PARITY', `invalid JSON ${file}: ${error.message}`); }
}

try {
  const output = readJson(outputFile);
  const oracle = readJson(oracleFile);
  if (oracle.schemaId !== 'relation-delivery-consumer-oracle/v1' || oracle.mode !== 'FULL_PARITY') fail('FAIL_DELIVERY_PARITY', 'invalid full-parity oracle');
  const outputCanonical = JSON.stringify(canonicalize(output));
  const expectedCanonical = JSON.stringify(canonicalize(oracle.expectedOutput));
  const outputSha = sha256(outputCanonical);
  const expectedSha = sha256(expectedCanonical);
  if (expectedSha !== oracle.expectedOutputCanonicalSha256) fail('FAIL_DELIVERY_PARITY', 'oracle digest self-check failed');
  if (outputCanonical !== expectedCanonical || outputSha !== expectedSha) fail('FAIL_DELIVERY_PARITY', `consumer output mismatch: expected ${expectedSha}, got ${outputSha}`);
  console.log(JSON.stringify({ status: 'PASS', checkpoint: 'RELATION_DELIVERY_2_2_FULL_PARITY', consumerOutputCanonicalSha256: outputSha, profileCount: output.profiles?.length ?? 0, probeCount: output.probes?.length ?? 0 }, null, 2));
} catch (error) {
  const code = error instanceof ExperimentError ? error.code : 'FAIL_DELIVERY_PARITY';
  console.error(`${code}: ${error.message}`);
  process.exit(1);
}
