import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "data/contracts/project-doctor-route-hosted-qa-stage3.v1.json");
const stage2ContractPath = path.join(root, "data/contracts/project-doctor-route-hosted-qa-stage2.v1.json");
const packagePath = path.join(root, "package.json");
const configPath = path.join(root, "playwright.route-hosted-stage3.config.ts");
const specPath = path.join(root, "tests/route-hosted-browser/stage3.spec.ts");
const outputPath = path.join(root, "data/validation/project-doctor-route-hosted-qa-stage3.v1.json");

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const check = args.has("--check") || !write;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const contract = readJson(contractPath);
const stage2 = readJson(stage2ContractPath);
const pkg = readJson(packagePath);
const config = fs.readFileSync(configPath, "utf8");
const spec = fs.readFileSync(specPath, "utf8");

const requiredChecks = [
  "HOSTED_FRESHNESS_PRECONDITION",
  "HOME_HERO_DETAIL_DOCUMENT_HISTORY",
  "HERO_BACK_FORWARD_CONTENT_PARITY",
  "SOLDIER_MODAL_BROWSER_HISTORY",
  "SOLDIER_MODAL_FILTER_STATE_HISTORY",
  "UNKNOWN_ID_RECOVERY_HISTORY",
  "REPOSITORY_BASE_NAVIGATION_TARGETS",
  "NO_FETCH_XHR_HTTP_ERROR_LEAK",
  "CONSOLE_PAGEERROR_CLEAN_ACROSS_NAVIGATION",
  "MOBILE_BROWSER_HISTORY",
];

const checks = [];
function verify(id, fn) {
  try {
    fn();
    checks.push({ id, pass: true });
  } catch (error) {
    checks.push({ id, pass: false, message: error instanceof Error ? error.message : String(error) });
  }
}

verify("CONTRACT_IDENTITY", () => {
  assert(contract.schemaVersion === "route-hosted-qa-stage3.v1", "unexpected QA-3 schemaVersion");
  assert(contract.stage === "QA-3", "unexpected stage");
  assert(contract.status === "NAVIGATION_HISTORY_CONSOLE_CONTRACT_FROZEN", "unexpected QA-3 status");
});

verify("QA2_PREDECESSOR_PROOF", () => {
  assert(stage2.status === "BROWSER_UI_CONTRACT_FROZEN", "QA-2 contract is not frozen");
  assert(contract.predecessor?.stage === "QA-2", "QA-2 predecessor missing");
  assert(
    contract.predecessor?.proofHeadSha === "3f0dea6065059cab63d28b5705d93c7b6544df14",
    "QA-2 proof HEAD mismatch",
  );
  assert(contract.predecessor?.proofRunId === 33229809974, "QA-2 proof run mismatch");
  assert(contract.predecessor?.proofConclusion === "success", "QA-2 proof conclusion mismatch");
});

verify("PLAYWRIGHT_REUSED", () => {
  assert(pkg.devDependencies?.["@playwright/test"] === "1.62.1", "@playwright/test pin changed");
  assert(contract.runtime?.version === "1.62.1", "QA-3 Playwright version mismatch");
  assert(contract.runtime?.browser === "chromium", "QA-3 browser must remain Chromium");
  assert(config.includes('browserName: "chromium"'), "Chromium config missing");
  assert(!config.includes('browserName: "firefox"'), "Firefox must remain deferred");
  assert(!config.includes('browserName: "webkit"'), "WebKit must remain deferred");
});

verify("PACKAGE_COMMANDS", () => {
  assert(
    pkg.scripts?.["qa:browser:stage3"] === "playwright test -c playwright.route-hosted-stage3.config.ts",
    "qa:browser:stage3 command mismatch",
  );
  assert(
    pkg.scripts?.["qa:browser:stage3:validate"] ===
      "node scripts/validate-project-doctor-route-hosted-qa-stage3.mjs --check",
    "qa:browser:stage3:validate command mismatch",
  );
});

