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
const hostedBaseUrl = new URL(baseUrl);
const normalizeSemanticText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizePresentationText = (value) => String(value ?? "")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .map((line) => line.replace(/[ \t]+$/g, ""))
  .join("\n")
  .trim();
const countLineBreaks = (value) => Math.max(0, normalizePresentationText(value).split("\n").length - 1);
const applyExpectedPresentation = (value) => {
  const sourceLines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const presentedLines = [];

  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index];
    const line = rawLine.trim();
    if (!line) continue;

    const previousRawLine = index > 0 ? sourceLines[index - 1] : "";
    const previousPresentedLine = presentedLines.at(-1) ?? "";
    const startsIndependentUnit = /^(?:지휘\s*[:：.]|\[[^\]]+\]\s*[:：]?)/.test(line);
    const isSuffixLine = /^(?:지속\s*\d+\s*(?:턴|행동|회합)|해제 불가|면역 불가)(?:[,.]|$|\s)/.test(line);
    const previousEndsWithCondition = /(?:^|\s)경우[,.]?$/.test(previousPresentedLine.trim());
    const sourceBoundarySignalsContinuation = /[ \t]$/.test(previousRawLine) || /^[ \t]/.test(rawLine);

    const shouldJoin =
      presentedLines.length > 0 &&
      !startsIndependentUnit &&
      (line.startsWith("(") ||
        isSuffixLine ||
        previousEndsWithCondition ||
        sourceBoundarySignalsContinuation);

    if (shouldJoin) {
      presentedLines[presentedLines.length - 1] = `${previousPresentedLine.trimEnd()} ${line}`;
    } else {
      presentedLines.push(line);
    }
  }

  return presentedLines.join("\n");
};

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

const presentationProjectionStats = [...expectedByEquipmentId.entries()].map(([equipmentId, expected]) => {
  const presentationEffectText = applyExpectedPresentation(expected.effectText);
  check(
    normalizeSemanticText(presentationEffectText) === normalizeSemanticText(expected.effectText),
    `Equipment ${equipmentId} presentation normalizer changed semantic text`,
  );
  return {
    equipmentId,
    scope: expected.scope,
    sourceLineBreakCount: countLineBreaks(expected.effectText),
    presentationLineBreakCount: countLineBreaks(presentationEffectText),
    changed: normalizePresentationText(presentationEffectText) !== normalizePresentationText(expected.effectText),
  };
});
const presentationChangedProjectionCount = presentationProjectionStats.filter((entry) => entry.changed).length;
check(presentationChangedProjectionCount > 0, "equipment effect presentation normalizer changed no projected records");

const fixtureDefinitions = [
  { equipmentId: 140, expectedScope: "general", fixtureLabel: "general-single-line", expectedLineBreakCount: 0 },
  { equipmentId: 13, expectedScope: "general", fixtureLabel: "general-two-line", expectedLineBreakCount: 1 },
  { equipmentId: 8, expectedScope: "general", fixtureLabel: "general-multiline-suffix-compaction", expectedLineBreakCount: 2 },
  { equipmentId: 416, expectedScope: "exclusive", fixtureLabel: "exclusive-baseline", expectedLineBreakCount: 1 },
  { equipmentId: 427, expectedScope: "exclusive", fixtureLabel: "exclusive-multiline", expectedLineBreakCount: 3 },
  { equipmentId: 581, expectedScope: "exclusive", fixtureLabel: "exclusive-581-compact-trailer-regression", expectedLineBreakCount: 2 },
];

const cases = fixtureDefinitions.map((testCase) => {
  const expected = expectedByEquipmentId.get(testCase.equipmentId);
  check(expected, `representative Equipment ${testCase.equipmentId} is missing from frozen KR effect projection`);
  check(expected.scope === testCase.expectedScope, `representative Equipment ${testCase.equipmentId} scope mismatch: ${expected.scope}/${testCase.expectedScope}`);
  const sourceLineBreakCount = countLineBreaks(expected.effectText);
  const presentationEffectText = applyExpectedPresentation(expected.effectText);
  const presentationLineBreakCount = countLineBreaks(presentationEffectText);
  check(
    presentationLineBreakCount === testCase.expectedLineBreakCount,
    `representative Equipment ${testCase.equipmentId} fixture presentation newline contract drift: expected=${testCase.expectedLineBreakCount} actual=${presentationLineBreakCount}`,
  );
  return {
    ...testCase,
    effectText: expected.effectText,
    presentationEffectText,
    sourceLineBreakCount,
    presentationLineBreakCount,
  };
});

check(cases.filter((testCase) => testCase.expectedScope === "general").length === 3, "general representative fixture coverage mismatch");
check(cases.filter((testCase) => testCase.expectedScope === "exclusive").length === 3, "exclusive representative fixture coverage mismatch");
check(cases.some((testCase) => testCase.sourceLineBreakCount === 0), "representative fixtures must include a single-line effect");
check(cases.filter((testCase) => testCase.sourceLineBreakCount >= 3).length >= 3, "representative fixtures must include at least three long multiline source effects");
check(cases.some((testCase) => testCase.equipmentId === 581), "Equipment 581 compact trailer regression fixture is required");

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

