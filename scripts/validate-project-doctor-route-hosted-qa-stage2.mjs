import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "data/contracts/project-doctor-route-hosted-qa-stage2.v1.json");
const stage1CheckpointPath = path.join(
  root,
  "data/generated/project-doctor-route-hosted-qa-stage1-checkpoint.v1.json",
);
const packagePath = path.join(root, "package.json");
const configPath = path.join(root, "playwright.route-hosted.config.ts");
const specPath = path.join(root, "tests/route-hosted-browser/stage2.spec.ts");
const outputPath = path.join(root, "data/validation/project-doctor-route-hosted-qa-stage2.v1.json");

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
const pkg = readJson(packagePath);
const stage1Checkpoint = fs.readFileSync(stage1CheckpointPath, "utf8");
const config = fs.readFileSync(configPath, "utf8");
const spec = fs.readFileSync(specPath, "utf8");

const requiredChecks = [
  "BROWSER_BOOTSTRAP",
  "HOSTED_FRESHNESS_PRECONDITION",
  "PUBLIC_SURFACE_RENDER",
  "HYDRATION_INTERACTION",
  "HERO_SEARCH_FILTER",
  "HISTORY_BACK_FORWARD",
  "SOLDIER_MODAL_STATE_PRESERVATION",
  "SOLDIER_SCROLL_RESTORE",
  "UNKNOWN_ID_NOT_FOUND_UI",
  "MOBILE_RESPONSIVE_LAYOUT",
  "TOUCH_KEYBOARD_INTERACTION",
  "CONSOLE_PAGEERROR_CLEAN",
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
  assert(contract.schemaVersion === "route-hosted-qa-stage2.v1", "unexpected schemaVersion");
  assert(contract.stage === "QA-2", "unexpected stage");
  assert(contract.status === "BROWSER_UI_CONTRACT_FROZEN", "unexpected contract status");
});

verify("QA1_PREDECESSOR_FROZEN", () => {
  assert(stage1Checkpoint.includes("ROUTE_HOSTED_QA_STAGE1_HTTP_FROZEN"), "QA-1 frozen checkpoint missing");
  assert(contract.predecessor?.stage === "QA-1", "QA-1 predecessor contract missing");
});

verify("PLAYWRIGHT_PINNED", () => {
  assert(pkg.devDependencies?.["@playwright/test"] === "1.62.1", "@playwright/test must be pinned to 1.62.1");
  assert(contract.runtime?.version === "1.62.1", "contract Playwright version mismatch");
  assert(contract.runtime?.browser === "chromium", "contract browser must be chromium");
});

verify("PACKAGE_COMMANDS", () => {
  assert(
    pkg.scripts?.["qa:browser"] === "playwright test -c playwright.route-hosted.config.ts",
    "qa:browser command mismatch",
  );
  assert(
    pkg.scripts?.["qa:browser:validate"] ===
      "node scripts/validate-project-doctor-route-hosted-qa-stage2.mjs --check",
    "qa:browser:validate command mismatch",
  );
});

verify("CHROMIUM_ONLY_PROJECTS", () => {
  assert(config.includes('name: "chromium-desktop"'), "desktop Chromium project missing");
  assert(config.includes('name: "chromium-mobile"'), "mobile Chromium project missing");
  assert(config.includes('browserName: "chromium"'), "Chromium browser configuration missing");
  assert(!config.includes('browserName: "firefox"'), "Firefox must remain deferred");
  assert(!config.includes('browserName: "webkit"'), "WebKit must remain deferred");
});

verify("VIEWPORTS_AND_EVIDENCE", () => {
  assert(config.includes("width: 1440, height: 1000"), "desktop viewport mismatch");
  assert(config.includes("width: 390, height: 844"), "mobile viewport mismatch");
  assert(config.includes('trace: "retain-on-failure"'), "trace retention missing");
  assert(config.includes('screenshot: "only-on-failure"'), "failure screenshot missing");
});

verify("HOSTED_FRESHNESS_PRECONDITION", () => {
  assert(spec.includes("ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA"), "expected source SHA environment missing");
  assert(spec.includes('qa-main-source.txt'), "deployed source sentinel check missing");
  assert(contract.hosted?.sourceShaSentinel === "qa-main-source.txt", "contract sentinel mismatch");
});

verify("INTERACTION_COVERAGE", () => {
  for (const token of ["page.keyboard.type", ".tap()", "page.goBack", "page.goForward", "aria-pressed"]) {
    assert(spec.includes(token), `interaction coverage missing ${token}`);
  }
});

verify("STATE_SCROLL_COVERAGE", () => {
  assert(spec.includes('toHaveValue("중장 창병")'), "Soldier parent filter preservation assertion missing");
  assert(spec.includes("beforeScroll"), "scroll baseline missing");
  assert(spec.includes("afterScroll"), "scroll restore assertion missing");
});

verify("NOT_FOUND_UI_COVERAGE", () => {
  for (const token of [
    "영웅을 찾을 수 없어.",
    "용병을 찾을 수 없어",
    "공개 장비를 찾을 수 없습니다.",
  ]) {
    assert(spec.includes(token), `not-found UI assertion missing ${token}`);
  }
});

verify("RUNTIME_ERROR_COVERAGE", () => {
  assert(spec.includes('page.on("pageerror"'), "pageerror guard missing");
  assert(spec.includes('message.type() !== "error"'), "console.error guard missing");
  assert(spec.includes('allowExpectedDocument404'), "expected 404 console boundary missing");
  assert(spec.includes('page.on("requestfailed"'), "critical request failure guard missing");
});

verify("FAILURE_BOUNDARY", () => {
  assert(contract.failure?.browserUi === "BROWSER_UI_FAIL", "Browser/UI failure code mismatch");
  assert(contract.failure?.semanticReopenAllowed === false, "semantic reopen must remain false");
  assert(contract.runtime?.browserInstallCommand === "bunx playwright install --with-deps chromium", "browser install command mismatch");
  assert(JSON.stringify(contract.checks) === JSON.stringify(requiredChecks), "Browser/UI check contract mismatch");
});

const failed = checks.filter((item) => !item.pass);
const result = {
  schemaVersion: "route-hosted-qa-stage2-validation.v1",
  stage: "QA-2",
  status: failed.length === 0 ? "PASS_ROUTE_HOSTED_QA_STAGE2_CONTRACT" : "FAIL_ROUTE_HOSTED_QA_STAGE2_CONTRACT",
  completion: failed.length === 0 ? "COMPLETE" : "INCOMPLETE",
  summary: {
    checkCount: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    playwrightVersion: contract.runtime.version,
    browser: contract.runtime.browser,
    projectCount: contract.projects.length,
    browserUiCheckCount: contract.checks.length,
  },
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
    "Frozen QA-2 validation artifact is stale or structurally non-deterministic",
  );
}

if (failed.length > 0) {
  for (const item of failed) console.error(`FAIL ${item.id}: ${item.message}`);
  process.exitCode = 1;
} else {
  console.log(`${result.status}: ${result.summary.passed}/${result.summary.checkCount} checks passed`);
}