verify("DEEP_HISTORY_COVERAGE", () => {
  assert(spec.includes('getByRole("link", { name: "캐릭터" })'), "home → Hero navigation missing");
  assert(spec.includes("page.goBack"), "browser back coverage missing");
  assert(spec.includes("page.goForward"), "browser forward coverage missing");
  assert(spec.includes("/heroes/6/"), "Hero 6 document target missing");
});

verify("SOLDIER_MODAL_HISTORY_COVERAGE", () => {
  assert(spec.includes('name: "중장 창병 상세 보기"'), "Soldier 102 navigation fixture missing");
  assert(spec.includes('getByRole("dialog")'), "Soldier modal assertion missing");
  assert(spec.includes('toHaveValue("중장 창병")'), "Soldier filter history preservation missing");
});

verify("UNKNOWN_ID_RECOVERY_COVERAGE", () => {
  assert(spec.includes("heroes/999999/"), "unknown Hero fixture missing");
  assert(spec.includes('name: "메인으로 돌아가기"'), "404 recovery link assertion missing");
  assert(spec.includes("response!.status()).toBe(404)"), "expected 404 status assertion missing");
});

verify("NETWORK_AND_RUNTIME_GUARD", () => {
  assert(spec.includes('["document", "fetch", "xhr", "script", "stylesheet"]'), "network resource guard incomplete");
  assert(spec.includes("response.status() < 400"), "HTTP error response guard missing");
  assert(spec.includes('page.on("pageerror"'), "pageerror guard missing");
  assert(spec.includes('message.type() !== "error"'), "console.error guard missing");
  assert(spec.includes('page.on("requestfailed"'), "requestfailed guard missing");
});

verify("REPOSITORY_BASE_AND_MOBILE", () => {
  assert(spec.includes('REPOSITORY_BASE = "/langrisser-future-guide/"'), "repository-base guard missing");
  assert(spec.includes('testInfo.project.name !== "chromium-mobile"'), "mobile project coverage missing");
  assert(spec.includes(".tap()"), "mobile touch navigation missing");
});

verify("FAILURE_BOUNDARY", () => {
  assert(contract.failure?.browserUi === "BROWSER_UI_FAIL", "Browser/UI failure code mismatch");
  assert(contract.failure?.semanticReopenAllowed === false, "semantic reopen must remain false");
  assert(contract.networkPolicy?.serverFunctionRuntimeFallbackAllowed === false, "server-function fallback must remain forbidden");
  assert(JSON.stringify(contract.checks) === JSON.stringify(requiredChecks), "QA-3 check contract mismatch");
});

const failed = checks.filter((item) => !item.pass);
const result = {
  schemaVersion: "route-hosted-qa-stage3-validation.v1",
  stage: "QA-3",
  status: failed.length === 0 ? "PASS_ROUTE_HOSTED_QA_STAGE3_CONTRACT" : "FAIL_ROUTE_HOSTED_QA_STAGE3_CONTRACT",
  completion: failed.length === 0 ? "COMPLETE" : "INCOMPLETE",
  summary: {
    checkCount: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    playwrightVersion: contract.runtime.version,
    browser: contract.runtime.browser,
    projectCount: contract.projects.length,
    navigationCheckCount: contract.checks.length,
  },
  predecessorProof: contract.predecessor,
  failureBoundary: contract.failure,
  checks,
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;

if (write) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(`WROTE ${path.relative(root, outputPath)}`);
}

if (check) {
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Missing frozen validation artifact: ${path.relative(root, outputPath)}. Run with --write first.`);
  }
  const current = readJson(outputPath);
  assert(
    JSON.stringify(current) === JSON.stringify(result),
    "Frozen QA-3 validation artifact is stale or structurally non-deterministic",
  );
}

if (failed.length > 0) {
  for (const item of failed) console.error(`FAIL ${item.id}: ${item.message}`);
  process.exitCode = 1;
} else {
  console.log(`${result.status}: ${result.summary.passed}/${result.summary.checkCount} checks passed`);
}
