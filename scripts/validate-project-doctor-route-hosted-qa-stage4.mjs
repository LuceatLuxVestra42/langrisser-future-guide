#!/usr/bin/env node
import fs from "node:fs";

const CONTRACT_PATH = "data/contracts/project-doctor-route-hosted-qa-stage4.v1.json";
const VALIDATION_PATH = "data/validation/project-doctor-route-hosted-qa-stage4.v1.json";
const RUNNER_PATH = "scripts/run-project-doctor-route-hosted-qa-stage4.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function makeCheck(id, pass, detail) {
  return { id, status: pass ? "PASS" : "FAIL", detail };
}

function isFullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function main() {
  const contract = readJson(CONTRACT_PATH);
  const runner = readText(RUNNER_PATH);

  const checks = [
    makeCheck(
      "STAGE4_CONTRACT_FROZEN",
      contract.schemaVersion === "route-hosted-qa-stage4.v1" &&
        contract.status === "INTEGRATED_ORCHESTRATION_CONTRACT_FROZEN",
      "QA-4 frozen orchestration contract is present.",
    ),
    makeCheck(
      "REFERENCE_PREDECESSOR_EVIDENCE_RECORDED",
      contract.predecessor?.stage === "QA-3" &&
        contract.predecessor?.requiredFreezeState === "ROUTE_HOSTED_QA_STAGE3_NAVIGATION_HISTORY_CONSOLE_FROZEN" &&
        isFullSha(contract.predecessor?.checkpointHeadSha) &&
        isFullSha(contract.predecessor?.provenRuntimeHeadSha) &&
        Number.isInteger(contract.predecessor?.proofRunId) &&
        contract.predecessor.proofRunId > 0,
      "Historical QA-3 proof remains recorded as reference evidence; mainline runtime proof is regenerated separately.",
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
        runner.includes('"scripts/validate-project-doctor-route-hosted-qa-stage3.mjs"') &&
        runner.includes('"scripts/validate-project-doctor-route-hosted-qa-stage4.mjs"'),
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
      runner.includes('["run", "qa:browser"]') && runner.includes("route-hosted-qa-stage2.json"),
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
      "Historical QA-2 flakiness remains REVIEW without weakening QA-3.",
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
      "QA-4 orchestration does not reopen semantic or ConfigData layers.",
    ),
    makeCheck(
      "WORKFLOW_DECLARED_FOR_MAINLINE_REWRITE",
      typeof contract.workflow?.file === "string" &&
        contract.workflow?.candidateBuildBeforeRuntimeCommand === true &&
        contract.workflow?.candidatePublishBeforeRuntimeCommand === true &&
        contract.workflow?.chromiumInstallBeforeRuntimeCommand === true,
      "Workflow behavior remains declared in the frozen contract; the branch-specific historical workflow is rewritten in Step 4.",
    ),
  ];

  const failed = checks.filter((check) => check.status === "FAIL");
  const result = {
    schemaVersion: "route-hosted-qa-stage4-validation.v1",
    stage: "QA-4",
    status: failed.length === 0 ? "PASS_ROUTE_HOSTED_QA_STAGE4_ORCHESTRATION_CONTRACT" : "FAIL_ROUTE_HOSTED_QA_STAGE4_ORCHESTRATION_CONTRACT",
    summary: {
      checks: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
    },
    historicalPredecessorEvidenceOnly: true,
    mainlineRuntimeProof: "REGENERATE_AFTER_WORKFLOW_INTEGRATION",
    semanticStageReopened: false,
    checks,
  };

  if (process.argv.includes("--write")) {
    fs.mkdirSync("data/validation", { recursive: true });
    fs.writeFileSync(VALIDATION_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }

  if (process.argv.includes("--check") || !process.argv.includes("--write")) {
    if (!fs.existsSync(VALIDATION_PATH)) {
      throw new Error(`Missing mainline validation artifact: ${VALIDATION_PATH}. Run with --write after workflow integration.`);
    }
    const expected = readJson(VALIDATION_PATH);
    if (JSON.stringify(expected) !== JSON.stringify(result)) {
      console.error(`[QA-4 validator] committed validation artifact is stale: ${VALIDATION_PATH}`);
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  }

  if (failed.length > 0) process.exit(1);
  console.log(`[QA-4 validator] ${result.status} ${result.summary.passed}/${result.summary.checks}`);
}

main();
