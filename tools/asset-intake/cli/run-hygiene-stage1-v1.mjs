import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanAssetRoot } from '../core/engine-v1.mjs';

const REPO_ROOT = process.cwd();
const CONTRACT_PATH = 'tools/asset-intake/contract/hygiene-stage1-inventory.v1.json';
const SCOPE_PATH = 'tools/asset-intake/contract/hygiene-scope.v1.json';

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    maxBuffer: 512 * 1024 * 1024,
    ...options,
  });
}

function parseTree(buffer) {
  const entries = [];
  for (const raw of buffer.toString('utf8').split('\0')) {
    if (!raw) continue;
    const tab = raw.indexOf('\t');
    if (tab < 0) throw new Error(`invalid git ls-tree record: ${raw.slice(0, 120)}`);
    const header = raw.slice(0, tab);
    const repositoryPath = raw.slice(tab + 1);
    const parts = header.split(/\s+/);
    if (parts.length < 4) throw new Error(`invalid git ls-tree header: ${header}`);
    const [mode, type, objectSha, sizeRaw] = parts;
    entries.push({
      mode,
      type,
      objectSha,
      size: sizeRaw === '-' ? null : Number(sizeRaw),
      repositoryPath,
    });
  }
  return entries;
}

function extensionOf(repositoryPath) {
  return path.posix.extname(repositoryPath).toLowerCase() || '<none>';
}

function basenameOf(repositoryPath) {
  return path.posix.basename(repositoryPath);
}

function candidateByPath(repositoryPath, contract) {
  if (contract.population.alwaysIncludeRoots.some((root) => repositoryPath.startsWith(root))) return true;
  return contract.population.extensionAllowlist.includes(extensionOf(repositoryPath));
}

function rootOf(repositoryPath) {
  const parts = repositoryPath.split('/');
  if (repositoryPath.startsWith('public/images/')) {
    return parts.length >= 3 ? `public/images/${parts[2]}/` : 'public/images/';
  }
  return parts.length > 1 ? `${parts[0]}/` : '<repository-root>';
}

function parseLfsPointer(bytes) {
  if (bytes.length > 4096) return null;
  const text = bytes.toString('utf8');
  if (!text.startsWith('version https://git-lfs.github.com/spec/v1\n')) return null;
  const oidMatch = text.match(/^oid sha256:([0-9a-f]{64})$/m);
  const sizeMatch = text.match(/^size (\d+)$/m);
  return {
    oidSha256: oidMatch?.[1] ?? null,
    declaredByteSize: sizeMatch ? Number(sizeMatch[1]) : null,
  };
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function sortedObject(counter) {
  return Object.fromEntries(Object.entries(counter).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

function basenameGroups(inventoryRecords, symlinkReviews) {
  const byBasename = new Map();
  const add = (record, kind) => {
    const key = record.basename;
    if (!byBasename.has(key)) byBasename.set(key, []);
    byBasename.get(key).push({ kind, repositoryPath: record.repositoryPath });
  };
  for (const record of inventoryRecords) add(record, 'INVENTORY');
  for (const record of symlinkReviews) add(record, 'SYMLINK_REVIEW');

  const groups = [];
  for (const [basename, members] of byBasename.entries()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));
    const groupId = `basename:${basename}`;
    groups.push({ groupId, basename, count: members.length, members });
    for (const record of inventoryRecords) {
      if (record.basename === basename) record.basenameCollisionGroup = groupId;
    }
    for (const record of symlinkReviews) {
      if (record.basename === basename) record.basenameCollisionGroup = groupId;
    }
  }
  groups.sort((a, b) => a.basename.localeCompare(b.basename, 'en'));
  return groups;
}

function duplicateGroups(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record.exactDuplicateGroup || !record.sha256) continue;
    if (!byId.has(record.exactDuplicateGroup)) {
      byId.set(record.exactDuplicateGroup, {
        groupId: record.exactDuplicateGroup,
        sha256: record.sha256,
        count: 0,
        paths: [],
      });
    }
    const group = byId.get(record.exactDuplicateGroup);
    group.count += 1;
    group.paths.push(record.repositoryPath);
  }
  const groups = [...byId.values()];
  for (const group of groups) group.paths.sort((a, b) => a.localeCompare(b, 'en'));
  groups.sort((a, b) => a.groupId.localeCompare(b.groupId, 'en'));
  return groups;
}

