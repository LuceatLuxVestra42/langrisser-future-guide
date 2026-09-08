import { chromium } from "playwright";

const baseUrl = process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const expectedSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error("EXPECTED_SOURCE_SHA must be a 40-hex commit SHA.");

const expectedTone = {
  hp: "lime",
  at: "red",
  magic: "blue",
  df: "orange",
  magicDf: "indigo",
  dex: "purple",
};

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForExpectedHostedManifest() {
  let lastSourceSha = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const url = new URL("authoritative-pages-source.json", baseUrl);
    url.searchParams.set("s7", `${Date.now()}-${attempt}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Hosted manifest HTTP ${response.status}`);
    const manifest = await response.json();
    lastSourceSha = manifest.sourceSha ?? null;
    if (lastSourceSha === expectedSha) return manifest;
    if (attempt < 12) await sleep(5000);
  }
  throw new Error(`Hosted source SHA mismatch after bounded propagation retry: ${lastSourceSha} != ${expectedSha}`);
}

await waitForExpectedHostedManifest();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];
const pageErrors = [];
const consoleErrors = [];
const failedResponses = [];
const requestFailures = [];

page.on("pageerror", (error) => pageErrors.push(String(error.message ?? error)));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("response", (response) => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); });
page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), errorText: request.failure()?.errorText ?? null }));

const response = await page.goto(new URL("heroes/6/", baseUrl).toString(), { waitUntil: "networkidle" });
if (!response?.ok()) failures.push("desktop: Leon direct entry failed");

const section = page.locator('[data-hero-final-job-stats="true"]');
if ((await section.count()) !== 1) {
  failures.push("desktop: final-job stats section missing");
} else {
  const cards = section.locator('[data-final-job-card="true"]');
  if ((await cards.count()) !== 3) failures.push(`desktop: Leon card count ${(await cards.count())} != 3`);

  const firstCard = cards.first();
  for (const [stat, tone] of Object.entries(expectedTone)) {
    const row = firstCard.locator(`[data-stat-bar-row="${stat}"]`);
    if ((await row.count()) !== 1) {
      failures.push(`${stat}: row missing`);
      continue;
    }
    if ((await row.getAttribute("data-stat-tone")) !== tone) failures.push(`${stat}: tone marker drift`);

    const geometry = await row.evaluate((element, statKey) => {
      const track = element.children[1];
      const fill = element.querySelector(`[data-stat-bar="${statKey}"]`);
      const value = element.querySelector(`[data-stat-value="${statKey}"]`);
      if (!(track instanceof HTMLElement) || !(fill instanceof HTMLElement) || !(value instanceof HTMLElement)) return null;
      const trackRect = track.getBoundingClientRect();
      const fillRect = fill.getBoundingClientRect();
      const trackStyle = getComputedStyle(track);
      const fillStyle = getComputedStyle(fill);
      const valueStyle = getComputedStyle(value);
      return {
        trackHeight: trackRect.height,
        fillHeight: fillRect.height,
        trackRadius: trackStyle.borderRadius,
        fillRadius: fillStyle.borderRadius,
        fillColor: fillStyle.backgroundColor,
        valueColor: valueStyle.color,
      };
    }, stat);

    if (!geometry) {
      failures.push(`${stat}: geometry missing`);
      continue;
    }
    if (geometry.trackHeight < 15 || geometry.fillHeight < 15) failures.push(`${stat}: bar is not visually thicker`);
    if (geometry.trackRadius !== "0px" || geometry.fillRadius !== "0px") failures.push(`${stat}: bar ends are not square`);
    if (geometry.fillColor === "rgba(0, 0, 0, 0)" || geometry.fillColor === "transparent") failures.push(`${stat}: fill color missing`);
    if (geometry.valueColor === "rgba(0, 0, 0, 0)" || geometry.valueColor === "transparent") failures.push(`${stat}: numeric color missing`);
  }

  const tones = await firstCard.locator('[data-stat-tone]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-stat-tone")));
  if (new Set(tones).size !== 6) failures.push(`desktop: stat tones are not six-way distinct: ${JSON.stringify(tones)}`);
}

if (pageErrors.length) failures.push(`page errors ${JSON.stringify(pageErrors)}`);
if (consoleErrors.length) failures.push(`console errors ${JSON.stringify(consoleErrors)}`);
if (failedResponses.length) failures.push(`HTTP failures ${JSON.stringify(failedResponses)}`);
if (requestFailures.length) failures.push(`request failures ${JSON.stringify(requestFailures)}`);

await page.screenshot({ path: "/tmp/s7-leon-desktop.png", fullPage: true });
await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL_S7_BROWSER_UI", sourceSha: expectedSha, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS_S7_BROWSER_UI",
  sourceSha: expectedSha,
  fixtureHeroId: 6,
  viewport: { width: 1440, height: 1000 },
  colors: expectedTone,
  squareEnds: true,
  minimumRenderedBarHeightPx: 15,
  semanticRecomputation: false,
  blockers: [],
}, null, 2));
