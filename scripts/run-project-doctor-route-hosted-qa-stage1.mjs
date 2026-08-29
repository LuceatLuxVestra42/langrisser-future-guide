import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const STAGE0_CONTRACT = "data/contracts/project-doctor-route-hosted-qa-stage0.v1.json";
const STAGE1_CONTRACT = "data/contracts/project-doctor-route-hosted-qa-stage1.v1.json";
const SHA40 = /^[0-9a-f]{40}$/i;
let requestCounter = 0;

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const unique = (values) => [...new Set(values)];

export function extractDeploySourceSha(message = "") {
  const match = String(message).trim().match(/([0-9a-f]{40})$/i);
  return match ? match[1].toLowerCase() : null;
}

export function parseCliArgs(argv = []) {
  const out = { probeCurrent: false, expectedSha: null, baseUrl: null, output: null, maxAssets: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--probe-current") out.probeCurrent = true;
    else if (arg === "--expected-sha") out.expectedSha = argv[++index] ?? null;
    else if (arg === "--base-url") out.baseUrl = argv[++index] ?? null;
    else if (arg === "--output") out.output = argv[++index] ?? null;
    else if (arg === "--max-assets") out.maxAssets = Number(argv[++index]);
    else if (arg === "--help") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function canonicalAppPath(route) {
  if (route === "/") return "/";
  return `/${String(route).replace(/^\/+|\/+$/g, "")}/`;
}

function hostedUrl(baseUrl, appPath, trailingSlash = true) {
  if (appPath === "/") return baseUrl;
  const normalized = String(appPath).replace(/^\/+|\/+$/g, "");
  return new URL(`${normalized}${trailingSlash ? "/" : ""}`, baseUrl).toString();
}

export function buildHostedPlan(stage0, negativeId = 999999999) {
  const publicPaths = stage0.requiredPublicRoutes.map(canonicalAppPath);
  const detailPaths = [
    ...stage0.representativeFixtures.heroes.map((id) => `/heroes/${id}/`),
    ...stage0.representativeFixtures.soldiers.map((id) => `/soldiers/${id}/`),
    ...stage0.representativeFixtures.equipment.map((id) => `/equipment/${id}/`),
  ];
  const negativePaths = [
    `/heroes/${negativeId}/`,
    `/soldiers/${negativeId}/`,
    `/equipment/${negativeId}/`,
  ];
  return { publicPaths, detailPaths, negativePaths };
}

function readAttr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1] : null;
}

