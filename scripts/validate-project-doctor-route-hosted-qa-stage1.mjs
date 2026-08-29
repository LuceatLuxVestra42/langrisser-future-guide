import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  buildHostedPlan,
  extractDeploySourceSha,
  runHostedQa,
} from "./run-project-doctor-route-hosted-qa-stage1.mjs";

const ROOT = process.cwd();
const STAGE0 = "data/contracts/project-doctor-route-hosted-qa-stage0.v1.json";
const STAGE0_VALIDATION = "data/validation/project-doctor-route-hosted-qa-stage0.v1.json";
const STAGE1 = "data/contracts/project-doctor-route-hosted-qa-stage1.v1.json";
const RUNNER = "scripts/run-project-doctor-route-hosted-qa-stage1.mjs";
const PACKAGE = "package.json";
const OUTPUT = "data/validation/project-doctor-route-hosted-qa-stage1.v1.json";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
const readText = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const sameSet = (left = [], right = []) => left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);

function fakeResponse(status, url, body, contentType) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    async text() { return body; },
  };
}

function createFakeFetch({ sourceSha, badRootIcon = false }) {
  return async (input) => {
    const requestUrl = new URL(String(input));
    if (requestUrl.hostname === "api.github.com") {
      const body = JSON.stringify({
        commit: {
          sha: "b".repeat(40),
          commit: { message: `Deploy fixture ${sourceSha}` },
        },
      });
      return fakeResponse(200, requestUrl.toString(), body, "application/json; charset=utf-8");
    }

    const pathname = requestUrl.pathname;
    if (pathname.includes("999999999")) return fakeResponse(404, requestUrl.toString(), "not found", "text/html; charset=utf-8");

    if (/\.(?:js|css|svg|webp|png|jpg|jpeg|ico)$/i.test(pathname)) {
      if (badRootIcon && pathname === "/favicon.ico") return fakeResponse(404, requestUrl.toString(), "", "text/plain");
      const contentType = pathname.endsWith(".css") ? "text/css" : pathname.endsWith(".js") ? "text/javascript" : "image/png";
      return fakeResponse(200, requestUrl.toString(), "asset", contentType);
    }

    let finalPath = pathname;
    const base = "/langrisser-future-guide/";
    if (finalPath.startsWith(base) && finalPath !== base && !finalPath.endsWith("/")) finalPath = `${finalPath}/`;
    const finalUrl = new URL(requestUrl.toString());
    finalUrl.pathname = finalPath;
    const iconHref = badRootIcon ? "/favicon.ico" : "/langrisser-future-guide/assets/favicon.svg";
    const html = `<!doctype html><html><head><link rel="stylesheet" href="/langrisser-future-guide/assets/app.css"><link rel="modulepreload" href="/langrisser-future-guide/assets/app.js"><link rel="icon" href="${iconHref}"></head><body><img src="/langrisser-future-guide/assets/fixture.webp"><script src="/langrisser-future-guide/assets/app.js"></script></body></html>`;
    return fakeResponse(200, finalUrl.toString(), html, "text/html; charset=utf-8");
  };
}

const stage0 = readJson(STAGE0);
const stage0Validation = readJson(STAGE0_VALIDATION);
const stage1 = readJson(STAGE1);
const runnerText = readText(RUNNER);
const pkg = readJson(PACKAGE);
const failures = [];
let checkCount = 0;
const check = (pass, code) => { checkCount += 1; if (!pass) failures.push(code); };

