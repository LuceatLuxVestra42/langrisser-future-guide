import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_ROUTE_HOSTED_QA_CONTRACT = 'tools/route-hosted-qa/contracts/hosted.v1.json';
export const MODE_STRICT = 'STRICT_CANDIDATE';
export const MODE_PROBE = 'PROBE_CURRENT_DEPLOYED';

const SHA40 = /^[0-9a-f]{40}$/i;
let requestCounter = 0;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function repositoryPath(repoRoot, relativePath) {
  const root = path.resolve(repoRoot);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Repository path escapes root: ${relativePath}`);
  }
  return target;
}

export function validateRouteHostedQaContract(contract) {
  const failures = [];
  if (contract?.schemaId !== 'route-hosted-qa-contract/v1') failures.push('schemaId');
  if (contract?.status !== 'DESIGN_FROZEN') failures.push('status');
  if (contract?.hostedTarget?.canonicalDirectoryStyle !== 'TRAILING_SLASH') failures.push('canonicalDirectoryStyle');
  if (!String(contract?.hostedTarget?.repositoryBase ?? '').startsWith('/')) failures.push('repositoryBase');
  if (!String(contract?.hostedTarget?.repositoryBase ?? '').endsWith('/')) failures.push('repositoryBaseTrailingSlash');
  if (!Array.isArray(contract?.routes?.public) || contract.routes.public.length !== 6) failures.push('publicRoutes');
  if (!Array.isArray(contract?.checkIds) || contract.checkIds.length !== 10 || new Set(contract.checkIds).size !== 10) failures.push('checkIds');
  if (!Number.isInteger(contract?.runtime?.requestTimeoutMs) || contract.runtime.requestTimeoutMs <= 0) failures.push('requestTimeoutMs');
  if (!Number.isInteger(contract?.runtime?.maxAssetRequests) || contract.runtime.maxAssetRequests <= 0) failures.push('maxAssetRequests');
  if (contract?.runtime?.shellExecution !== false) failures.push('shellExecution');
  if (contract?.runtime?.browserLaunch !== false || contract?.runtime?.playwright !== false) failures.push('browserBoundary');
  if (contract?.runtime?.repositoryMutation !== false || contract?.runtime?.deploymentMutation !== false) failures.push('mutationBoundary');
  if (contract?.boundaries?.deploymentWriterAuthority !== false || contract?.boundaries?.ghPagesWriteAllowed !== false) failures.push('deploymentWriterBoundary');
  if (contract?.boundaries?.semanticAuthority !== false || contract?.failurePolicy?.semanticReopenAllowed !== false) failures.push('semanticBoundary');
  if (contract?.modes?.[MODE_STRICT]?.expectedSourceShaRequired !== true || contract?.modes?.[MODE_STRICT]?.candidateFreshnessClaim !== true) failures.push('strictMode');
  if (contract?.modes?.[MODE_PROBE]?.expectedSourceShaRequired !== false || contract?.modes?.[MODE_PROBE]?.candidateFreshnessClaim !== false) failures.push('probeMode');
  if (failures.length) throw new Error(`Route/Hosted QA contract invalid: ${failures.join(', ')}`);
  return { pass: true };
}

export function loadRouteHostedQaContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_ROUTE_HOSTED_QA_CONTRACT,
} = {}) {
  const contract = readJson(repositoryPath(repoRoot, contractPath));
  validateRouteHostedQaContract(contract);
  return contract;
}

export function extractDeploySourceSha(message = '') {
  const match = String(message).trim().match(/([0-9a-f]{40})$/i);
  return match ? match[1].toLowerCase() : null;
}

function canonicalAppPath(route) {
  if (route === '/') return '/';
  return `/${String(route).replace(/^\/+|\/+$/g, '')}/`;
}

export function buildHostedPlan(contract) {
  const publicPaths = contract.routes.public.map(canonicalAppPath);
  const detailPaths = [
    ...contract.routes.detailFixtures.heroes.map(id => `/heroes/${id}/`),
    ...contract.routes.detailFixtures.soldiers.map(id => `/soldiers/${id}/`),
    ...contract.routes.detailFixtures.equipment.map(id => `/equipment/${id}/`),
  ];
  const negativeId = contract.routes.negativeId;
  const negativePaths = [
    `/heroes/${negativeId}/`,
    `/soldiers/${negativeId}/`,
    `/equipment/${negativeId}/`,
  ];
  return { publicPaths, detailPaths, negativePaths };
}

function hostedUrl(baseUrl, appPath, trailingSlash = true) {
  if (appPath === '/') return baseUrl;
  const normalized = String(appPath).replace(/^\/+|\/+$/g, '');
  return new URL(`${normalized}${trailingSlash ? '/' : ''}`, baseUrl).toString();
}

function readAttr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? match[1] : null;
}

export function extractAssetReferences(html, documentUrl, maxRepresentativeImages = 12) {
  const refs = [];
  let imageCount = 0;
  for (const match of String(html).matchAll(/<(script|link|img)\b[^>]*>/gi)) {
    const kind = match[1].toLowerCase();
    const tag = match[0];
    if (kind === 'script') {
      const src = readAttr(tag, 'src');
      if (src) refs.push({ kind: 'script', value: src, priority: 0 });
      continue;
    }
    if (kind === 'link') {
      const href = readAttr(tag, 'href');
      const rel = (readAttr(tag, 'rel') ?? '').toLowerCase();
      if (!href) continue;
      if (/\bstylesheet\b/.test(rel)) refs.push({ kind: 'stylesheet', value: href, priority: 0 });
      else if (/\bmodulepreload\b/.test(rel)) refs.push({ kind: 'modulepreload', value: href, priority: 1 });
      else if (/\bpreload\b/.test(rel)) refs.push({ kind: 'preload', value: href, priority: 2 });
      else if (/\bicon\b/.test(rel)) refs.push({ kind: 'icon', value: href, priority: 0 });
      continue;
    }
    const src = readAttr(tag, 'src');
    if (src && imageCount < maxRepresentativeImages) {
      refs.push({ kind: 'representative-image', value: src, priority: 3 });
      imageCount += 1;
    }
  }

  return refs
    .filter(ref => !/^(data:|javascript:|mailto:|#)/i.test(ref.value))
    .map(ref => {
      try {
        return { ...ref, url: new URL(ref.value, documentUrl).toString() };
      } catch {
        return { ...ref, url: null };
      }
    });
}

function appendCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('__hosted_qa', `${Date.now()}-${requestCounter++}`);
  return parsed.toString();
}

async function request(fetchImpl, url, timeoutMs, { expectText = true, github = false } = {}) {
  const requestUrl = appendCacheBust(url);
  const headers = {
    'cache-control': 'no-cache, no-store, must-revalidate',
    pragma: 'no-cache',
    'user-agent': 'langrisser-route-hosted-qa/2',
  };
  if (github && process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const response = await fetchImpl(requestUrl, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = expectText ? await response.text() : '';
    return {
      ok: Boolean(response.ok),
      status: Number(response.status ?? 0),
      url: response.url || requestUrl,
      contentType: response.headers?.get?.('content-type') ?? '',
      text,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: requestUrl,
      contentType: '',
      text: '',
      error: String(error?.message ?? error),
    };
  }
}

function htmlPass(response) {
  return response.status === 200 && /text\/html/i.test(response.contentType) && response.text.length > 0;
}

function underRepositoryBase(url, contract) {
  const parsed = new URL(url);
  return parsed.origin === contract.hostedTarget.origin && parsed.pathname.startsWith(contract.hostedTarget.repositoryBase);
}

function validateInvocation({ contract, mode, expectedSourceSha, baseUrl, maxAssets }) {
  if (![MODE_STRICT, MODE_PROBE].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
  if (mode === MODE_STRICT && !SHA40.test(expectedSourceSha ?? '')) {
    throw new Error('STRICT_CANDIDATE requires an explicit 40-hex expected source SHA.');
  }
  const parsedBase = new URL(baseUrl);
  if (parsedBase.protocol !== 'https:' || parsedBase.origin !== contract.hostedTarget.origin || !parsedBase.pathname.startsWith(contract.hostedTarget.repositoryBase)) {
    throw new Error(`Base URL is outside the frozen hosted target: ${baseUrl}`);
  }
  if (!Number.isInteger(maxAssets) || maxAssets <= 0 || maxAssets > contract.runtime.maxAssetRequests) {
    throw new Error(`maxAssets must be an integer from 1 to ${contract.runtime.maxAssetRequests}.`);
  }
}

export async function runRouteHostedQa(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const contract = loadRouteHostedQaContract({ repoRoot });
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  const mode = options.mode ?? MODE_STRICT;
  const expectedSourceSha = options.expectedSourceSha?.toLowerCase?.() ?? null;
  const baseUrl = options.baseUrl ?? contract.hostedTarget.baseUrl;
  const maxAssets = options.maxAssets ?? contract.runtime.maxAssetRequests;
  validateInvocation({ contract, mode, expectedSourceSha, baseUrl, maxAssets });

  const plan = buildHostedPlan(contract);
  const checkMap = new Map();
  const addCheck = (id, pass, details) => checkMap.set(id, { id, pass: Boolean(pass), details });
  const timeoutMs = contract.runtime.requestTimeoutMs;

  const branchResponse = await request(fetchImpl, contract.freshness.githubBranchApi, timeoutMs, { github: true });
  let deployment = {
    branchApiStatus: branchResponse.status,
    ghPagesCommitSha: null,
    commitMessage: null,
    deployedSourceSha: null,
  };
  if (branchResponse.status === 200) {
    try {
      const branch = JSON.parse(branchResponse.text);
      const message = branch?.commit?.commit?.message ?? null;
      deployment = {
        branchApiStatus: branchResponse.status,
        ghPagesCommitSha: branch?.commit?.sha ?? null,
        commitMessage: message,
        deployedSourceSha: extractDeploySourceSha(message),
      };
    } catch (error) {
      deployment.parseError = String(error?.message ?? error);
    }
  }

  const deployedShaValid = SHA40.test(deployment.deployedSourceSha ?? '');
  const freshnessPass = branchResponse.status === 200 && deployedShaValid && (
    mode === MODE_PROBE || deployment.deployedSourceSha === expectedSourceSha
  );
  addCheck('DEPLOYED_COMMIT_FRESHNESS', freshnessPass, {
    mode,
    candidateFreshnessClaim: contract.modes[mode].candidateFreshnessClaim,
    expectedSourceSha: mode === MODE_STRICT ? expectedSourceSha : null,
    ...deployment,
  });

  const documents = [];
  const publicResults = [];
  for (const appPath of plan.publicPaths) {
    const response = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    const pass = htmlPass(response) && underRepositoryBase(response.url, contract);
    publicResults.push({ appPath, status: response.status, finalUrl: response.url, pass });
    if (htmlPass(response)) documents.push({ role: 'public', appPath, url: response.url, html: response.text });
  }
  addCheck('PUBLIC_ROUTE_RESOLUTION', publicResults.every(entry => entry.pass), { routes: publicResults });

  const detailResults = [];
  const refreshResults = [];
  for (const appPath of plan.detailPaths) {
    const first = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    const firstPass = htmlPass(first) && underRepositoryBase(first.url, contract);
    detailResults.push({ appPath, status: first.status, finalUrl: first.url, pass: firstPass });
    if (htmlPass(first)) documents.push({ role: 'detail', appPath, url: first.url, html: first.text });

    const second = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    const secondPass = htmlPass(second) && underRepositoryBase(second.url, contract);
    refreshResults.push({ appPath, firstStatus: first.status, secondStatus: second.status, pass: firstPass && secondPass });
  }
  addCheck('DETAIL_DIRECT_ENTRY', detailResults.every(entry => entry.pass), { routes: detailResults });
  addCheck('REFRESH_EQUIVALENT_GET', refreshResults.every(entry => entry.pass), { routes: refreshResults });

  const trailingResults = [];
  for (const appPath of [...plan.publicPaths.filter(item => item !== '/'), ...plan.detailPaths]) {
    const response = await request(fetchImpl, hostedUrl(baseUrl, appPath, false), timeoutMs);
    let pathname = null;
    try {
      pathname = new URL(response.url).pathname;
    } catch {}
    const pass = response.status === 200 && Boolean(pathname?.endsWith('/')) && underRepositoryBase(response.url, contract);
    trailingResults.push({ appPath, status: response.status, finalUrl: response.url, finalPathname: pathname, pass });
  }
  addCheck('TRAILING_SLASH_POLICY', trailingResults.every(entry => entry.pass), { routes: trailingResults });

  const negativeResults = [];
  for (const appPath of plan.negativePaths) {
    const response = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    negativeResults.push({
      appPath,
      status: response.status,
      finalUrl: response.url,
      pass: response.status === contract.routes.negativeExpectedStatus,
    });
  }

  const references = [];
  for (const document of documents) {
    for (const ref of extractAssetReferences(document.html, document.url)) {
      references.push({ ...ref, sourceDocument: document.appPath });
    }
  }

  const refsByUrl = new Map();
  for (const ref of references.filter(item => item.url)) {
    const existing = refsByUrl.get(ref.url);
    if (!existing || ref.priority < existing.priority) refsByUrl.set(ref.url, ref);
  }
  const prioritized = [...refsByUrl.values()].sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url));
  const sameOriginRefs = prioritized.filter(ref => new URL(ref.url).origin === contract.hostedTarget.origin);
  const baseViolations = sameOriginRefs.filter(ref => !underRepositoryBase(ref.url, contract));
  addCheck('REPOSITORY_BASE_PATH', publicResults.every(entry => entry.pass) && detailResults.every(entry => entry.pass) && baseViolations.length === 0, {
    baseUrl,
    baseViolationCount: baseViolations.length,
    baseViolations: baseViolations.slice(0, 20).map(ref => ({ kind: ref.kind, url: ref.url, sourceDocument: ref.sourceDocument })),
  });

  const assetResults = [];
  for (const ref of sameOriginRefs.slice(0, maxAssets)) {
    const response = await request(fetchImpl, ref.url, timeoutMs, { expectText: false });
    assetResults.push({
      kind: ref.kind,
      url: ref.url,
      status: response.status,
      pass: response.status >= 200 && response.status < 300,
    });
  }
  const assetsPass = assetResults.length > 0 && assetResults.every(entry => entry.pass) && baseViolations.length === 0;
  addCheck('ASSET_AND_CHUNK_RESOLUTION', assetsPass, {
    discovered: sameOriginRefs.length,
    checked: assetResults.length,
    maxAssets,
    assets: assetResults,
  });
  addCheck('FILENAME_CASE_SENSITIVITY', assetsPass, {
    policy: 'exact-emitted-url-only-no-case-fallback',
    failedExactAssetUrls: assetResults.filter(entry => !entry.pass).map(entry => entry.url),
  });

  const routeParityPass = publicResults.every(entry => entry.pass)
    && detailResults.every(entry => entry.pass)
    && negativeResults.every(entry => entry.pass);
  addCheck('ROUTE_TREE_HOSTED_PARITY', routeParityPass, {
    scope: 'frozen-public-routes-plus-representative-detail-fixtures',
    publicRouteCount: publicResults.length,
    detailFixtureCount: detailResults.length,
    negativeRoutes: negativeResults,
  });

  const stalePass = branchResponse.status === 200
    && refreshResults.every(entry => entry.pass)
    && (mode === MODE_PROBE || freshnessPass);
  addCheck('STALE_DEPLOY_OR_CACHE', stalePass, {
    mode,
    noStoreHeaders: true,
    uniqueQueryPerRequest: true,
    strictFreshnessRequired: mode === MODE_STRICT,
    deployedSourceSha: deployment.deployedSourceSha,
  });

  const checks = contract.checkIds.map(id => checkMap.get(id) ?? ({ id, pass: false, details: { missingCheckImplementation: true } }));
  const failed = checks.filter(entry => !entry.pass);
  const status = failed.length === 0 ? contract.modes[mode].passStatus : contract.failurePolicy.failedStatus;

  return {
    version: 1,
    schemaId: 'route-hosted-qa-result/v1',
    stage: 'RH3',
    mode,
    status,
    exitCode: failed.length === 0 ? 0 : contract.failurePolicy.hostedFailureExitCode,
    classification: failed.length === 0 ? null : contract.failurePolicy.classification,
    candidateFreshnessClaim: contract.modes[mode].candidateFreshnessClaim,
    semanticStageReopened: false,
    target: { baseUrl, repositoryBase: contract.hostedTarget.repositoryBase },
    deployment,
    summary: {
      checkCount: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      publicRoutes: publicResults.length,
      detailFixtures: detailResults.length,
      refreshFixtures: refreshResults.length,
      trailingSlashChecks: trailingResults.length,
      negativeChecks: negativeResults.length,
      discoveredSameOriginAssets: sameOriginRefs.length,
      checkedAssets: assetResults.length,
    },
    checks,
  };
}
