export function classifyChangedPathCompleteness({ expectedChangedFileCount, files } = {}) {
  const expected = Number(expectedChangedFileCount);
  const records = Array.isArray(files) ? files : [];

  if (!Number.isInteger(expected) || expected < 0 || records.length !== expected) {
    return {
      status: 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE',
      expectedChangedFileCount: Number.isInteger(expected) && expected >= 0 ? expected : null,
      actualChangedFileCount: records.length,
      paths: [],
    };
  }

  const paths = records
    .map(file => file?.filename)
    .filter(item => typeof item === 'string' && item.length > 0);
  if (paths.length !== records.length) {
    return {
      status: 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE',
      expectedChangedFileCount: expected,
      actualChangedFileCount: paths.length,
      reason: 'CHANGED_PATH_MISSING',
      paths: [],
    };
  }

  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length !== paths.length) {
    return {
      status: 'BLOCKER_MERGE_GATE_PATH_SET_INCOMPLETE',
      expectedChangedFileCount: expected,
      actualChangedFileCount: uniquePaths.length,
      reason: 'DUPLICATE_CHANGED_PATH',
      paths: [],
    };
  }

  return {
    status: 'PASS',
    expectedChangedFileCount: expected,
    actualChangedFileCount: paths.length,
    paths,
  };
}

export async function readPaginatedPullFiles({ repository, prNumber, token, request, perPage = 100 } = {}) {
  if (!repository || typeof repository !== 'string') throw new Error('repository is required');
  if (!Number.isInteger(Number(prNumber)) || Number(prNumber) <= 0) throw new Error('prNumber must be a positive integer');
  if (typeof request !== 'function') throw new Error('request must be a function');
  if (!Number.isInteger(perPage) || perPage <= 0 || perPage > 100) throw new Error('perPage must be an integer from 1 to 100');

  const files = [];
  for (let page = 1; ; page += 1) {
    const pageFiles = await request(
      repository,
      `/pulls/${Number(prNumber)}/files?per_page=${perPage}&page=${page}`,
      token,
    );
    if (!Array.isArray(pageFiles)) {
      throw new Error(`GitHub PR files response must be an array for page ${page}`);
    }
    files.push(...pageFiles);
    if (pageFiles.length < perPage) break;
  }
  return files;
}