function checkpointMarkdown(summary, outputs) {
  const reviews = summary.reviews.length
    ? summary.reviews.map((review, index) => `${index + 1}. \`${review.code}\` — ${review.count}`).join('\n')
    : '- 없음';
  return `# Asset Hygiene Stage 1 — Repository Inventory\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. authoritative predecessor\n\n- \`tools/asset-intake/contract/hygiene-scope.v1.json\`\n- baseline commit: \`${summary.baseline.commit}\`\n- baseline tree: \`${summary.baseline.tree}\`\n- scope: \`${summary.baseline.scopeId}\`\n\nAH-0의 population을 변경하지 않고 그대로 물질화했다. current main이나 filename recency를 이용해 baseline을 silent migration하지 않았다.\n\n## 2. 물리 census 결과\n\n\`\`\`text\ntracked tree entries       ${summary.coverage.trackedTreeEntryCount}\nscoped regular candidates ${summary.coverage.scopedRegularCandidateCount}\nscoped symlink candidates ${summary.coverage.scopedSymlinkCandidateCount}\ninventory records          ${summary.coverage.inventoryRecordCount}\nresolved byte records      ${summary.coverage.resolvedByteRecordCount}\nLFS pointer reviews        ${summary.coverage.lfsPointerReviewCount}\nsymlink reviews            ${summary.coverage.symlinkReviewCount}\ntotal resolved asset bytes ${summary.coverage.resolvedAssetByteCount}\nexact duplicate groups     ${summary.groups.exactDuplicateGroupCount}\nexact duplicate records    ${summary.groups.exactDuplicateRecordCount}\nbasename candidate groups  ${summary.groups.basenameCollisionGroupCount}\n\`\`\`\n\n## 3. 산출물\n\n- inventory: \`${outputs.inventory}\`\n- exact duplicate groups: \`${outputs.exactDuplicateGroups}\`\n- basename groups: \`${outputs.basenameGroups}\`\n- validation summary: \`${outputs.summary}\`\n\n모든 generated inventory는 기존 Project Doctor D2 V5를 수정하지 않기 위해 이미 mapped된 \`tools/asset-intake/**\` surface 안에 둔다.\n\n## 4. 계산한 것\n\n- repository path / root / extension\n- Git blob byte size\n- 기존 Asset Intake engine의 signature / 지원 format dimension\n- SHA-256\n- exact-byte duplicate candidate group\n- basename collision candidate group\n- Git LFS pointer fail-closed review\n- symlink non-follow review\n\n## 5. 계산하지 않은 것\n\n\`\`\`text\nACTIVE_VERIFIED\nEVIDENCE_ONLY\nGENERATED_DERIVATIVE\nSUPERSEDED\nUNREFERENCED\nPROVENANCE_UNKNOWN\nproduction admission\ndelete/move/rename decision\nreference/consumer cross-check\nsemantic relation recomputation\n\`\`\`\n\n위 항목은 AH-2/AH-3 소유 범위다. exact duplicate와 basename collision은 물리 후보일 뿐 semantic identity 또는 resolver 오류 판정이 아니다.\n\n## 6. REVIEW / BLOCKER\n\nREVIEW:\n${reviews}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((item) => `- \`${item.code}\``).join('\n') : '- 없음'}\n\n발견된 duplicate/collision/LFS/symlink는 삭제 지시가 아니라 후속 cross-check 입력이다.\n\n## 7. 완료 조건\n\n- scoped regular candidate 100% inventory coverage\n- unreadable blob 0\n- Git tree byte-size mismatch 0\n- duplicate group parity PASS\n- basename group parity PASS\n- asset mutation 0\n- semantic recomputation 0\n\n## 8. 다음 시작점\n\n\`ASSET_HYGIENE_2_REFERENCE_CROSSCHECK\`\n\nAH-2는 이 frozen physical inventory를 입력으로 사용해 current manifest/resolver/frontend/evidence reference만 exact path 기반으로 교차검증한다. AH-1을 이유 없이 다시 scan하지 않는다.\n\n## 9. 다시 열리는 조건\n\n- AH-0 baseline migration\n- AH-0 population rule 변경\n- inventory producer 또는 기존 Asset Intake byte-analysis contract 변경\n- generated inventory와 baseline Git tree coverage parity 파손\n- SHA-256/duplicate/basename grouping validator 회귀\n- 실제 LFS/symlink 사례가 현재 fail-closed record로 표현 불가능함\n\n## 10. 최종 판정\n\n\`\`\`text\n${summary.status}\n${summary.completion}\n${summary.freezeState}\nhard error: ${summary.hardErrorCount}\nblocker: ${summary.blockers.length}\nnext: AH-2 reference cross-check\n\`\`\`\n`;
}

