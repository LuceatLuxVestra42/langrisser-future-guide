const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const configDir = path.join(dataDir, 'configdata');
const generatedDir = path.join(dataDir, 'generated');
const validationDir = path.join(dataDir, 'validation');

const contractPath = path.join(dataDir, 'hero-basic-combat-stage4-5.v1.json');
const jobTreePath = path.join(generatedDir, 'hero-job-trees.v1.json');
const skillPath = path.join(generatedDir, 'hero-skill-acquisition.v1.json');
const outputPath = path.join(generatedDir, 'hero-basic-combat.v1.json');
const summaryPath = path.join(validationDir, 'hero-basic-combat-stage4-5-summary.v1.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function inspectTextAsset(asset, expectedName) {
  const issues = [];
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    return { ok: false, issues: ['JSON root is not an object'] };
  }
  if (asset.m_Name !== expectedName) issues.push(`m_Name=${JSON.stringify(asset.m_Name)} expected=${expectedName}`);
  if (!Number.isInteger(asset.m_size) || asset.m_size < 0) issues.push(`invalid m_size=${String(asset.m_size)}`);
  if (!Array.isArray(asset.m_bytes) || asset.m_bytes.length === 0) {
    issues.push('m_bytes is missing, null, or empty');
  } else {
    const invalidIndex = asset.m_bytes.findIndex((value) => !Number.isInteger(value) || value < 0 || value > 255);
    if (invalidIndex !== -1) issues.push(`invalid byte at index ${invalidIndex}`);
    if (Number.isInteger(asset.m_size) && asset.m_bytes.length !== asset.m_size) {
      issues.push(`m_size=${asset.m_size} but m_bytes.length=${asset.m_bytes.length}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

function sourceState(filename) {
  const fullPath = path.join(configDir, filename);
  if (!fs.existsSync(fullPath)) return { filename, ok: false, issues: ['file missing'] };
  try {
    const asset = loadJson(fullPath);
    return { filename, ...inspectTextAsset(asset, path.basename(filename, '.json')) };
  } catch (error) {
    return { filename, ok: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
}

function upstreamState(filePath, label) {
  if (!fs.existsSync(filePath)) return { label, ok: false, status: 'missing', recordCount: 0, data: null };
  try {
    const data = loadJson(filePath);
    const ok = data.status === 'PASS' || data.status === 'REVIEW';
    return {
      label,
      ok,
      status: data.status || 'unknown',
      recordCount: Array.isArray(data.records) ? data.records.length : 0,
      data,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: 'invalid-json',
      recordCount: 0,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}

function heroIds(data) {
  return new Set((data?.records || []).map((record) => record.heroId).filter(Number.isInteger));
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort((a, b) => a - b);
}

function main() {
  const contract = loadJson(contractPath);
  const upstreams = [
    upstreamState(jobTreePath, 'stage4-3-job-tree'),
    upstreamState(skillPath, 'stage4-4-skill-acquisition'),
  ];
  const sourceStates = contract.requiredSources.map(sourceState);
  const unresolvedGates = (contract.semanticGates || []).filter((gate) => gate.status !== 'VERIFIED');

  const blockers = [];
  const upstreamBlocked = upstreams.filter((state) => !state.ok);
  const sourceBlocked = sourceStates.filter((state) => !state.ok);

  for (const state of upstreamBlocked) {
    blockers.push(`${state.label}: status=${state.status}${state.error ? ` (${state.error})` : ''}`);
  }
  for (const state of sourceBlocked) {
    blockers.push(`${state.filename}: ${state.issues.join(' | ')}`);
  }

  const hardErrors = [];
  if (upstreams.every((state) => state.ok)) {
    const treeIds = heroIds(upstreams[0].data);
    const skillIds = heroIds(upstreams[1].data);
    const onlyTree = setDifference(treeIds, skillIds);
    const onlySkill = setDifference(skillIds, treeIds);
    if (onlyTree.length) hardErrors.push(`hero IDs only in Stage 4-3: ${onlyTree.join(', ')}`);
    if (onlySkill.length) hardErrors.push(`hero IDs only in Stage 4-4: ${onlySkill.join(', ')}`);
  }

  let status;
  if (upstreamBlocked.length) status = 'UPSTREAM_BLOCKED';
  else if (sourceBlocked.length) status = 'SOURCE_BLOCKED';
  else if (hardErrors.length) status = 'FAIL';
  else if (unresolvedGates.length) status = 'SEMANTIC_BLOCKED';
  else status = 'ASSEMBLY_PENDING';

  // Stage 4-5 intentionally does not emit final combat records while a semantic
  // relation is unresolved. Promoting a gate to VERIFIED must be accompanied by
  // an evidence-backed implementation of that mapping; changing the label alone
  // is not permission to fabricate stats, talents, modifiers, or awakening roles.
  writeJson(outputPath, {
    version: 1,
    stage: '4-5',
    status,
    recordCount: 0,
    records: [],
  });

  writeJson(summaryPath, {
    version: 1,
    stage: '4-5',
    status,
    pipelineStatus: 'READY_FOR_SOURCE_AND_SEMANTIC_VERIFICATION',
    stage4CompletionStatus: status === 'PASS' ? 'COMPLETE' : 'NOT_COMPLETE',
    upstream: upstreams.map(({ label, ok, status: upstreamStatus, recordCount, error }) => ({
      label,
      status: upstreamStatus,
      usable: ok,
      recordCount,
      ...(error ? { error } : {}),
    })),
    sourceHealth: sourceStates.map(({ filename, ok, issues }) => ({
      filename,
      status: ok ? 'usable' : 'broken',
      issues,
    })),
    semanticGates: (contract.semanticGates || []).map((gate) => ({
      id: gate.id,
      status: gate.status,
      requiredEvidence: gate.requiredEvidence,
    })),
    hardErrors,
    blockers,
    unresolvedSemanticGateIds: unresolvedGates.map((gate) => gate.id),
    safetyDecision: 'Do not emit final Stage 4 combat records until source integrity and all five semantic mappings are verified. Parsing success alone is not sufficient.',
    resumeCommands: [
      'npm run inspect:hero-jobs',
      'npm run inspect:hero-job-trees',
      'npm run inspect:hero-skills',
      'npm run inspect:hero-combat'
    ],
    nextGate: upstreamBlocked.length
      ? 'Replace blocked Job/JobConnection/JobLevel/Skill sources and rerun Stages 4-2 through 4-4.'
      : sourceBlocked.length
        ? 'Replace structurally broken Stage 4-5 source exports.'
        : unresolvedGates.length
          ? 'Verify awakening, display stats, hero soldier modifiers, talent identity, and talent star progression against explicit ConfigData/runtime evidence.'
          : 'Implement the now-verified semantic mappings, then allow Stage 4-5 PASS.',
  });

  console.log(`STAGE 4-5 RESULT: ${status}`);
  for (const blocker of blockers) console.log(`- BLOCKED: ${blocker}`);
  for (const error of hardErrors) console.log(`- FAIL: ${error}`);
  for (const gate of unresolvedGates) console.log(`- SEMANTIC ${gate.status}: ${gate.id}`);

  if (status === 'FAIL') process.exitCode = 1;
  else if (status !== 'PASS') process.exitCode = 2;
}

main();
