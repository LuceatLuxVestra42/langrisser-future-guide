import { chromium } from "playwright";

const baseUrl = process.env.HOSTED_BASE_URL ?? "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const expectedSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSha || !/^[0-9a-f]{40}$/.test(expectedSha)) {
  throw new Error("EXPECTED_SOURCE_SHA must be a 40-hex commit SHA.");
}

const STATS = ["hp", "at", "magic", "df", "magicDf", "dex"];
const expectedLeon = [
  {
    variant: "NORMAL",
    jobConnectionId: "64",
    jobId: "307",
    jobName: "突击骑士",
    values: { hp: 3497, at: 599, magic: 224, df: 231, magicDf: 203, dex: 125 },
    percent: { hp: 60.3601780656, at: 93.1141439206, magic: 29.9872122762, df: 48.4890109890, magicDf: 43.9914163090, dex: 40.6976744186 },
  },
  {
    variant: "NORMAL",
    jobConnectionId: "65",
    jobId: "306",
    jobName: "皇家骑士",
    values: { hp: 3806, at: 569, magic: 224, df: 242, magicDf: 231, dex: 125 },
  },
  {
    variant: "SP",
    jobConnectionId: "66",
    jobId: "377",
    jobName: "湮黯青龙",
    values: { hp: 4041, at: 602, magic: 224, df: 260, magicDf: 231, dex: 125 },
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExpectedHostedManifest() {
  let lastSourceSha = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const manifestUrl = new URL("authoritative-pages-source.json", baseUrl);
    manifestUrl.searchParams.set("s6", `${Date.now()}-${attempt}`);
    const response = await fetch(manifestUrl, { cache: "no-store" });
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
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url(), resourceType: response.request().resourceType() });
});
page.on("requestfailed", (request) => requestFailures.push({ url: request.url(), resourceType: request.resourceType(), errorText: request.failure()?.errorText ?? null }));

const heroUrl = new URL("heroes/6/", baseUrl).toString();
const response = await page.goto(heroUrl, { waitUntil: "networkidle" });
if (!response?.ok()) failures.push("desktop: Leon direct entry failed");

