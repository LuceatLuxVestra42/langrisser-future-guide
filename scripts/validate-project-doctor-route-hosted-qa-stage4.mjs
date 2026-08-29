#!/usr/bin/env node
import fs from "node:fs";

const CONTRACT_PATH =
  "data/contracts/project-doctor-route-hosted-qa-stage4.v1.json";
const PREDECESSOR_PATH =
  "data/generated/project-doctor-route-hosted-qa-stage3-checkpoint.v1.json";
const VALIDATION_PATH =
  "data/validation/project-doctor-route-hosted-qa-stage4.v1.json";
const RUNNER_PATH =
  "scripts/run-project-doctor-route-hosted-qa-stage4.mjs";
const WORKFLOW_PATH =
  ".github/workflows/project-doctor-route-hosted-qa-stage4-integrated-proof.yml";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function makeCheck(id, pass, detail) {
  return { id, status: pass ? "PASS" : "FAIL", detail };
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const predecessor = readJson(PREDECESSOR_PATH);
  const runner = readText(RUNNER_PATH);
  const workflow = readText(WORKFLOW_PATH);

  const checks = [
    makeCheck(
      "STAGE4_CONTRACT_FROZEN",
      contract.schemaVersion === "route-hosted-qa-stage4.v1" &&
        contract.status === "INTEGRATED_ORCHESTRATION_CONTRACT_FROZEN",
      "QA-4 contract schema and frozen status are exact.",
    ),
    makeCheck(
      "STAGE3_PREDECESSOR_FROZEN",
      predecessor.freezeState ===
          "ROUTE_HOSTED_QA_STAGE3_NAVIGATION_HISTORY_CONSOLE_FROZEN" &&
        predecessor.proof?.headSha === contract.predecessor.provenRuntimeHeadSha &&
        predecessor.proof?.workflowRunId === contract.predecessor.proofRunId,
      "QA-4 reuses the frozen QA-3 checkpoint and proven runtime proof.",
    ),
    makeCheck(
      "STRICT_EXPECTED_SHA_REQUIRED",
      contract.command?.requiresExpectedShaForStrictMode === true &&
        runner.includes("Strict QA-4 orchestration requires --expected-sha"),
      "The integrated gate requires an explicit deployed source SHA in strict mode.",
    ),
    makeCheck(
      "PREFLIGHT_REUSES_EXISTING_VALIDATORS",
      runner.includes('"qa:hosted:stage0:validate"') &&
        runner.includes('"qa:hosted:validate"') &&
        runner.includes('"qa:browser:validate"') &&
        runner.includes(
          '"scripts/validate-project-doctor-route-hosted-qa-stage3.mjs"',
        ) &&
        runner.includes(
          '"scripts/validate-project-doctor-route-hosted-qa-stage4.mjs"',
        ),
      "QA-4 calls predecessor validators instead of reimplementing their semantics.",
    ),
    makeCheck(
      "HOSTED_STABILITY_SEQUENCE",
      runner.includes("HOSTED_REQUIRED_CONSECUTIVE = 3") &&
        runner.includes("HOSTED_MAX_ATTEMPTS = 18") &&
        runner.includes('error.failureOwner = "DEPLOYMENT_HOSTING_FAIL"'),
      "QA-1 strict Hosted Gate requires three consecutive passes and keeps hosting ownership.",
    ),
    makeCheck(
      "QA2_REUSED_AS_BROWSER_PREDECESSOR",
      runner.includes('["run", "qa:browser"]') &&
        runner.includes("route-hosted-qa-stage2.json"),
      "QA-2 Browser/UI proof is invoked as an existing predecessor gate.",
    ),
    makeCheck(
      "QA3_ZERO_FLAKY_BLOCKING",
      runner.includes("playwright.route-hosted-stage3.config.ts") &&
        runner.includes("stats.unexpected !== 0 || stats.flaky !== 0"),
      "QA-3 remains the zero-unexpected/zero-flaky blocking navigation-history gate.",
    ),
    makeCheck(
      "QA2_FLAKY_IS_REVIEW_NOT_BLOCKER",
      contract.resultPolicy?.qa2Flaky === "NON_BLOCKING_REVIEW" &&
        runner.includes('id: "QA2_FLAKY_REVIEW"') &&
        runner.includes("blocking: false"),
      "Historical QA-2 flakiness is surfaced as REVIEW without weakening QA-3.",
    ),
    makeCheck(
      "FAILURE_OWNERSHIP_SEPARATED",
      contract.failureOwnership?.preflight === "PREFLIGHT_FAIL" &&
        contract.failureOwnership?.hosted === "DEPLOYMENT_HOSTING_FAIL" &&
        contract.failureOwnership?.browser === "BROWSER_UI_FAIL" &&
        contract.failureOwnership?.semanticReopenAllowed === false,
      "Preflight, hosting, and browser failures remain owned by separate layers.",
    ),
    makeCheck(
      "NO_SEMANTIC_RECOMPUTATION",
      contract.semanticBoundary?.canonicalRelationChanged === false &&
        contract.semanticBoundary?.rawConfigDataRuntimeReadAllowed === false &&
        contract.semanticBoundary?.nameJoinAllowed === false &&
        contract.semanticBoundary?.idArithmeticAllowed === false &&
        contract.semanticBoundary?.runtimeRelationRecomputationAllowed === false,
      "QA-4 adds orchestration only and does not reopen semantic or ConfigData layers.",
    ),
    makeCheck(
      "WORKFLOW_BUILDS_PUBLISHES_THEN_RUNS_INTEGRATED_GATE",
      workflow.includes("Build static GitHub Pages candidate") &&
        workflow.includes("Publish QA-4 candidate to gh-pages") &&
        workflow.includes("Install Chromium and Linux dependencies") &&
        workflow.includes(
          'node scripts/run-project-doctor-route-hosted-qa-stage4.mjs --expected-sha "$GITHUB_SHA"',
        ),
      "The proof workflow builds and publishes the candidate before running the integrated command.",
    ),
    makeCheck(
      "MACHINE_READABLE_EVIDENCE",
      runner.includes("route-hosted-qa-stage4-summary.v1") &&
        workflow.includes("route-hosted-qa-stage4-summary.json") &&
        workflow.includes("route-hosted-qa-stage4-integrated"),
      "QA-4 emits and uploads a machine-readable integrated summary.",
    ),
  ];

  const failed = checks.filter((check) => check.status === "FAIL");
  const result = {
    schemaVersion: "route-hosted-qa-stage4-validation.v1",
    stage: "QA-4",
    status:
      failed.length === 0
        ? "PASS_ROUTE_HOSTED_QA_STAGE4_ORCHESTRATION_CONTRACT"
        : "FAIL_ROUTE_HOSTED_QA_STAGE4_ORCHESTRATION_CONTRACT",
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    checks,
    semanticStageReopened: false,
  };

  if (process.argv.includes("--check")) {
    const expected = readJson(VALIDATION_PATH);
    if (JSON.stringify(expected) !== JSON.stringify(result)) {
      console.error(
        `[QA-4 validator] committed validation artifact is stale: ${VALIDATION_PATH}`,
      );
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }

  if (failed.length > 0) {
    process.exit(1);
  }

  console.log(
    `[QA-4 validator] ${result.status} ${result.summary.passed}/${result.summary.checks}`,
  );
}

main();
