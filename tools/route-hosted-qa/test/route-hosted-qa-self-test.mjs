import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseCliArgs } from '../cli/check.mjs';
import {
  MODE_PROBE,
  MODE_STRICT,
  buildHostedPlan,
  extractAssetReferences,
  extractDeploySourceSha,
  loadRouteHostedQaContract,
  runRouteHostedQa,
  validateRouteHostedQaContract,
} from '../lib/hosted-qa.mjs';

const repoRoot = process.cwd();
const contract = loadRouteHostedQaContract({ repoRoot });
const sourceSha = 'a'.repeat(40);
const ghPagesCommitSha = 'b'.repeat(40);
const repositoryBase = contract.hostedTarget.repositoryBase;
const origin = contract.hostedTarget.origin;

function response({ status = 200, url, contentType = 'text/html; charset=utf-8', text = '' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-type' ? contentType : null;
      },
    },
    async text() {
      return text;
    },
  };
}

const html = [
  '<!doctype html><html><head>',
  '<link rel="stylesheet" href="/langrisser-future-guide/assets/app.css">',
  '<link rel="icon" href="/langrisser-future-guide/assets/favicon.svg">',
  '<script type="module" src="/langrisser-future-guide/assets/app.js"></script>',
  '</head><body>',
  '<img src="/langrisser-future-guide/images/probe.webp" alt="probe">',
  '</body></html>',
].join('');

function finalPageUrl(requestUrl) {
  const parsed = new URL(requestUrl);
  const last = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
  const looksLikeFile = last.includes('.');
  if (!looksLikeFile && parsed.pathname.startsWith(repositoryBase) && !parsed.pathname.endsWith('/')) {
    parsed.pathname = `${parsed.pathname}/`;
  }
  return parsed.toString();
}

async function fetchMock(requestUrl) {
  const parsed = new URL(requestUrl);
  if (parsed.origin === 'https://api.github.com' && parsed.pathname.endsWith('/branches/gh-pages')) {
    return response({
      url: requestUrl,
      contentType: 'application/json',
      text: JSON.stringify({
        commit: {
          sha: ghPagesCommitSha,
          commit: { message: `deploy ${sourceSha}` },
        },
      }),
    });
  }

  if (parsed.origin !== origin || !parsed.pathname.startsWith(repositoryBase)) {
    return response({ status: 404, url: requestUrl, text: 'outside target' });
  }
  if (parsed.pathname.includes(String(contract.routes.negativeId))) {
    return response({ status: 404, url: requestUrl, text: 'not found' });
  }
  if (/\.(?:js|css|svg|webp)$/.test(parsed.pathname)) {
    return response({
      status: 200,
      url: requestUrl,
      contentType: 'application/octet-stream',
      text: '',
    });
  }
  return response({ status: 200, url: finalPageUrl(requestUrl), text: html });
}

assert.deepEqual(validateRouteHostedQaContract(contract), { pass: true });
assert.equal(contract.schemaId, 'route-hosted-qa-contract/v1');
assert.equal(contract.boundaries.oldProjectDoctorRuntimeDependency, false);
assert.equal(contract.boundaries.deploymentWriterAuthority, false);
assert.equal(contract.boundaries.ghPagesWriteAllowed, false);
assert.equal(contract.boundaries.semanticAuthority, false);
assert.equal(contract.runtime.browserLaunch, false);
assert.equal(contract.runtime.playwright, false);
assert.equal(contract.checkIds.length, 10);
assert.equal(new Set(contract.checkIds).size, 10);

const plan = buildHostedPlan(contract);
assert.equal(plan.publicPaths.length, 6);
assert.equal(plan.detailPaths.length, 6);
assert.equal(plan.negativePaths.length, 3);
assert.deepEqual(plan.publicPaths, ['/', '/banners/', '/equipment/', '/equipment/exclusive/', '/heroes/', '/soldiers/']);
assert.deepEqual(plan.detailPaths, ['/heroes/6/', '/soldiers/300/', '/soldiers/1000/', '/soldiers/102/', '/soldiers/5621/', '/equipment/13/']);

assert.equal(extractDeploySourceSha(`deploy ${sourceSha}`), sourceSha);
assert.equal(extractDeploySourceSha('no source sha here'), null);
const refs = extractAssetReferences(html, contract.hostedTarget.baseUrl);
assert.deepEqual([...new Set(refs.map(item => item.kind))].sort(), ['icon', 'representative-image', 'script', 'stylesheet']);
assert.equal(refs.every(item => item.url.startsWith(`${origin}${repositoryBase}`)), true);