check(stage0.status === "DESIGN_FROZEN" && stage0Validation.status === "PASS", "PREDECESSOR_QA0_PASS");
check(stage1.schemaId === "project-doctor-route-hosted-qa-stage1/v1" && stage1.stage === "QA-1" && stage1.status === "DESIGN_FROZEN", "QA1_CONTRACT_IDENTITY");
check(stage1.toolingNamespace === "project-doctor-route-hosted-qa", "TOOLING_NAMESPACE");
check(sameSet(Object.keys(stage1.checks), stage0.hostedGateChecks), "QA0_CHECK_COVERAGE");
check(stage1.modes.strict.requiresExpectedSourceSha === true && stage1.modes.probeCurrent.strictFreshnessClaim === false, "STRICT_VS_PROBE_BOUNDARY");
check(stage1.browserBoundary.playwrightInstalled === false && !runnerText.includes("@playwright/") && !runnerText.includes("chromium.launch"), "NO_BROWSER_AUTOMATION");
check(pkg.scripts?.[stage1.runtime.packageCommand] === "node scripts/run-project-doctor-route-hosted-qa-stage1.mjs" && pkg.scripts?.["qa:hosted:validate"] === "node scripts/validate-project-doctor-route-hosted-qa-stage1.mjs --check", "PACKAGE_ALIASES");
check(extractDeploySourceSha(`Deploy fixture ${"a".repeat(40)}`) === "a".repeat(40) && extractDeploySourceSha("missing") === null, "DEPLOY_SHA_PARSER");

const plan = buildHostedPlan(stage0, stage1.negativeId);
check(plan.publicPaths.length === 6 && plan.detailPaths.length === 6 && plan.negativePaths.length === 3, "HOSTED_PLAN_COUNTS");

const fixtureStage0 = structuredClone(stage0);
fixtureStage0.hostedTarget = {
  origin: "https://example.test",
  repositoryBase: "/langrisser-future-guide/",
  baseUrl: "https://example.test/langrisser-future-guide/",
  canonicalDirectoryStyle: "TRAILING_SLASH",
};
const fixtureStage1 = structuredClone(stage1);
fixtureStage1.freshness.githubBranchApi = "https://api.github.com/repos/example/test/branches/gh-pages";
fixtureStage1.runtime.maxAssetRequests = 20;
const sourceSha = "a".repeat(40);

const success = await runHostedQa({
  stage0: fixtureStage0,
  stage1: fixtureStage1,
  fetchImpl: createFakeFetch({ sourceSha }),
  expectedSha: sourceSha,
});
check(success.status === stage1.modes.strict.passStatus && success.summary.failed === 0 && success.summary.checkCount === 10, "STRICT_SUCCESS_FIXTURE");

const failure = await runHostedQa({
  stage0: fixtureStage0,
  stage1: fixtureStage1,
  fetchImpl: createFakeFetch({ sourceSha, badRootIcon: true }),
  expectedSha: sourceSha,
});
const failureIds = failure.checks.filter((entry) => !entry.pass).map((entry) => entry.id);
check(failure.status === stage1.failurePolicy.failedStatus && failure.classification === "DEPLOYMENT_HOSTING_FAIL" && failure.semanticStageReopened === false && sameSet(failureIds, ["REPOSITORY_BASE_PATH", "ASSET_AND_CHUNK_RESOLUTION", "FILENAME_CASE_SENSITIVITY"]), "BASE_PATH_FAILURE_FIXTURE");

check(stage1.failurePolicy.classification === "DEPLOYMENT_HOSTING_FAIL" && stage1.failurePolicy.semanticReopenAllowed === false, "FAILURE_BOUNDARY");

const result = {
  version: 1,
  schemaId: "project-doctor-route-hosted-qa-stage1-validation/v1",
  stage: "QA-1",
  status: failures.length === 0 ? "PASS" : "FAIL",
  exitCode: failures.length === 0 ? 0 : 1,
  checkCount,
  failureCount: failures.length,
  failures,
  fixtures: {
    strictSuccessStatus: success.status,
    strictSuccessCheckCount: success.summary.checkCount,
    strictFailureStatus: failure.status,
    strictFailureFailedChecks: failureIds,
  },
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
const args = new Set(process.argv.slice(2));
const outputPath = path.join(ROOT, OUTPUT);
if (args.has("--write")) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
}
if (args.has("--check")) {
  if (!fs.existsSync(outputPath)) { console.error(`Missing frozen validation artifact: ${OUTPUT}`); process.exit(1); }
  if (fs.readFileSync(outputPath, "utf8") !== serialized) { console.error("Route/Hosted QA Stage 1 validation artifact is stale or mismatched."); process.exit(1); }
}
process.stdout.write(serialized);
process.exitCode = result.exitCode;
