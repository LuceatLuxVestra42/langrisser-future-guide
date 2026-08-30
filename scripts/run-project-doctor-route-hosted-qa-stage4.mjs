#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const DEFAULT_BASE_URL =
  "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const DEFAULT_OUTPUT = "route-hosted-qa-stage4-summary.json";
const HOSTED_REQUIRED_CONSECUTIVE = 3;
const HOSTED_MAX_ATTEMPTS = 18;
const HOSTED_RETRY_DELAY_MS = 5_000;

function parseArgs(argv) {
  const options = {
    expectedSha: process.env.ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA ?? null,
    baseUrl: process.env.ROUTE_HOSTED_QA_BASE_URL ?? DEFAULT_BASE_URL,
    output: DEFAULT_OUTPUT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--expected-sha") {
      options.expectedSha = argv[++index] ?? null;
    } else if (arg === "--base-url") {
      options.baseUrl = argv[++index] ?? DEFAULT_BASE_URL;
    } else if (arg === "--output") {
      options.output = argv[++index] ?? DEFAULT_OUTPUT;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.expectedSha) {
    throw new Error(
      "Strict QA-4 orchestration requires --expected-sha or ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA.",
    );
  }

  return options;
}

function runCommand(command, args, { env = {}, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });

    child.on("error", reject);
    child.on("close", (code, signal) => {
      const exitCode = code ?? (signal ? 1 : 0);
      if (exitCode === 0 || allowFailure) {
        resolve(exitCode);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${exitCode}${
            signal ? ` (${signal})` : ""
          }`,
        ),
      );
    });
  });
}

function readPlaywrightStats(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const stats = parsed.stats ?? {};
  return {
    expected: Number(stats.expected ?? 0),
    skipped: Number(stats.skipped ?? 0),
    unexpected: Number(stats.unexpected ?? 0),
    flaky: Number(stats.flaky ?? 0),
  };
}

function writeSummary(outputPath, summary) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

async function runPreflight(summary) {
  const steps = [
    ["QA0_CONTRACT", "bun", ["run", "qa:hosted:stage0:validate"]],
    ["QA1_CONTRACT", "bun", ["run", "qa:hosted:validate"]],
    ["QA2_CONTRACT", "bun", ["run", "qa:browser:validate"]],
    [
      "QA3_CONTRACT",
      "node",
      ["scripts/validate-project-doctor-route-hosted-qa-stage3.mjs", "--check"],
    ],
    [
      "QA4_CONTRACT",
      "node",
      ["scripts/validate-project-doctor-route-hosted-qa-stage4.mjs", "--check"],
    ],
  ];

  for (const [id, command, args] of steps) {
    console.log(`\n[QA-4][Preflight] ${id}`);
    await runCommand(command, args);
    summary.phases.preflight.push({ id, status: "PASS" });
  }
}

async function runHostedStability(options, summary) {
  fs.mkdirSync("test-results", { recursive: true });
  let consecutive = 0;

  for (let attempt = 1; attempt <= HOSTED_MAX_ATTEMPTS; attempt += 1) {
    const evidencePath = `test-results/route-hosted-qa-stage4-hosted-attempt-${attempt}.json`;
    console.log(
      `\n[QA-4][Hosted] attempt=${attempt} consecutive=${consecutive}/${HOSTED_REQUIRED_CONSECUTIVE}`,
    );

    const exitCode = await runCommand(
      "bun",
      [
        "run",
        "qa:hosted",
        "--",
        "--expected-sha",
        options.expectedSha,
        "--base-url",
        options.baseUrl,
        "--output",
        evidencePath,
      ],
      { allowFailure: true },
    );

    summary.phases.hosted.attempts.push({
      attempt,
      status: exitCode === 0 ? "PASS" : "FAIL",
      evidence: evidencePath,
    });

    if (exitCode === 0) {
      consecutive += 1;
      if (consecutive >= HOSTED_REQUIRED_CONSECUTIVE) {
        summary.phases.hosted.status = "PASS";
        summary.phases.hosted.consecutivePasses = consecutive;
        return;
      }
    } else {
      consecutive = 0;
    }

    if (attempt < HOSTED_MAX_ATTEMPTS) {
      await sleep(HOSTED_RETRY_DELAY_MS);
    }
  }

  const error = new Error(
    `QA-1 strict Hosted Gate did not reach ${HOSTED_REQUIRED_CONSECUTIVE} consecutive PASS results.`,
  );
  error.failureOwner = "DEPLOYMENT_HOSTING_FAIL";
  throw error;
}

async function runQa2(options, summary) {
  console.log("\n[QA-4][Browser] QA-2 predecessor");
  await runCommand("bun", ["run", "qa:browser"], {
    env: {
      ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA: options.expectedSha,
      ROUTE_HOSTED_QA_BASE_URL: options.baseUrl,
    },
  });

  const stats = readPlaywrightStats("test-results/route-hosted-qa-stage2.json");
  summary.phases.qa2 = { status: "PASS", ...stats };

  if (stats.unexpected !== 0) {
    const error = new Error(
      `QA-2 returned unexpected=${stats.unexpected}; expected zero.`,
    );
    error.failureOwner = "BROWSER_UI_FAIL";
    throw error;
  }

  if (stats.flaky > 0) {
    summary.review.push({
      id: "QA2_FLAKY_REVIEW",
      blocking: false,
      owner: "QA-2 / browser-ui",
      detail: `QA-2 completed with flaky=${stats.flaky}. QA-4 records this as REVIEW; QA-3 remains the zero-flaky blocking navigation/history gate.`,
    });
  }
}

async function runQa3(options, summary) {
  console.log("\n[QA-4][Browser] QA-3 navigation/history/console");
  await runCommand(
    "bunx",
    ["playwright", "test", "-c", "playwright.route-hosted-stage3.config.ts"],
    {
      env: {
        ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA: options.expectedSha,
        ROUTE_HOSTED_QA_BASE_URL: options.baseUrl,
      },
    },
  );

  const stats = readPlaywrightStats("test-results/route-hosted-qa-stage3.json");
  summary.phases.qa3 = { status: "PASS", ...stats };

  if (stats.unexpected !== 0 || stats.flaky !== 0) {
    const error = new Error(
      `QA-3 must be zero-unexpected/zero-flaky; got unexpected=${stats.unexpected}, flaky=${stats.flaky}.`,
    );
    error.failureOwner = "BROWSER_UI_FAIL";
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const summary = {
    schemaVersion: "route-hosted-qa-stage4-summary.v1",
    stage: "QA-4",
    status: "RUNNING",
    expectedSourceSha: options.expectedSha,
    baseUrl: options.baseUrl,
    failureOwner: null,
    semanticStageReopened: false,
    phases: {
      preflight: [],
      hosted: {
        status: "RUNNING",
        requiredConsecutivePasses: HOSTED_REQUIRED_CONSECUTIVE,
        maxAttempts: HOSTED_MAX_ATTEMPTS,
        attempts: [],
      },
      qa2: null,
      qa3: null,
    },
    review: [],
  };

  try {
    await runPreflight(summary);
    await runHostedStability(options, summary);
    await runQa2(options, summary);
    await runQa3(options, summary);

    summary.status = "PASS_ROUTE_HOSTED_QA_STAGE4_INTEGRATED";
    writeSummary(options.output, summary);
    console.log(
      `\n[QA-4] ${summary.status} (${summary.review.length} review item(s))`,
    );
  } catch (error) {
    summary.status = "FAIL_ROUTE_HOSTED_QA_STAGE4_INTEGRATED";
    summary.failureOwner =
      error.failureOwner ??
      (summary.phases.hosted.status === "RUNNING"
        ? "PREFLIGHT_FAIL"
        : "BROWSER_UI_FAIL");
    summary.error = error instanceof Error ? error.message : String(error);
    writeSummary(options.output, summary);
    console.error(
      `\n[QA-4] ${summary.status} owner=${summary.failureOwner}: ${summary.error}`,
    );
    process.exitCode = 1;
  }
}

await main();