assert.deepEqual(parseCliArgs(['--probe-current']), {
  mode: MODE_PROBE,
  expectedSourceSha: null,
  baseUrl: null,
  maxAssets: null,
  help: false,
});
assert.equal(parseCliArgs(['--expected-sha', sourceSha]).mode, MODE_STRICT);
assert.throws(() => parseCliArgs(['--unknown']), /Unknown argument/);

const strictResult = await runRouteHostedQa({
  repoRoot,
  mode: MODE_STRICT,
  expectedSourceSha: sourceSha,
  fetchImpl: fetchMock,
});
assert.equal(strictResult.exitCode, 0);
assert.equal(strictResult.status, contract.modes[MODE_STRICT].passStatus);
assert.equal(strictResult.classification, null);
assert.equal(strictResult.candidateFreshnessClaim, true);
assert.equal(strictResult.semanticStageReopened, false);
assert.equal(strictResult.summary.checkCount, 10);
assert.equal(strictResult.summary.failed, 0);
assert.equal(strictResult.summary.publicRoutes, 6);
assert.equal(strictResult.summary.detailFixtures, 6);
assert.equal(strictResult.summary.negativeChecks, 3);
assert.deepEqual(strictResult.checks.map(item => item.id), contract.checkIds);
assert.equal(strictResult.checks.every(item => item.pass), true);

const probeResult = await runRouteHostedQa({
  repoRoot,
  mode: MODE_PROBE,
  fetchImpl: fetchMock,
});
assert.equal(probeResult.exitCode, 0);
assert.equal(probeResult.status, contract.modes[MODE_PROBE].passStatus);
assert.equal(probeResult.candidateFreshnessClaim, false);
assert.equal(probeResult.checks[0].details.candidateFreshnessClaim, false);
assert.equal(probeResult.checks[0].details.expectedSourceSha, null);
assert.equal(probeResult.summary.failed, 0);

const staleResult = await runRouteHostedQa({
  repoRoot,
  mode: MODE_STRICT,
  expectedSourceSha: 'c'.repeat(40),
  fetchImpl: fetchMock,
});
assert.equal(staleResult.exitCode, 1);
assert.equal(staleResult.status, contract.failurePolicy.failedStatus);
assert.equal(staleResult.classification, 'DEPLOYMENT_HOSTING_FAIL');
assert.equal(staleResult.semanticStageReopened, false);
assert.deepEqual(staleResult.checks.filter(item => !item.pass).map(item => item.id), [
  'DEPLOYED_COMMIT_FRESHNESS',
  'STALE_DEPLOY_OR_CACHE',
]);

await assert.rejects(
  () => runRouteHostedQa({ repoRoot, mode: MODE_STRICT, fetchImpl: fetchMock }),
  /requires an explicit 40-hex expected source SHA/,
);
await assert.rejects(
  () => runRouteHostedQa({ repoRoot, mode: MODE_PROBE, baseUrl: 'https://example.com/', fetchImpl: fetchMock }),
  /outside the frozen hosted target/,
);

for (const relativePath of [
  'tools/route-hosted-qa/contracts/hosted.v1.json',
  'tools/route-hosted-qa/lib/hosted-qa.mjs',
  'tools/route-hosted-qa/cli/check.mjs',
]) {
  const text = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  assert.equal(text.includes('project-doctor-route-hosted-qa'), false, `${relativePath} must not depend on OLD Route/Hosted QA runtime`);
}
const runtimeText = fs.readFileSync(path.join(repoRoot, 'tools/route-hosted-qa/lib/hosted-qa.mjs'), 'utf8');
for (const forbiddenToken of ['writeFile', 'appendFile', 'child_process', 'playwright', 'gh-pages']) {
  assert.equal(runtimeText.includes(forbiddenToken), false, `NEW Route/Hosted QA runtime must remain read-only: ${forbiddenToken}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'ROUTE_HOSTED_QA_RH3_SELF_TEST',
  deterministicModes: [MODE_STRICT, MODE_PROBE],
  hostedCheckCount: contract.checkIds.length,
  publicRouteCount: plan.publicPaths.length,
  detailFixtureCount: plan.detailPaths.length,
  negativeRouteCount: plan.negativePaths.length,
  boundaries: {
    oldProjectDoctorRuntimeDependencyCount: 0,
    deploymentMutationCount: 0,
    browserLaunchCount: 0,
    semanticReopenCount: 0,
  },
}, null, 2));
