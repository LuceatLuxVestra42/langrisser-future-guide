#!/usr/bin/env node
import process from 'node:process';
import {
  buildHostedPlan,
  extractAssetReferences,
  loadRouteHostedQaContract,
} from '../lib/hosted-qa.mjs';

const SHA40 = /^[0-9a-f]{40}$/i;
const SOURCE_REPOSITORY = 'LuceatLuxVestra42/langrisser-future-guide';
const PREVIEW_ORIGIN = 'https://luceatluxvestra42.github.io';
const PREVIEW_REPOSITORY_BASE = '/Data/';
const MANIFEST = 'preview-source.json';
let requestCounter = 0;

function parseArgs(argv) {
  const out = { pr: null, expectedSha: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pr') out.pr = Number(argv[++i]);
    else if (argv[i] === '--expected-sha') out.expectedSha = String(argv[++i] ?? '').toLowerCase();
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!Number.isInteger(out.pr) || out.pr <= 0) throw new Error('--pr must be a positive integer.');
  if (!SHA40.test(out.expectedSha ?? '')) throw new Error('--expected-sha must be an explicit 40-hex SHA.');
  return out;
}

function cacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set('__preview_qa', `${Date.now()}-${requestCounter++}`);
  return parsed.toString();
}

async function request(url, timeoutMs) {
  const response = await fetch(cacheBust(url), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'cache-control': 'no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
      'user-agent': 'langrisser-route-hosted-preview-qa/1',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    url: response.url,
    contentType: response.headers.get('content-type') ?? '',
    text,
  };
}

function htmlPass(response) {
  return response.status === 200 && /text\/html/i.test(response.contentType) && response.text.length > 0;
}

function withinPreview(url, previewBase) {
  const parsed = new URL(url);
  const base = new URL(previewBase);
  return parsed.origin === PREVIEW_ORIGIN && parsed.pathname.startsWith(base.pathname);
}

function routeUrl(previewBase, appPath, trailingSlash = true) {
  if (appPath === '/') return previewBase;
  const path = String(appPath).replace(/^\/+|\/+$/g, '');
  return new URL(`${path}${trailingSlash ? '/' : ''}`, previewBase).toString();
}

function flipCaseInPath(url) {
  const parsed = new URL(url);
  const chars = [...parsed.pathname];
  const index = chars.findIndex(ch => /[a-z]/.test(ch));
  if (index < 0) return null;
  chars[index] = chars[index].toUpperCase();
  parsed.pathname = chars.join('');
  return parsed.toString();
}