const validateDeploymentAssets = async (page, equipmentId) => {
  const discovered = await page.evaluate(() => ({
    documentUrl: document.location.href,
    stylesheets: [...new Set(
      Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]'), (element) => element.href),
    )].sort(),
    scripts: [...new Set(
      Array.from(document.querySelectorAll("script[src]"), (element) => element.src),
    )].sort(),
  }));

  check(discovered.stylesheets.length > 0, `Equipment ${equipmentId} hosted page has no stylesheet asset evidence`);
  check(discovered.scripts.length > 0, `Equipment ${equipmentId} hosted page has no script asset evidence`);

  const verifyAsset = async (href, kind) => {
    const assetUrl = new URL(href);
    check(
      assetUrl.origin === hostedBaseUrl.origin && assetUrl.pathname.startsWith(hostedBaseUrl.pathname),
      `Equipment ${equipmentId} hosted ${kind} asset escaped authoritative Pages base: ${href}`,
    );
    const response = await fetch(assetUrl, { cache: "no-store" });
    check(response.ok, `Equipment ${equipmentId} hosted ${kind} asset failed: ${response.status} ${href}`);
    return {
      href: assetUrl.href,
      path: assetUrl.pathname,
      fileName: assetUrl.pathname.split("/").filter(Boolean).at(-1) ?? "",
      status: response.status,
    };
  };

  const stylesheets = [];
  for (const href of discovered.stylesheets) stylesheets.push(await verifyAsset(href, "stylesheet"));
  const scripts = [];
  for (const href of discovered.scripts) scripts.push(await verifyAsset(href, "script"));

  return {
    documentUrl: discovered.documentUrl,
    sourceSha: expectedSourceSha,
    stylesheets,
    scripts,
    result: "PASS",
  };
};

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

      const deploymentAssets = await validateDeploymentAssets(page, testCase.equipmentId);

      const heading = page.locator("main h1");
      check(await heading.count() === 1, `Equipment ${testCase.equipmentId} detail heading missing or duplicated`);
      const displayName = normalizeSemanticText(await heading.innerText());
      check(displayName.length > 0, `Equipment ${testCase.equipmentId} display name is blank`);

      const paragraphLocator = page.locator("main p");
      const rawParagraphTexts = await paragraphLocator.allInnerTexts();
      const expectedSemanticText = normalizeSemanticText(testCase.presentationEffectText);
      const semanticParagraphTexts = rawParagraphTexts.map(normalizeSemanticText);
      const semanticEffectParagraphCount = semanticParagraphTexts.filter(
        (text) => text === expectedSemanticText,
      ).length;
      check(
        semanticEffectParagraphCount === 1,
        `Equipment ${testCase.equipmentId} hosted KR effect semantic mismatch: expected exact paragraph count=1 actual=${semanticEffectParagraphCount} expected=${JSON.stringify(expectedSemanticText)}`,
      );

      const expectedPresentationText = normalizePresentationText(testCase.presentationEffectText);
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
      check(
        expectedLineBreakCount === testCase.expectedLineBreakCount,
        `Equipment ${testCase.equipmentId} runtime fixture newline contract drift: expected=${testCase.expectedLineBreakCount} actual=${expectedLineBreakCount}`,
      );
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
        fixtureLabel: testCase.fixtureLabel,
        displayName,
        sourceEffectText: testCase.effectText,
        effectText: testCase.presentationEffectText,
        sourceLineBreakCount: testCase.sourceLineBreakCount,
        deploymentAssets,
        effectParagraph: "EXACT_MATCH",
        semanticTextMatch: "PRESENTATION_WHITESPACE_ONLY",
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

check(results.length === fixtureDefinitions.length, `representative Equipment result count mismatch: ${results.length}/${fixtureDefinitions.length}`);
check(
  results.filter((result) => result.scope === "general").length === 3 &&
    results.filter((result) => result.scope === "exclusive").length === 3,
  "representative Equipment hosted scope coverage mismatch",
);
check(
  results.some((result) => result.renderedLineBreaks.expectedLineBreakCount === 0),
  "representative Equipment cases do not exercise a single-line effect description",
);
check(
  results.filter((result) => result.sourceLineBreakCount >= 3).length >= 3,
  "representative Equipment cases do not exercise enough long multiline source effect descriptions",
);
check(
  results.some((result) => result.equipmentId === 581 && result.renderedLineBreaks.expectedLineBreakCount === 2),
  "Equipment 581 compact trailer regression proof is missing",
);

const stylesheetAssetSignatures = new Set(
  results.map((result) => JSON.stringify(result.deploymentAssets.stylesheets.map((asset) => asset.path))),
);
check(
  stylesheetAssetSignatures.size === 1,
  `representative Equipment pages loaded inconsistent stylesheet bundles: signatures=${stylesheetAssetSignatures.size}`,
);

console.log(JSON.stringify({
  status: "PASS_EQUIPMENT_EFFECT_DESCRIPTION_KR_HOSTED",
  sourceSha: expectedSourceSha,
  deployedSourceSha: manifest.sourceSha,
  deploymentEvidence: {
    manifestSourceSha: manifest.sourceSha,
    stylesheetSignatureCount: stylesheetAssetSignatures.size,
    representativeAssetProofCount: results.length,
    result: "PASS",
  },
  projectionCount: expectedByEquipmentId.size,
  presentationChangedProjectionCount,
  representativeFixtureCount: fixtureDefinitions.length,
  representativeCases: results,
  nameMutation: false,
  semanticStageReopened: false,
}, null, 2));
