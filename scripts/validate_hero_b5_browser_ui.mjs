import { chromium } from "playwright";

const baseUrl = process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const expectedSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("EXPECTED_SOURCE_SHA must be a 40-hex commit SHA.");
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

  if (pageErrors.length) failures.push(`${testCase.name}: page errors: ${JSON.stringify(pageErrors)}`);
  if (consoleErrors.length) failures.push(`${testCase.name}: console errors: ${JSON.stringify(consoleErrors)}`);
  if (failedResponses.length) failures.push(`${testCase.name}: HTTP failures: ${JSON.stringify(failedResponses)}`);
  if (requestFailures.length) failures.push(`${testCase.name}: request failures: ${JSON.stringify(requestFailures)}`);
  await page.close();
}

const unknown = await fetch(new URL("heroes/999999999/", baseUrl), { redirect: "manual", cache: "no-store" });
if (unknown.status !== 404) failures.push(`unknown hero status ${unknown.status} != 404`);

await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL_BROWSER_UI", failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS_BROWSER_UI",
  sourceSha: expectedSha,
  fixtureHeroId: 6,
  viewports: cases.map((row) => row.name),
  expectedCandidateRows: 3,
  semanticRecomputation: false,
}, null, 2));
