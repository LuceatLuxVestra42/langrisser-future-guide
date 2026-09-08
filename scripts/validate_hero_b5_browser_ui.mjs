import { chromium } from "playwright";

const baseUrl = process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const expectedSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("EXPECTED_SOURCE_SHA must be a 40-hex commit SHA.");
}

const allowedExisting404Paths = new Set([
  "/langrisser-future-guide/images/icon/skill/10301.png",
  "/langrisser-future-guide/images/icon/skill/10302.png",
  "/langrisser-future-guide/images/icon/skill/10324.png",
]);

function isAllowedExisting404(entry) {
  if (entry.status !== 404 || entry.resourceType !== "image") return false;
  try {
    return allowedExisting404Paths.has(new URL(entry.url).pathname);
  } catch {
    return false;
  }
}

function isAllowedPathful404ConsoleError(entry) {
  if (!entry.url || !entry.text.includes("404")) return false;
  try {
    return allowedExisting404Paths.has(new URL(entry.url).pathname);
  } catch {
    return false;
  }
}

function isGenericChromium404ConsoleError(entry) {
  return entry.text.startsWith("Failed to load resource:") && /\b404\b/.test(entry.text);
}

const manifestUrl = new URL("authoritative-pages-source.json", baseUrl);
manifestUrl.searchParams.set("b5", `${Date.now()}`);
const manifestResponse = await fetch(manifestUrl, { cache: "no-store" });
if (!manifestResponse.ok) throw new Error(`Hosted manifest HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();
if (manifest.sourceSha !== expectedSha) {
  throw new Error(`Hosted source SHA mismatch: ${manifest.sourceSha} != ${expectedSha}`);
}

const browser = await chromium.launch({ headless: true });
const failures = [];
const existingDrift = [];
const cases = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

for (const testCase of cases) {
  const page = await browser.newPage({ viewport: testCase.viewport });
  const pageErrors = [];
  const consoleErrors = [];
  const failedResponses = [];
  const requestFailures = [];
  page.on("pageerror", (error) => pageErrors.push(String(error.message ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push({
        text: message.text(),
        url: location.url || null,
        lineNumber: location.lineNumber ?? null,
        columnNumber: location.columnNumber ?? null,
      });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        status: response.status(),
        url: response.url(),
        resourceType: response.request().resourceType(),
      });
    }
  });
  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText ?? null,
    });
  });

  const heroUrl = new URL("heroes/6/", baseUrl).toString();
  const response = await page.goto(heroUrl, { waitUntil: "networkidle" });
  if (!response || !response.ok()) failures.push(`${testCase.name}: hero direct entry failed`);

  const section = page.locator('[data-hero-final-job-stats="true"]');
  if ((await section.count()) !== 1) failures.push(`${testCase.name}: final-job stats section missing`);
  else {
    const sourceStage = await section.getAttribute("data-final-job-source");
    const rank = await section.getAttribute("data-final-job-rank");
    if (sourceStage !== "hero-b3-final-job-extrema-consumer") {
      failures.push(`${testCase.name}: unexpected source stage ${sourceStage}`);
    }
    if (rank !== "4") failures.push(`${testCase.name}: unexpected final-job rank ${rank}`);

    const rows = section.locator("tbody tr");
    const count = await rows.count();
    if (count !== 3) failures.push(`${testCase.name}: Leon candidate row count ${count} != 3`);

    const text = await section.innerText();
    for (const expected of [
      "突击骑士", "皇家骑士", "湮黯青龙",
      "3497", "599", "3806", "569", "4041", "602", "260",
      "Lv.70 · 6성 · 모든 직업 마스터 · 유대 MAX", "SP",
    ]) {
      if (!text.includes(expected)) failures.push(`${testCase.name}: missing visible value ${expected}`);
    }
  }

  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator('[data-hero-final-job-stats="true"]').count()) !== 1) {
    failures.push(`${testCase.name}: refresh lost final-job stats section`);
  }

  const allowedHttp = failedResponses.filter(isAllowedExisting404);
  const unexpectedHttp = failedResponses.filter((entry) => !isAllowedExisting404(entry));
  const allowedPathfulConsole = consoleErrors.filter(isAllowedPathful404ConsoleError);
  const generic404Console = consoleErrors.filter(
    (entry) => !isAllowedPathful404ConsoleError(entry) && isGenericChromium404ConsoleError(entry),
  );
  const non404UnexpectedConsole = consoleErrors.filter(
    (entry) => !isAllowedPathful404ConsoleError(entry) && !isGenericChromium404ConsoleError(entry),
  );

  // Chromium's generic 404 console message does not reliably expose the failed
  // resource URL. Admit it only when this viewport also observed at least one
  // explicitly allowed HTTP 404 and no unexpected HTTP failure. Any unrelated
  // 4xx/5xx response remains a hard failure through unexpectedHttp below.
  const canAdmitGeneric404Console = allowedHttp.length > 0 && unexpectedHttp.length === 0;
  const unexpectedConsole = [
    ...non404UnexpectedConsole,
    ...(canAdmitGeneric404Console ? [] : generic404Console),
  ];
  const admittedConsole404 = [
    ...allowedPathfulConsole,
    ...(canAdmitGeneric404Console ? generic404Console : []),
  ];

  if (allowedHttp.length || admittedConsole404.length) {
    existingDrift.push({
      viewport: testCase.name,
      http404s: allowedHttp,
      consoleErrors: admittedConsole404,
      admission: {
        allowedPathsOnly: true,
        unexpectedHttpFailureCount: unexpectedHttp.length,
        genericConsole404RequiresAllowedHttpEvidence: true,
      },
    });
  }

  if (pageErrors.length) failures.push(`${testCase.name}: page errors: ${JSON.stringify(pageErrors)}`);
  if (unexpectedConsole.length) failures.push(`${testCase.name}: console errors: ${JSON.stringify(unexpectedConsole)}`);
  if (unexpectedHttp.length) failures.push(`${testCase.name}: HTTP failures: ${JSON.stringify(unexpectedHttp)}`);
  if (requestFailures.length) failures.push(`${testCase.name}: request failures: ${JSON.stringify(requestFailures)}`);
  await page.close();
}

const unknown = await fetch(new URL("heroes/999999999/", baseUrl), { redirect: "manual", cache: "no-store" });
if (unknown.status !== 404) failures.push(`unknown hero status ${unknown.status} != 404`);

await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL_BROWSER_UI", failures, existingDrift }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS_BROWSER_UI",
  sourceSha: expectedSha,
  fixtureHeroId: 6,
  viewports: cases.map((row) => row.name),
  expectedCandidateRows: 3,
  semanticRecomputation: false,
  blockers: [],
  review: existingDrift.length ? [{
    classification: "EXISTING_DRIFT",
    owner: "hero skill icon asset/resolver",
    allowed404Paths: [...allowedExisting404Paths],
    observations: existingDrift,
  }] : [],
}, null, 2));