const section = page.locator('[data-hero-final-job-stats="true"]');
if ((await section.count()) !== 1) {
  failures.push("desktop: final-job stats section missing");
} else {
  if ((await section.getAttribute("data-final-job-source")) !== "hero-b3-final-job-extrema-consumer") failures.push("desktop: source stage drift");
  if ((await section.getAttribute("data-final-job-rank")) !== "4") failures.push("desktop: rank drift");
  if ((await section.getAttribute("data-stat-bar-min-fill")) !== "25") failures.push("desktop: minimum fill marker drift");

  const cards = section.locator('[data-final-job-card="true"]');
  if ((await cards.count()) !== 3) failures.push(`desktop: Leon card count ${(await cards.count())} != 3`);

  for (let index = 0; index < expectedLeon.length; index += 1) {
    const expected = expectedLeon[index];
    const card = cards.nth(index);
    if ((await card.getAttribute("data-final-job-variant")) !== expected.variant) failures.push(`card ${index}: variant drift`);
    if ((await card.getAttribute("data-job-connection-id")) !== expected.jobConnectionId) failures.push(`card ${index}: jobConnectionId drift`);
    if ((await card.getAttribute("data-job-id")) !== expected.jobId) failures.push(`card ${index}: jobId drift`);
    if (!(await card.innerText()).includes(expected.jobName)) failures.push(`card ${index}: missing job name ${expected.jobName}`);
    if (expected.variant === "SP" && !(await card.innerText()).includes("SP")) failures.push("SP card: badge missing");

    for (const stat of STATS) {
      const row = card.locator(`[data-stat-bar-row="${stat}"]`);
      if ((await row.count()) !== 1) {
        failures.push(`card ${index} ${stat}: stat row missing`);
        continue;
      }
      const value = Number(await row.locator(`[data-stat-value="${stat}"]`).innerText());
      if (value !== expected.values[stat]) failures.push(`card ${index} ${stat}: value ${value} != ${expected.values[stat]}`);

      const bar = row.locator(`[data-stat-bar="${stat}"]`);
      const percent = Number(await bar.getAttribute("data-bar-percent"));
      if (!Number.isFinite(percent) || percent < 25 || percent > 100) failures.push(`card ${index} ${stat}: invalid bar percent ${percent}`);
      if (expected.percent?.[stat] != null && Math.abs(percent - expected.percent[stat]) > 0.00011) {
        failures.push(`card ${index} ${stat}: percent ${percent} != ${expected.percent[stat]}`);
      }

      const geometry = await row.evaluate((element, statKey) => {
        const label = element.children[0]?.getBoundingClientRect();
        const track = element.children[1]?.getBoundingClientRect();
        const valueNode = element.querySelector(`[data-stat-value="${statKey}"]`)?.getBoundingClientRect();
        const fill = element.querySelector(`[data-stat-bar="${statKey}"]`)?.getBoundingClientRect();
        return label && track && valueNode && fill ? {
          labelRight: label.right,
          trackLeft: track.left,
          trackRight: track.right,
          valueLeft: valueNode.left,
          trackWidth: track.width,
          fillWidth: fill.width,
        } : null;
      }, stat);
      if (!geometry) failures.push(`card ${index} ${stat}: missing row geometry`);
      else {
        if (!(geometry.labelRight <= geometry.trackLeft && geometry.trackRight <= geometry.valueLeft)) failures.push(`card ${index} ${stat}: expected label -> bar -> right value geometry`);
        const renderedPercent = geometry.trackWidth > 0 ? (geometry.fillWidth / geometry.trackWidth) * 100 : NaN;
        if (!Number.isFinite(renderedPercent) || Math.abs(renderedPercent - percent) > 0.35) failures.push(`card ${index} ${stat}: rendered width ${renderedPercent} != data percent ${percent}`);
      }
    }
  }

  const boxes = [];
  for (let i = 0; i < Math.min(3, await cards.count()); i += 1) boxes.push(await cards.nth(i).boundingBox());
  if (boxes.length === 3 && boxes.every(Boolean)) {
    const [a, b, c] = boxes;
    if (Math.abs(a.y - b.y) > 4) failures.push("desktop: first two cards are not on the same row");
    if (!(b.x > a.x + a.width * 0.5)) failures.push("desktop: second card is not positioned to the right of first card");
    if (!(c.y > a.y + a.height * 0.5)) failures.push("desktop: third SP card is not on the next grid row");
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) failures.push(`desktop: horizontal overflow ${overflow}px`);
}

await page.reload({ waitUntil: "networkidle" });
if ((await page.locator('[data-hero-final-job-stats="true"]').count()) !== 1) failures.push("desktop: refresh lost final-job stats section");
if (pageErrors.length) failures.push(`desktop: page errors ${JSON.stringify(pageErrors)}`);
if (consoleErrors.length) failures.push(`desktop: console errors ${JSON.stringify(consoleErrors)}`);
if (failedResponses.length) failures.push(`desktop: HTTP failures ${JSON.stringify(failedResponses)}`);
if (requestFailures.length) failures.push(`desktop: request failures ${JSON.stringify(requestFailures)}`);

await page.screenshot({ path: "/tmp/s6-leon-desktop.png", fullPage: true });
await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL_S6_BROWSER_UI", sourceSha: expectedSha, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS_S6_BROWSER_UI",
  sourceSha: expectedSha,
  fixtureHeroId: 6,
  viewport: { width: 1440, height: 1000 },
  expectedCards: 3,
  minimumFillPercent: 25,
  checked: ["two-column desktop grid", "SP temporary visibility", "six stat rows per card", "label-bar-value geometry", "rendered pixel bar ratio", "no horizontal overflow", "no page/console/http/request errors"],
  semanticRecomputation: false,
  blockers: [],
}, null, 2));