async function main() {
  const { pr, expectedSha } = parseArgs(process.argv.slice(2));
  const contract = loadRouteHostedQaContract();
  const timeoutMs = contract.runtime.requestTimeoutMs;
  const maxAssets = contract.runtime.maxAssetRequests;
  const previewBase = `${PREVIEW_ORIGIN}${PREVIEW_REPOSITORY_BASE}pr-${pr}/`;
  const plan = buildHostedPlan(contract);
  const checks = [];
  const add = (id, pass, details) => checks.push({ id, pass: Boolean(pass), details });

  if (!previewBase.startsWith(`${PREVIEW_ORIGIN}${PREVIEW_REPOSITORY_BASE}pr-`)) {
    throw new Error('Preview target escaped the admitted Data Pages root.');
  }

  const manifestResponses = [];
  for (let i = 0; i < 2; i += 1) {
    manifestResponses.push(await request(new URL(MANIFEST, previewBase).toString(), timeoutMs));
  }
  let manifest = null;
  try {
    manifest = JSON.parse(manifestResponses[0].text);
  } catch {}
  const manifestPass = manifestResponses.every(item => item.status === 200) &&
    manifest?.status === 'PR_PREVIEW_DEPLOYMENT' &&
    manifest?.sourceRepository === SOURCE_REPOSITORY &&
    String(manifest?.sourceSha ?? '').toLowerCase() === expectedSha &&
    Number(manifest?.pullRequest) === pr &&
    manifest?.publisher === '.github/workflows/project-tooling-route-hosted-qa.yml';
  add('DEPLOYED_COMMIT_FRESHNESS', manifestPass, {
    expectedSourceSha: expectedSha,
    pullRequest: pr,
    previewBase,
    manifest,
    statuses: manifestResponses.map(item => item.status),
  });
  add('STALE_DEPLOY_OR_CACHE', manifestPass && manifestResponses[0].text === manifestResponses[1].text, {
    repeatedManifestExact: manifestResponses[0].text === manifestResponses[1].text,
  });

  const documents = [];
  const publicResults = [];
  for (const appPath of plan.publicPaths) {
    const response = await request(routeUrl(previewBase, appPath), timeoutMs);
    const pass = htmlPass(response) && withinPreview(response.url, previewBase);
    publicResults.push({ appPath, status: response.status, finalUrl: response.url, pass });
    if (htmlPass(response)) documents.push({ appPath, url: response.url, html: response.text });
  }
  add('PUBLIC_ROUTE_RESOLUTION', publicResults.every(item => item.pass), { routes: publicResults });

  const detailResults = [];
  const refreshResults = [];
  for (const appPath of plan.detailPaths) {
    const first = await request(routeUrl(previewBase, appPath), timeoutMs);
    const second = await request(routeUrl(previewBase, appPath), timeoutMs);
    const firstPass = htmlPass(first) && withinPreview(first.url, previewBase);
    const secondPass = htmlPass(second) && withinPreview(second.url, previewBase);
    detailResults.push({ appPath, status: first.status, finalUrl: first.url, pass: firstPass });
    refreshResults.push({ appPath, firstStatus: first.status, secondStatus: second.status, pass: firstPass && secondPass });
    if (htmlPass(first)) documents.push({ appPath, url: first.url, html: first.text });
  }
  add('DETAIL_DIRECT_ENTRY', detailResults.every(item => item.pass), { routes: detailResults });
  add('REFRESH_EQUIVALENT_GET', refreshResults.every(item => item.pass), { routes: refreshResults });

  const trailingResults = [];
  for (const appPath of [...plan.publicPaths.filter(item => item !== '/'), ...plan.detailPaths]) {
    const response = await request(routeUrl(previewBase, appPath, false), timeoutMs);
    const pathname = new URL(response.url).pathname;
    trailingResults.push({ appPath, status: response.status, finalUrl: response.url, pass: response.status === 200 && pathname.endsWith('/') && withinPreview(response.url, previewBase) });
  }
  add('TRAILING_SLASH_POLICY', trailingResults.every(item => item.pass), { routes: trailingResults });

  const negativeResults = [];
  for (const appPath of plan.negativePaths) {
    const response = await request(routeUrl(previewBase, appPath), timeoutMs);
    negativeResults.push({ appPath, status: response.status, pass: response.status === contract.routes.negativeExpectedStatus });
  }

  const refs = [];
  for (const document of documents) {
    for (const ref of extractAssetReferences(document.html, document.url)) refs.push({ ...ref, sourceDocument: document.appPath });
  }
  const byUrl = new Map();
  for (const ref of refs.filter(item => item.url)) {
    const old = byUrl.get(ref.url);
    if (!old || ref.priority < old.priority) byUrl.set(ref.url, ref);
  }
  const prioritized = [...byUrl.values()].sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url));
  const sameOrigin = prioritized.filter(ref => new URL(ref.url).origin === PREVIEW_ORIGIN);
  const baseViolations = sameOrigin.filter(ref => !withinPreview(ref.url, previewBase));
  const routeViolations = [...publicResults, ...detailResults].filter(item => !withinPreview(item.finalUrl, previewBase));
  add('REPOSITORY_BASE_PATH', baseViolations.length === 0 && routeViolations.length === 0, {
    previewBase,
    assetBaseViolations: baseViolations.slice(0, 20),
    routeBaseViolations: routeViolations.slice(0, 20),
  });

  const assetResults = [];
  for (const ref of sameOrigin.filter(ref => withinPreview(ref.url, previewBase)).slice(0, maxAssets)) {
    const response = await request(ref.url, timeoutMs);
    assetResults.push({ kind: ref.kind, url: ref.url, status: response.status, pass: response.status === 200 });
  }
  add('ASSET_AND_CHUNK_RESOLUTION', assetResults.length > 0 && assetResults.every(item => item.pass), {
    checked: assetResults.length,
    assets: assetResults,
  });

  const caseCandidate = assetResults.find(item => /[a-z]/.test(new URL(item.url).pathname));
  let caseResult = { candidate: null, mutated: null, status: null, pass: true, skipped: true };
  if (caseCandidate) {
    const mutated = flipCaseInPath(caseCandidate.url);
    if (mutated && mutated !== caseCandidate.url) {
      const response = await request(mutated, timeoutMs);
      caseResult = { candidate: caseCandidate.url, mutated, status: response.status, pass: response.status !== 200, skipped: false };
    }
  }
  add('FILENAME_CASE_SENSITIVITY', caseResult.pass, caseResult);

  add('ROUTE_TREE_HOSTED_PARITY',
    publicResults.length === plan.publicPaths.length && detailResults.length === plan.detailPaths.length && negativeResults.length === plan.negativePaths.length && negativeResults.every(item => item.pass),
    {
      publicExpected: plan.publicPaths.length,
      publicActual: publicResults.length,
      detailExpected: plan.detailPaths.length,
      detailActual: detailResults.length,
      negativeExpected: plan.negativePaths.length,
      negativeActual: negativeResults.length,
      negativeResults,
    },
  );

  const ordered = contract.checkIds.map(id => checks.find(item => item.id === id) ?? { id, pass: false, details: { missingCheck: true } });
  const failed = ordered.filter(item => !item.pass);
  const result = {
    status: failed.length === 0 ? 'PASS_ROUTE_HOSTED_QA_STRICT_PREVIEW' : 'FAIL_ROUTE_HOSTED_QA_STRICT_PREVIEW',
    classification: failed.length === 0 ? null : 'DEPLOYMENT_HOSTING_FAIL',
    exitCode: failed.length === 0 ? 0 : 1,
    semanticStageReopened: false,
    deploymentMutation: false,
    previewBase,
    expectedSourceSha: expectedSha,
    pullRequest: pr,
    summary: { checkCount: ordered.length, failed: failed.length },
    checks: ordered,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.exitCode;
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    status: 'BLOCKER_INVALID_PREVIEW_INVOCATION',
    exitCode: 2,
    message: String(error?.message ?? error),
  }, null, 2));
  process.exitCode = 2;
}