async function main() {
  const contract = JSON.parse(await readFile(path.join(REPO_ROOT, CONTRACT_PATH), 'utf8'));
  const scope = JSON.parse(await readFile(path.join(REPO_ROOT, SCOPE_PATH), 'utf8'));

  if (contract.baseline.commit !== scope.baseline.commit || contract.baseline.tree !== scope.baseline.tree) {
    throw new Error('Stage 1 baseline must exactly match AH-0 frozen baseline');
  }

  const actualTree = git(['rev-parse', `${contract.baseline.commit}^{tree}`], { encoding: 'utf8' }).trim();
  if (actualTree !== contract.baseline.tree) {
    throw new Error(`baseline tree mismatch: expected ${contract.baseline.tree}, got ${actualTree}`);
  }

  const treeEntries = parseTree(git(['ls-tree', '-r', '--full-tree', '-l', '-z', contract.baseline.commit]));
  const regularModes = new Set(contract.population.regularFileModes);
  const regularCandidates = [];
  const symlinkCandidates = [];

  for (const entry of treeEntries) {
    if (!candidateByPath(entry.repositoryPath, contract)) continue;
    if (regularModes.has(entry.mode) && entry.type === 'blob') regularCandidates.push(entry);
    else if (entry.mode === contract.population.symlinkMode && entry.type === 'blob') symlinkCandidates.push(entry);
  }
  regularCandidates.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));
  symlinkCandidates.sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'asset-hygiene-stage1-'));
  const lfsRecords = [];
  const unreadable = [];
  const byteSizeMismatches = [];

  try {
    for (const entry of regularCandidates) {
      let bytes;
      try {
        bytes = git(['cat-file', 'blob', entry.objectSha]);
      } catch (error) {
        unreadable.push({ repositoryPath: entry.repositoryPath, objectSha: entry.objectSha, error: String(error.message ?? error) });
        continue;
      }
      if (entry.size !== null && bytes.length !== entry.size) {
        byteSizeMismatches.push({ repositoryPath: entry.repositoryPath, treeByteSize: entry.size, readByteSize: bytes.length });
      }
      const lfs = parseLfsPointer(bytes);
      if (lfs) {
        lfsRecords.push({
          recordStatus: 'LFS_POINTER_UNRESOLVED',
          repositoryPath: entry.repositoryPath,
          root: rootOf(entry.repositoryPath),
          sourcePath: entry.repositoryPath,
          relativePath: entry.repositoryPath,
          basename: basenameOf(entry.repositoryPath),
          extension: extensionOf(entry.repositoryPath),
          byteSize: bytes.length,
          signature: 'GIT_LFS_POINTER',
          width: null,
          height: null,
          sha256: null,
          lfsOidSha256: lfs.oidSha256,
          lfsDeclaredByteSize: lfs.declaredByteSize,
          exactDuplicateGroup: null,
          basenameCollisionGroup: null,
          gitObjectSha: entry.objectSha,
        });
        continue;
      }
      const destination = path.join(tempRoot, ...entry.repositoryPath.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }

    const scanned = await scanAssetRoot(tempRoot, { sourceArtifact: `${contract.baseline.commit}^{tree}` });
    const normalRecords = scanned.map((record) => ({
      recordStatus: 'SCANNED',
      repositoryPath: record.relativePath,
      root: rootOf(record.relativePath),
      ...record,
      gitObjectSha: regularCandidates.find((entry) => entry.repositoryPath === record.relativePath)?.objectSha ?? null,
    }));

    const inventoryRecords = [...normalRecords, ...lfsRecords]
      .sort((a, b) => a.repositoryPath.localeCompare(b.repositoryPath, 'en'));

    const symlinkReviews = symlinkCandidates.map((entry) => ({
      recordStatus: 'SYMLINK_NOT_FOLLOWED',
      repositoryPath: entry.repositoryPath,
      root: rootOf(entry.repositoryPath),
      basename: basenameOf(entry.repositoryPath),
      extension: extensionOf(entry.repositoryPath),
      gitObjectSha: entry.objectSha,
      basenameCollisionGroup: null,
      reviewRequired: true,
    }));

    const basenameGroupList = basenameGroups(inventoryRecords, symlinkReviews);
    const duplicateGroupList = duplicateGroups(inventoryRecords);

    const rootCounts = {};
    const extensionCounts = {};
    const signatureCounts = {};
    let resolvedAssetByteCount = 0;
    let gitBlobByteCount = 0;
    let nonRasterOrUnknownSignatureCount = 0;
    const rasterSignatures = new Set(['PNG', 'JPEG', 'GIF', 'WEBP']);

    for (const record of inventoryRecords) {
      increment(rootCounts, record.root);
      increment(extensionCounts, record.extension);
      increment(signatureCounts, record.signature);
      gitBlobByteCount += record.byteSize;
      if (record.recordStatus === 'SCANNED') resolvedAssetByteCount += record.byteSize;
      if (record.recordStatus === 'SCANNED' && !rasterSignatures.has(record.signature)) nonRasterOrUnknownSignatureCount += 1;
    }

    const expectedInventoryCount = regularCandidates.length - unreadable.length;
    const coverageMismatch = inventoryRecords.length !== expectedInventoryCount;
    const hardErrorCount = unreadable.length + byteSizeMismatches.length + (coverageMismatch ? 1 : 0);

    const reviews = [];
    if (duplicateGroupList.length) reviews.push({ code: 'EXACT_DUPLICATE_CANDIDATES_PRESENT', count: duplicateGroupList.length, blocking: false });
    if (basenameGroupList.length) reviews.push({ code: 'BASENAME_COLLISION_CANDIDATES_PRESENT', count: basenameGroupList.length, blocking: false });
    if (lfsRecords.length) reviews.push({ code: 'LFS_POINTER_UNRESOLVED', count: lfsRecords.length, blocking: false });
    if (symlinkReviews.length) reviews.push({ code: 'SYMLINK_NOT_FOLLOWED', count: symlinkReviews.length, blocking: false });
    if (nonRasterOrUnknownSignatureCount) reviews.push({ code: 'NON_RASTER_OR_UNKNOWN_SIGNATURE_PRESENT', count: nonRasterOrUnknownSignatureCount, blocking: false });

    const blockers = [];
    if (unreadable.length) blockers.push({ code: 'UNREADABLE_BASELINE_BLOB', count: unreadable.length });
    if (byteSizeMismatches.length) blockers.push({ code: 'GIT_TREE_BYTE_SIZE_MISMATCH', count: byteSizeMismatches.length });
    if (coverageMismatch) blockers.push({ code: 'INVENTORY_COVERAGE_MISMATCH', expectedInventoryCount, actualInventoryCount: inventoryRecords.length });

    const inventory = {
      version: 1,
      schemaId: 'asset-hygiene-inventory/v1',
      stage: 'ASSET_HYGIENE_1',
      baseline: contract.baseline,
      generatedBy: 'tools/asset-intake/cli/run-hygiene-stage1-v1.mjs',
      recordCount: inventoryRecords.length,
      records: inventoryRecords,
      symlinkReviews,
    };

    const duplicateGroupsOutput = {
      version: 1,
      schemaId: 'asset-hygiene-exact-duplicate-groups/v1',
      baseline: contract.baseline,
      groupCount: duplicateGroupList.length,
      recordCount: duplicateGroupList.reduce((sum, group) => sum + group.count, 0),
      groups: duplicateGroupList,
    };

    const basenameGroupsOutput = {
      version: 1,
      schemaId: 'asset-hygiene-basename-candidate-groups/v1',
      baseline: contract.baseline,
      candidateOnly: true,
      resolverErrorImplied: false,
      groupCount: basenameGroupList.length,
      memberCount: basenameGroupList.reduce((sum, group) => sum + group.count, 0),
      groups: basenameGroupList,
    };

    const summary = {
      version: 1,
      schemaId: 'asset-intake-hygiene-stage1-inventory-summary/v1',
      stage: 'ASSET_HYGIENE_1',
      checkpoint: 'ASSET_HYGIENE_STAGE1_REPOSITORY_INVENTORY',
      status: hardErrorCount === 0 ? 'PASS_ASSET_HYGIENE_STAGE1_REPOSITORY_INVENTORY' : 'FAIL_ASSET_HYGIENE_STAGE1_REPOSITORY_INVENTORY',
      completion: hardErrorCount === 0 ? 'COMPLETE' : 'INCOMPLETE',
      freezeState: hardErrorCount === 0 ? 'ASSET_HYGIENE_STAGE1_INVENTORY_FROZEN' : 'NOT_FROZEN',
      contract: CONTRACT_PATH,
      predecessor: SCOPE_PATH,
      baseline: contract.baseline,
      readOnly: true,
      rawConfigDataReadCount: 0,
      semanticRecomputationCount: 0,
      assetMutationCount: 0,
      classificationCount: 0,
      coverage: {
        trackedTreeEntryCount: treeEntries.length,
        scopedRegularCandidateCount: regularCandidates.length,
        scopedSymlinkCandidateCount: symlinkCandidates.length,
        inventoryRecordCount: inventoryRecords.length,
        resolvedByteRecordCount: normalRecords.length,
        lfsPointerReviewCount: lfsRecords.length,
        symlinkReviewCount: symlinkReviews.length,
        unreadableBlobCount: unreadable.length,
        byteSizeMismatchCount: byteSizeMismatches.length,
        resolvedAssetByteCount,
        gitBlobByteCount,
      },
      groups: {
        exactDuplicateGroupCount: duplicateGroupList.length,
        exactDuplicateRecordCount: duplicateGroupsOutput.recordCount,
        basenameCollisionGroupCount: basenameGroupList.length,
        basenameCollisionMemberCount: basenameGroupsOutput.memberCount,
      },
      census: {
        byRoot: sortedObject(rootCounts),
        byExtension: sortedObject(extensionCounts),
        bySignature: sortedObject(signatureCounts),
        nonRasterOrUnknownSignatureCount,
      },
      diagnostics: {
        unreadable,
        byteSizeMismatches,
      },
      reviews,
      blockers,
      hardErrorCount,
      outputs: contract.outputs,
      nextStartPoint: contract.nextStage,
    };

    for (const outputPath of [contract.outputs.inventory, contract.outputs.exactDuplicateGroups, contract.outputs.basenameGroups, contract.outputs.summary, contract.outputs.checkpoint]) {
      await mkdir(path.dirname(path.join(REPO_ROOT, outputPath)), { recursive: true });
    }
    await writeFile(path.join(REPO_ROOT, contract.outputs.inventory), stable(inventory));
    await writeFile(path.join(REPO_ROOT, contract.outputs.exactDuplicateGroups), stable(duplicateGroupsOutput));
    await writeFile(path.join(REPO_ROOT, contract.outputs.basenameGroups), stable(basenameGroupsOutput));
    await writeFile(path.join(REPO_ROOT, contract.outputs.summary), stable(summary));
    await writeFile(path.join(REPO_ROOT, contract.outputs.checkpoint), checkpointMarkdown(summary, contract.outputs));

    console.log(JSON.stringify({
      status: summary.status,
      completion: summary.completion,
      freezeState: summary.freezeState,
      baseline: summary.baseline,
      coverage: summary.coverage,
      groups: summary.groups,
      reviews: summary.reviews,
      blockers: summary.blockers,
      hardErrorCount: summary.hardErrorCount,
    }, null, 2));

    if (hardErrorCount !== 0) process.exitCode = 1;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
