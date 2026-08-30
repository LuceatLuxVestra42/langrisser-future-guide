const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const INPUT = 'data/generated/soldier-training-material-iteminfo.v1.json';
const OUTPUT = 'data/validation/soldier-training-material-repo-assets.v1.json';

function abs(relativePath) {
  return path.join(rootDir, relativePath);
}

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
}

function writeJson(relativePath, value) {
  const filePath = abs(relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function gitBlobSha(relativePath) {
  try {
    return execFileSync('git', ['rev-parse', `HEAD:${relativePath}`], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function main() {
  const input = loadJson(INPUT);
  const files = trackedFiles();
  const filesByBasename = new Map();
  const filesByLowerBasename = new Map();

  for (const file of files) {
    const basename = path.posix.basename(file);
    const lower = basename.toLowerCase();
    if (!filesByBasename.has(basename)) filesByBasename.set(basename, []);
    filesByBasename.get(basename).push(file);
    if (!filesByLowerBasename.has(lower)) filesByLowerBasename.set(lower, []);
    filesByLowerBasename.get(lower).push(file);
  }

  const rows = [];
  let exactPngMatchedItemCount = 0;
  let exactWebpMatchedItemCount = 0;
  let exactAnyMatchedItemCount = 0;
  let caseInsensitiveOnlyMatchedItemCount = 0;

  for (const item of input.items ?? []) {
    const sourceBasename = path.posix.basename(item.iconPath ?? '');
    const stem = sourceBasename.replace(/\.png$/i, '');
    const webpBasename = `${stem}.webp`;
    const exactPngMatches = filesByBasename.get(sourceBasename) ?? [];
    const exactWebpMatches = filesByBasename.get(webpBasename) ?? [];
    const ciPngMatches = filesByLowerBasename.get(sourceBasename.toLowerCase()) ?? [];
    const ciWebpMatches = filesByLowerBasename.get(webpBasename.toLowerCase()) ?? [];
    const hasExact = exactPngMatches.length > 0 || exactWebpMatches.length > 0;
    const hasCaseInsensitiveOnly = !hasExact && (ciPngMatches.length > 0 || ciWebpMatches.length > 0);

    if (exactPngMatches.length > 0) exactPngMatchedItemCount += 1;
    if (exactWebpMatches.length > 0) exactWebpMatchedItemCount += 1;
    if (hasExact) exactAnyMatchedItemCount += 1;
    if (hasCaseInsensitiveOnly) caseInsensitiveOnlyMatchedItemCount += 1;

    rows.push({
      itemId: item.itemId,
      name: item.name,
      iconPath: item.iconPath,
      sourceBasename,
      webpBasename,
      exactPngMatches,
      exactWebpMatches,
      caseInsensitivePngMatches: ciPngMatches,
      caseInsensitiveWebpMatches: ciWebpMatches,
    });
  }

  const totalItemCount = rows.length;
  const missingExactItemCount = totalItemCount - exactAnyMatchedItemCount;
  const scanChecks = {
    inputStatusNotPass: input.status === 'PASS' ? 0 : 1,
    inputSchemaMismatch: input.schemaId === 'soldier-training-material-iteminfo/v1' ? 0 : 1,
    targetCountMismatch: totalItemCount === 24 ? 0 : 1,
  };
  const scanFailureCount = Object.values(scanChecks).reduce((sum, value) => sum + value, 0);
  const status = scanFailureCount === 0 ? 'PASS' : 'FAIL';
  const assetAdmissionStatus = missingExactItemCount === 0
    ? 'READY_REPOSITORY_ASSETS'
    : 'BLOCKED_REPOSITORY_ASSETS_MISSING';

  const output = {
    version: 1,
    schemaId: 'soldier-training-material-repo-assets-validation/v1',
    status,
    assetAdmissionStatus,
    generatedAt: new Date().toISOString(),
    scope: 'tracked repository exact-basename parity for frozen Soldier training material ItemInfo icon paths',
    source: {
      path: INPUT,
      gitBlobSha: gitBlobSha(INPUT),
      status: input.status ?? null,
      schemaId: input.schemaId ?? null,
    },
    method: {
      repositoryPopulation: 'git ls-files',
      sourceCandidate: 'exact basename of ItemInfo.iconPath (.png)',
      deliveryCandidate: 'same exact basename stem with .webp',
      exactCaseRequiredForAdmission: true,
      caseInsensitiveMatchesAreDiagnosticOnly: true,
      noNameJoin: true,
      noPathGuessing: true,
    },
    summary: {
      totalItemCount,
      trackedFileCount: files.length,
      exactPngMatchedItemCount,
      exactWebpMatchedItemCount,
      exactAnyMatchedItemCount,
      missingExactItemCount,
      caseInsensitiveOnlyMatchedItemCount,
    },
    scanChecks,
    scanFailureCount,
    items: rows,
  };

  writeJson(OUTPUT, output);
  console.log(JSON.stringify({
    status,
    assetAdmissionStatus,
    summary: output.summary,
    missing: rows.filter((row) => row.exactPngMatches.length === 0 && row.exactWebpMatches.length === 0)
      .map((row) => ({ itemId: row.itemId, sourceBasename: row.sourceBasename })),
  }, null, 2));

  if (status !== 'PASS') process.exitCode = 1;
}

main();
