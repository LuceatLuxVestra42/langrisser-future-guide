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
  page.on("pageerror", (error) => pageErrors.push(String(error.message ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const heroUrl = new URL("heroes/6/", baseUrl).toString();
  const response = await page.goto(heroUrl, { waitUntil: "networkidle" });
  if (!response || !response.ok()) failures.push(`${testCase.name}: hero direct entry failed`);

  const section = page.locator('[data-hero-final-job-stats="b3-frozen-consumer"]');
  if ((await section.count()) !== 1) failures.push(`${testCase.name}: B3 frozen stats section missing`);
  else {
    const rows = section.locator('tbody tr[data-final-job-variant]');
    const count = await rows.count();
    if (count !== 3) failures.push(`${testCase.name}: Leon candidate row count ${count} != 3`);

    const normal64 = section.locator('tr[data-job-connection-id="64"][data-final-job-variant="NORMAL"]');
    const normal65 = section.locator('tr[data-job-connection-id="65"][data-final-job-variant="NORMAL"]');
    const sp66 = section.locator('tr[data-job-connection-id="66"][data-final-job-variant="SP"]');
    if ((await normal64.count()) !== 1) failures.push(`${testCase.name}: Leon NORMAL JC64 missing`);
    if ((await normal65.count()) !== 1) failures.push(`${testCase.name}: Leon NORMAL JC65 missing`);
    if ((await sp66.count()) !== 1) failures.push(`${testCase.name}: Leon SP JC66 missing`);

    const text = await section.innerText();
    for (const expected of ["3497", "599", "3806", "569", "4041", "602", "260", "Lv.70", "MAX 유대", "SP"]) {
      if (!text.includes(expected)) failures.push(`${testCase.name}: missing visible value ${expected}`);
    }
  }

  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator('[data-hero-final-job-stats="b3-frozen-consumer"]').count()) !== 1) {
    failures.push(`${testCase.name}: refresh lost B3 frozen stats section`);
  }

  if (pageErrors.length) failures.push(`${testCase.name}: page errors: ${pageErrors.join(" | ")}`);
  if (consoleErrors.length) failures.push(`${testCase.name}: console errors: ${consoleErrors.join(" | ")}`);
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
