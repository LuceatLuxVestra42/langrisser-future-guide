import fs from "node:fs";
import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

const sourcePaths = [
  "data/presentation/equipment-effect-description-kr-general.part1.v1.json",
  "data/presentation/equipment-effect-description-kr-general.part2.v1.json",
  "data/presentation/equipment-effect-description-kr-exclusive.part1.v1.json",
  "data/presentation/equipment-effect-description-kr-exclusive.part2.v1.json",
];

const check = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();
const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const projections = sourcePaths.map((sourcePath) => {
  const projection = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  check(projection.version === 1, `${sourcePath}: version must be 1`);
  check(projection.status === "FROZEN_PRESENTATION_INPUT", `${sourcePath}: presentation input must be frozen`);
  check(projection.policy?.joinKey === "equipmentId", `${sourcePath}: join key must remain equipmentId`);
  check(projection.policy?.runtimeNameJoin === false, `${sourcePath}: runtime name join must remain disabled`);
  check(projection.policy?.nameMutation === false, `${sourcePath}: equipment name mutation must remain disabled`);
  check(projection.policy?.semanticStageReopened === false, `${sourcePath}: semantic stage must remain closed`);
  return projection;
});

const expectedByEquipmentId = new Map();
for (const projection of projections) {
  for (const [rawEquipmentId, effectText] of Object.entries(projection.byEquipmentId ?? {})) {
    const equipmentId = Number(rawEquipmentId);
    check(Number.isSafeInteger(equipmentId) && equipmentId > 0, `invalid EquipmentID in ${projection.scope}: ${rawEquipmentId}`);
    check(normalizeText(effectText).length > 0, `blank KR effect description for Equipment ${equipmentId}`);
    check(!expectedByEquipmentId.has(equipmentId), `duplicate KR effect description EquipmentID ${equipmentId}`);
    expectedByEquipmentId.set(equipmentId, { scope: projection.scope, effectText });
  }
}
check(expectedByEquipmentId.size === 261, `KR effect description projection size mismatch: ${expectedByEquipmentId.size}/261`);

const cases = [
  { equipmentId: 13, expectedScope: "general" },
  { equipmentId: 416, expectedScope: "exclusive" },
].map((testCase) => {
  const expected = expectedByEquipmentId.get(testCase.equipmentId);
  check(expected, `representative Equipment ${testCase.equipmentId} is missing from frozen KR effect projection`);
  check(expected.scope === testCase.expectedScope, `representative Equipment ${testCase.equipmentId} scope mismatch: ${expected.scope}/${testCase.expectedScope}`);
  return { ...testCase, effectText: expected.effectText };
});

let manifest = null;
for (let attempt = 1; attempt <= 120; attempt += 1) {
  try {
    const response = await fetch(url(`authoritative-pages-source.json?qa=${Date.now()}`), { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha) {
        manifest = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 120) await sleep(5000);
}
check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha}`);
check(manifest.semanticStageReopened === false, "deployment manifest reopened semantic stage");

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

    try {
      const response = await page.goto(url(`equipment/${testCase.equipmentId}/`), {
        waitUntil: "networkidle",
        timeout: 45000,
      });
      check(response && response.status() < 400, `Equipment ${testCase.equipmentId} detail failed: ${response?.status()}`);

      const heading = page.locator("main h1");
      check(await heading.count() === 1, `Equipment ${testCase.equipmentId} detail heading missing or duplicated`);
      const displayName = normalizeText(await heading.innerText());
      check(displayName.length > 0, `Equipment ${testCase.equipmentId} display name is blank`);

      const expectedEffectText = normalizeText(testCase.effectText);
      const paragraphTexts = (await page.locator("main p").allInnerTexts()).map(normalizeText);
      const exactEffectParagraphCount = paragraphTexts.filter((text) => text === expectedEffectText).length;
      check(
        exactEffectParagraphCount === 1,
        `Equipment ${testCase.equipmentId} hosted KR effect paragraph mismatch: expected exact paragraph count=1 actual=${exactEffectParagraphCount} expected=${JSON.stringify(expectedEffectText)}`,
      );

      check(pageErrors.length === 0, `Equipment ${testCase.equipmentId} page errors: ${JSON.stringify(pageErrors)}`);
      check(consoleErrors.length === 0, `Equipment ${testCase.equipmentId} console errors: ${JSON.stringify(consoleErrors)}`);

      results.push({
        equipmentId: testCase.equipmentId,
        scope: testCase.expectedScope,
        displayName,
        effectText: testCase.effectText,
        effectParagraph: "EXACT_MATCH",
        pageErrors: 0,
        consoleErrors: 0,
        result: "PASS",
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({
  status: "PASS_EQUIPMENT_EFFECT_DESCRIPTION_KR_HOSTED",
  sourceSha: expectedSourceSha,
  deployedSourceSha: manifest.sourceSha,
  projectionCount: expectedByEquipmentId.size,
  representativeCases: results,
  nameMutation: false,
  semanticStageReopened: false,
}, null, 2));
