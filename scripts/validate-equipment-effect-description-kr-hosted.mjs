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
const normalizeSemanticText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizePresentationText = (value) => String(value ?? "")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map((line) => line.replace(/[ \t]+$/g, ""))
  .join("\n")
  .trim();

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
    check(normalizeSemanticText(effectText).length > 0, `blank KR effect description for Equipment ${equipmentId}`);
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
      const displayName = normalizeSemanticText(await heading.innerText());
      check(displayName.length > 0, `Equipment ${testCase.equipmentId} display name is blank`);

      const paragraphLocator = page.locator("main p");
      const rawParagraphTexts = await paragraphLocator.allInnerTexts();
      const expectedSemanticText = normalizeSemanticText(testCase.effectText);
      const semanticParagraphTexts = rawParagraphTexts.map(normalizeSemanticText);
      const semanticEffectParagraphCount = semanticParagraphTexts.filter(
        (text) => text === expectedSemanticText,
      ).length;
      check(
        semanticEffectParagraphCount === 1,
        `Equipment ${testCase.equipmentId} hosted KR effect semantic mismatch: expected exact paragraph count=1 actual=${semanticEffectParagraphCount} expected=${JSON.stringify(expectedSemanticText)}`,
      );

      const expectedPresentationText = normalizePresentationText(testCase.effectText);
      const presentationParagraphTexts = rawParagraphTexts.map(normalizePresentationText);
      const presentationMatchingIndexes = presentationParagraphTexts.flatMap((text, index) =>
        text === expectedPresentationText ? [index] : [],
      );
      check(
        presentationMatchingIndexes.length === 1,
        `Equipment ${testCase.equipmentId} hosted KR effect presentation mismatch: expected newline-preserving paragraph count=1 actual=${presentationMatchingIndexes.length} expected=${JSON.stringify(expectedPresentationText)}`,
      );

      const effectParagraph = paragraphLocator.nth(presentationMatchingIndexes[0]);
      const computedStyle = await effectParagraph.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          whiteSpace: style.whiteSpace,
          display: style.display,
          visibility: style.visibility,
        };
      });
      check(
        computedStyle.whiteSpace === "pre-line",
        `Equipment ${testCase.equipmentId} hosted KR effect white-space mismatch: expected=pre-line actual=${computedStyle.whiteSpace}`,
      );
      check(
        computedStyle.display !== "none" && computedStyle.visibility !== "hidden",
        `Equipment ${testCase.equipmentId} hosted KR effect paragraph is not visible: display=${computedStyle.display} visibility=${computedStyle.visibility}`,
      );

      const expectedLineBreakCount = Math.max(0, expectedPresentationText.split("\n").length - 1);
      const renderedLineBreaks = await effectParagraph.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        let fullText = "";

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const value = node.nodeValue ?? "";
          const start = fullText.length;
          fullText += value;
          textNodes.push({ node, start, end: fullText.length });
        }

        const rectForCharacter = (index) => {
          const entry = textNodes.find(({ start, end }) => index >= start && index < end);
          if (!entry) return null;
          const range = document.createRange();
          range.setStart(entry.node, index - entry.start);
          range.setEnd(entry.node, index - entry.start + 1);
          const rect = range.getClientRects()[0];
          return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null;
        };

        const boundaries = [];
        for (let index = 0; index < fullText.length; index += 1) {
          if (fullText[index] !== "\n") continue;

          let previousIndex = index - 1;
          while (previousIndex >= 0 && /\s/.test(fullText[previousIndex])) previousIndex -= 1;
          let nextIndex = index + 1;
          while (nextIndex < fullText.length && /\s/.test(fullText[nextIndex])) nextIndex += 1;

          const previousRect = previousIndex >= 0 ? rectForCharacter(previousIndex) : null;
          const nextRect = nextIndex < fullText.length ? rectForCharacter(nextIndex) : null;
          const separated = Boolean(
            previousRect &&
              nextRect &&
              Math.abs(nextRect.top - previousRect.top) > 1,
          );

          boundaries.push({
            index,
            previousIndex,
            nextIndex,
            previousTop: previousRect?.top ?? null,
            nextTop: nextRect?.top ?? null,
            separated,
          });
        }

        return {
          textContentLineBreakCount: boundaries.length,
          testableBoundaryCount: boundaries.filter(
            (boundary) => boundary.previousTop !== null && boundary.nextTop !== null,
          ).length,
          separatedBoundaryCount: boundaries.filter((boundary) => boundary.separated).length,
          boundaries,
        };
      });

      check(
        renderedLineBreaks.textContentLineBreakCount === expectedLineBreakCount,
        `Equipment ${testCase.equipmentId} hosted KR effect newline count mismatch: expected=${expectedLineBreakCount} actual=${renderedLineBreaks.textContentLineBreakCount}`,
      );
      if (expectedLineBreakCount > 0) {
        check(
          renderedLineBreaks.testableBoundaryCount === expectedLineBreakCount,
          `Equipment ${testCase.equipmentId} hosted KR effect newline boundary probe incomplete: expected=${expectedLineBreakCount} testable=${renderedLineBreaks.testableBoundaryCount}`,
        );
        check(
          renderedLineBreaks.separatedBoundaryCount === expectedLineBreakCount,
          `Equipment ${testCase.equipmentId} hosted KR effect rendered newline mismatch: expected separated boundaries=${expectedLineBreakCount} actual=${renderedLineBreaks.separatedBoundaryCount}`,
        );
      }

      check(pageErrors.length === 0, `Equipment ${testCase.equipmentId} page errors: ${JSON.stringify(pageErrors)}`);
      check(consoleErrors.length === 0, `Equipment ${testCase.equipmentId} console errors: ${JSON.stringify(consoleErrors)}`);

      results.push({
        equipmentId: testCase.equipmentId,
        scope: testCase.expectedScope,
        displayName,
        effectText: testCase.effectText,
        effectParagraph: "EXACT_MATCH",
        semanticTextMatch: "EXACT_MATCH",
        presentationTextMatch: "NEWLINE_PRESERVING_EXACT_MATCH",
        computedStyle: {
          whiteSpace: computedStyle.whiteSpace,
          display: computedStyle.display,
          visibility: computedStyle.visibility,
          result: "PASS",
        },
        renderedLineBreaks: {
          expectedLineBreakCount,
          textContentLineBreakCount: renderedLineBreaks.textContentLineBreakCount,
          testableBoundaryCount: renderedLineBreaks.testableBoundaryCount,
          separatedBoundaryCount: renderedLineBreaks.separatedBoundaryCount,
          result: expectedLineBreakCount > 0 ? "PASS" : "NOT_APPLICABLE",
        },
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

check(
  results.some((result) => result.renderedLineBreaks.expectedLineBreakCount > 0),
  "representative Equipment cases do not exercise any multiline effect description",
);

console.log(JSON.stringify({
  status: "PASS_EQUIPMENT_EFFECT_DESCRIPTION_KR_HOSTED",
  sourceSha: expectedSourceSha,
  deployedSourceSha: manifest.sourceSha,
  projectionCount: expectedByEquipmentId.size,
  representativeCases: results,
  nameMutation: false,
  semanticStageReopened: false,
}, null, 2));