export function extractAssetReferences(html, documentUrl, maxRepresentativeImages = 12) {
  const refs = [];
  let imageCount = 0;
  for (const match of String(html).matchAll(/<(script|link|img)\b[^>]*>/gi)) {
    const kind = match[1].toLowerCase();
    const tag = match[0];
    if (kind === "script") {
      const src = readAttr(tag, "src");
      if (src) refs.push({ kind: "script", value: src, priority: 0 });
      continue;
    }
    if (kind === "link") {
      const href = readAttr(tag, "href");
      const rel = (readAttr(tag, "rel") ?? "").toLowerCase();
      if (!href) continue;
      if (/\bstylesheet\b/.test(rel)) refs.push({ kind: "stylesheet", value: href, priority: 0 });
      else if (/\bmodulepreload\b/.test(rel)) refs.push({ kind: "modulepreload", value: href, priority: 1 });
      else if (/\bpreload\b/.test(rel)) refs.push({ kind: "preload", value: href, priority: 2 });
      else if (/\bicon\b/.test(rel)) refs.push({ kind: "icon", value: href, priority: 0 });
      continue;
    }
    const src = readAttr(tag, "src");
    if (src && imageCount < maxRepresentativeImages) {
      refs.push({ kind: "representative-image", value: src, priority: 3 });
      imageCount += 1;
    }
  }

  const resolved = [];
  for (const ref of refs) {
    if (/^(data:|javascript:|mailto:|#)/i.test(ref.value)) continue;
    try {
      resolved.push({ ...ref, url: new URL(ref.value, documentUrl).toString() });
    } catch {
      resolved.push({ ...ref, url: null });
    }
  }
  return resolved;
}

function appendCacheBust(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("__hosted_qa", `${Date.now()}-${requestCounter++}`);
  return parsed.toString();
}

async function request(fetchImpl, url, timeoutMs, { redirect = "follow", expectText = true, github = false } = {}) {
  const requestUrl = appendCacheBust(url);
  const headers = {
    "cache-control": "no-cache, no-store, must-revalidate",
    pragma: "no-cache",
    "user-agent": "langrisser-route-hosted-qa/1",
  };
  if (github && process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const response = await fetchImpl(requestUrl, {
      method: "GET",
      redirect,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = expectText ? await response.text() : "";
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || requestUrl,
      contentType: response.headers?.get?.("content-type") ?? "",
      text,
      error: null,
    };
  } catch (error) {
    return { ok: false, status: 0, url: requestUrl, contentType: "", text: "", error: String(error?.message ?? error) };
  }
}

function htmlPass(response) {
  return response.status === 200 && /text\/html/i.test(response.contentType) && response.text.length > 0;
}

function underRepositoryBase(url, stage0) {
  const parsed = new URL(url);
  return parsed.origin === stage0.hostedTarget.origin && parsed.pathname.startsWith(stage0.hostedTarget.repositoryBase);
}

export async function runHostedQa(options = {}) {
  const stage0 = options.stage0 ?? readJson(STAGE0_CONTRACT);
  const stage1 = options.stage1 ?? readJson(STAGE1_CONTRACT);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const mode = options.probeCurrent ? "PROBE_CURRENT_DEPLOYED" : "STRICT";
  const timeoutMs = stage1.runtime.requestTimeoutMs;
  const maxAssets = Number.isFinite(options.maxAssets) && options.maxAssets > 0 ? Math.floor(options.maxAssets) : stage1.runtime.maxAssetRequests;
  const baseUrl = options.baseUrl ?? stage0.hostedTarget.baseUrl;
  const plan = buildHostedPlan(stage0, stage1.negativeId);
  const checks = [];
  const addCheck = (id, pass, details) => checks.push({ id, pass: Boolean(pass), details });

  const branchResponse = await request(fetchImpl, stage1.freshness.githubBranchApi, timeoutMs, { github: true });
  let deployment = { branchApiStatus: branchResponse.status, ghPagesCommitSha: null, commitMessage: null, deployedSourceSha: null };
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

  let expectedSourceSha = options.expectedSha?.toLowerCase?.() ?? null;
  if (options.probeCurrent && !expectedSourceSha) expectedSourceSha = deployment.deployedSourceSha;
  const strictExpectedValid = mode !== "STRICT" || SHA40.test(expectedSourceSha ?? "");
  const freshnessPass = branchResponse.status === 200 && SHA40.test(deployment.deployedSourceSha ?? "") && strictExpectedValid && deployment.deployedSourceSha === expectedSourceSha;
  addCheck("DEPLOYED_COMMIT_FRESHNESS", freshnessPass, {
    mode,
    strictCandidateFreshnessClaim: mode === "STRICT",
    expectedSourceSha,
    ...deployment,
  });

  const documents = [];
  const publicResults = [];
  for (const appPath of plan.publicPaths) {
    const response = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    const pass = htmlPass(response) && underRepositoryBase(response.url, stage0);
    publicResults.push({ appPath, status: response.status, finalUrl: response.url, pass });
    if (htmlPass(response)) documents.push({ role: "public", appPath, url: response.url, html: response.text });
  }
  addCheck("PUBLIC_ROUTE_RESOLUTION", publicResults.every((entry) => entry.pass), { routes: publicResults });

  const detailResults = [];
  const refreshResults = [];
  for (const appPath of plan.detailPaths) {
    const first = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    const firstPass = htmlPass(first) && underRepositoryBase(first.url, stage0);
    detailResults.push({ appPath, status: first.status, finalUrl: first.url, pass: firstPass });
    if (htmlPass(first)) documents.push({ role: "detail", appPath, url: first.url, html: first.text });
    const second = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    const secondPass = htmlPass(second) && underRepositoryBase(second.url, stage0);
    refreshResults.push({ appPath, firstStatus: first.status, secondStatus: second.status, pass: firstPass && secondPass });
  }
  addCheck("DETAIL_DIRECT_ENTRY", detailResults.every((entry) => entry.pass), { routes: detailResults });
  addCheck("REFRESH_EQUIVALENT_GET", refreshResults.every((entry) => entry.pass), { routes: refreshResults });

  const trailingResults = [];
  for (const appPath of [...plan.publicPaths.filter((entry) => entry !== "/"), ...plan.detailPaths]) {
    const response = await request(fetchImpl, hostedUrl(baseUrl, appPath, false), timeoutMs);
    let pathname = null;
    try { pathname = new URL(response.url).pathname; } catch {}
    const pass = response.status === 200 && Boolean(pathname?.endsWith("/")) && underRepositoryBase(response.url, stage0);
    trailingResults.push({ appPath, status: response.status, finalUrl: response.url, finalPathname: pathname, pass });
  }
  addCheck("TRAILING_SLASH_POLICY", trailingResults.every((entry) => entry.pass), { routes: trailingResults });

  const negativeResults = [];
  for (const appPath of plan.negativePaths) {
    const response = await request(fetchImpl, hostedUrl(baseUrl, appPath, true), timeoutMs);
    negativeResults.push({ appPath, status: response.status, finalUrl: response.url, pass: response.status === stage1.negativeExpectedStatus });
  }

  const refs = [];
  for (const document of documents) {
    for (const ref of extractAssetReferences(document.html, document.url)) refs.push({ ...ref, sourceDocument: document.appPath });
  }
  const prioritized = unique(refs.filter((ref) => ref.url).map((ref) => ref.url)).map((url) => {
    const candidates = refs.filter((ref) => ref.url === url);
    return candidates.sort((a, b) => a.priority - b.priority)[0];
  }).sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url));

  const sameOriginRefs = prioritized.filter((ref) => new URL(ref.url).origin === stage0.hostedTarget.origin);
  const baseViolations = sameOriginRefs.filter((ref) => !underRepositoryBase(ref.url, stage0));
  addCheck("REPOSITORY_BASE_PATH", publicResults.every((entry) => entry.pass) && detailResults.every((entry) => entry.pass) && baseViolations.length === 0, {
    baseUrl,
    baseViolationCount: baseViolations.length,
    baseViolations: baseViolations.slice(0, 20).map((ref) => ({ kind: ref.kind, url: ref.url, sourceDocument: ref.sourceDocument })),
  });

  const assetResults = [];
  for (const ref of sameOriginRefs.slice(0, maxAssets)) {
    const response = await request(fetchImpl, ref.url, timeoutMs, { expectText: false });
    assetResults.push({ kind: ref.kind, url: ref.url, status: response.status, pass: response.status >= 200 && response.status < 300 });
  }
  const assetsPass = assetResults.length > 0 && assetResults.every((entry) => entry.pass) && baseViolations.length === 0;
  addCheck("ASSET_AND_CHUNK_RESOLUTION", assetsPass, { discovered: sameOriginRefs.length, checked: assetResults.length, maxAssets, assets: assetResults });
  addCheck("FILENAME_CASE_SENSITIVITY", assetsPass, { policy: "exact-emitted-url-only-no-case-fallback", failedExactAssetUrls: assetResults.filter((entry) => !entry.pass).map((entry) => entry.url) });

  const routeParityPass = publicResults.every((entry) => entry.pass) && detailResults.every((entry) => entry.pass) && negativeResults.every((entry) => entry.pass);
  addCheck("ROUTE_TREE_HOSTED_PARITY", routeParityPass, {
    scope: "frozen-public-routes-plus-representative-detail-fixtures",
    publicRouteCount: publicResults.length,
    detailFixtureCount: detailResults.length,
    negativeRoutes: negativeResults,
  });

  const staleCachePass = branchResponse.status === 200 && refreshResults.every((entry) => entry.pass) && (mode === "PROBE_CURRENT_DEPLOYED" || freshnessPass);
  addCheck("STALE_DEPLOY_OR_CACHE", staleCachePass, {
    mode,
    noStoreHeaders: true,
    uniqueQueryPerRequest: true,
    strictFreshnessRequired: mode === "STRICT",
    deployedSourceSha: deployment.deployedSourceSha,
  });

  const failed = checks.filter((entry) => !entry.pass);
  const status = failed.length === 0
    ? (mode === "STRICT" ? stage1.modes.strict.passStatus : stage1.modes.probeCurrent.passStatus)
    : stage1.failurePolicy.failedStatus;

  return {
    version: 1,
    schemaId: "project-doctor-route-hosted-qa-stage1-result/v1",
    stage: "QA-1",
    mode,
    status,
    exitCode: failed.length === 0 ? 0 : stage1.failurePolicy.hostedFailureExitCode,
    classification: failed.length === 0 ? null : stage1.failurePolicy.classification,
    semanticStageReopened: false,
    target: { baseUrl, repositoryBase: stage0.hostedTarget.repositoryBase },
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

function usage() {
  return [
    "Usage:",
    "  npm run qa:hosted -- --expected-sha <40-hex-sha>",
    "  npm run qa:hosted -- --probe-current",
    "Options:",
    "  --base-url <url>   Override hosted base URL for controlled testing.",
    "  --max-assets <n>   Bound same-origin asset GET checks.",
    "  --output <path>    Also write JSON result to a local file.",
  ].join("\n");
}

async function main() {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error?.message ?? error));
    console.error(usage());
    process.exit(2);
  }
  if (cli.help) {
    console.log(usage());
    return;
  }

  const expectedSha = (cli.expectedSha ?? process.env.HOSTED_EXPECTED_SHA ?? process.env.GITHUB_SHA ?? null)?.toLowerCase?.() ?? null;
  if (!cli.probeCurrent && !SHA40.test(expectedSha ?? "")) {
    console.error("Strict hosted QA requires --expected-sha, HOSTED_EXPECTED_SHA, or GITHUB_SHA containing a 40-hex source SHA.");
    process.exit(2);
  }
  if (cli.baseUrl) {
    try { new URL(cli.baseUrl); } catch { console.error("--base-url must be a valid absolute URL."); process.exit(2); }
  }

  const result = await runHostedQa({
    probeCurrent: cli.probeCurrent,
    expectedSha,
    baseUrl: cli.baseUrl,
    maxAssets: cli.maxAssets,
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);
  if (cli.output) {
    const outputPath = path.resolve(ROOT, cli.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, serialized);
  }
  process.exitCode = result.exitCode;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
