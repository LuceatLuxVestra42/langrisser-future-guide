const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const CENSUS = 'data/generated/soldier-training-material-census.v1.json';
const ITEM_INFO = 'data/configdata/ConfigDataItemInfo.json';
const OUTPUT = 'data/generated/soldier-training-material-iteminfo.v1.json';
const VALIDATION = 'data/validation/soldier-training-material-iteminfo.v1.json';

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

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function main() {
  const census = loadJson(CENSUS);
  const itemInfo = loadJson(ITEM_INFO);
  const targetIds = Array.isArray(census.uniqueItemIds) ? census.uniqueItemIds : [];
  const targetIdSet = new Set(targetIds);

  const matchesById = new Map(targetIds.map((id) => [id, []]));
  if (Array.isArray(itemInfo)) {
    for (const row of itemInfo) {
      if (!targetIdSet.has(row?.ID)) continue;
      matchesById.get(row.ID).push(row);
    }
  }

  const items = [];
  const missingItemIds = [];
  const duplicateItemIds = [];
  const emptyNameItemIds = [];
  const emptyIconItemIds = [];

  for (const itemId of targetIds) {
    const matches = matchesById.get(itemId) ?? [];
    if (matches.length === 0) {
      missingItemIds.push(itemId);
      continue;
    }
    if (matches.length !== 1) duplicateItemIds.push(itemId);

    const row = matches[0];
    if (!nonEmptyString(row.Name)) emptyNameItemIds.push(itemId);
    if (!nonEmptyString(row.Icon)) emptyIconItemIds.push(itemId);

    items.push({
      itemId,
      name: row.Name ?? null,
      iconPath: row.Icon ?? null,
      matchCount: matches.length,
    });
  }

  const uniqueTargetIdCount = new Set(targetIds).size;
  const checks = {
    censusStatusNotPass: census.status === 'PASS' ? 0 : 1,
    censusSchemaMismatch: census.schemaId === 'soldier-training-material-census/v1' ? 0 : 1,
    targetCountMismatch: targetIds.length === 24 ? 0 : 1,
    duplicateTargetIds: targetIds.length - uniqueTargetIdCount,
    itemInfoNotArray: Array.isArray(itemInfo) ? 0 : 1,
    missingItemIds: missingItemIds.length,
    duplicateItemIds: duplicateItemIds.length,
    emptyNames: emptyNameItemIds.length,
    emptyIcons: emptyIconItemIds.length,
  };
  const failureCount = Object.values(checks).reduce((sum, value) => sum + (value ?? 0), 0);
  const status = failureCount === 0 ? 'PASS' : 'FAIL';
  const generatedAt = new Date().toISOString();

  const sources = {
    census: {
      path: CENSUS,
      gitBlobSha: gitBlobSha(CENSUS),
      schemaId: census.schemaId ?? null,
      status: census.status ?? null,
    },
    itemInfo: {
      path: ITEM_INFO,
      gitBlobSha: gitBlobSha(ITEM_INFO),
      directJsonKeys: { id: 'ID', name: 'Name', iconPath: 'Icon' },
    },
  };

  const output = {
    version: 1,
    schemaId: 'soldier-training-material-iteminfo/v1',
    status,
    generatedAt,
    scope: 'exact ConfigDataItemInfo parity for frozen Soldier training material item IDs',
    sources,
    method: {
      join: 'census.uniqueItemIds[] === ConfigDataItemInfo[].ID',
      nameField: 'Name',
      iconPathField: 'Icon',
      noNameJoin: true,
      noIdArithmetic: true,
      noRangeAssumption: true,
    },
    summary: {
      targetItemIdCount: targetIds.length,
      uniqueTargetItemIdCount: uniqueTargetIdCount,
      matchedItemIdCount: items.length,
      missingItemIdCount: missingItemIds.length,
      duplicateItemIdCount: duplicateItemIds.length,
      emptyNameCount: emptyNameItemIds.length,
      emptyIconCount: emptyIconItemIds.length,
    },
    items,
  };

  const validation = {
    version: 1,
    schemaId: 'soldier-training-material-iteminfo-validation/v1',
    status,
    generatedAt,
    sources,
    checks,
    observed: output.summary,
    missingItemIds,
    duplicateItemIds,
    emptyNameItemIds,
    emptyIconItemIds,
    failureCount,
  };

  writeJson(OUTPUT, output);
  writeJson(VALIDATION, validation);

  console.log(JSON.stringify({ status, summary: output.summary, items, checks }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}

main();
