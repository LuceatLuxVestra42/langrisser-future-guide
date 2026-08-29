import { expect, test, type Page } from "@playwright/test";

const BASE_URL =
  process.env.ROUTE_HOSTED_QA_BASE_URL ??
  "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const EXPECTED_SOURCE_SHA = process.env.ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA?.trim() ?? "";

function hostedUrl(path = "") {
  return new URL(path.replace(/^\/+/, ""), BASE_URL).toString();
}

function installRuntimeGuard(page: Page) {
  const issues: string[] = [];

  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.push(`console.error: ${message.text()}`);
    }
  });

  page.on("requestfailed", (request) => {
    if (["document", "script", "stylesheet"].includes(request.resourceType())) {
      issues.push(
        `requestfailed: ${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
      );
    }
  });

  return {
    assertClean() {
      expect(issues, issues.join("\n")).toEqual([]);
    },
  };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test("desktop: hosted freshness precondition and public surfaces render cleanly", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const guard = installRuntimeGuard(page);

  if (EXPECTED_SOURCE_SHA) {
    const response = await page.request.get(hostedUrl("qa-main-source.txt"));
    expect(response.ok()).toBeTruthy();
    expect((await response.text()).trim()).toBe(EXPECTED_SOURCE_SHA);
  }

  const surfaces = ["", "banners/", "equipment/", "heroes/", "soldiers/"];
  for (const surface of surfaces) {
    const response = await page.goto(hostedUrl(surface), { waitUntil: "domcontentloaded" });
    expect(response, `missing response for ${surface || "/"}`).not.toBeNull();
    expect(response!.status(), `unexpected status for ${surface || "/"}`).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  guard.assertClean();
});

test("desktop: hero search hydrates and history back/forward remains usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const guard = installRuntimeGuard(page);

  await page.goto(hostedUrl("heroes/"), { waitUntil: "domcontentloaded" });
  const search = page.getByLabel("이름 검색");
  await expect(search).toBeVisible();
  await search.focus();
  await page.keyboard.type("레온");

  await expect(page.getByText(/검색 결과/)).toContainText("1 / 267명");
  const leonLink = page.getByRole("link", { name: /레온 SSR 상세 보기/ });
  await expect(leonLink).toHaveCount(1);
  await leonLink.click();

  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/6\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "레온" })).toBeVisible();

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/?$/);
  await expect(page.getByLabel("이름 검색")).toBeVisible();

  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/6\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "레온" })).toBeVisible();

  guard.assertClean();
});

test("desktop: Soldier modal preserves parent filter state and scroll position", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const guard = installRuntimeGuard(page);

  await page.goto(hostedUrl("soldiers/"), { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("검색");
  await search.fill("중장 창병");
  await expect(page.getByText("1개 표시")).toBeVisible();

  const soldier102 = page.getByRole("link", { name: "중장 창병 상세 보기" });
  await soldier102.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/102\/?$/);

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);
  await expect(search).toHaveValue("중장 창병");

  await search.clear();
  await expect(page.getByText("224개 표시")).toBeVisible();
  const cards = page.locator('section[aria-label="용병 목록"] a[aria-label$="상세 보기"]');
  expect(await cards.count()).toBeGreaterThan(100);

  const target = cards.nth(80);
  await target.scrollIntoViewIfNeeded();
  const beforeScroll = await page.evaluate(() => window.scrollY);
  expect(beforeScroll).toBeGreaterThan(300);

  await target.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "상세 창 닫기" }).click();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);

  const afterScroll = await page.evaluate(() => window.scrollY);
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThan(180);

  guard.assertClean();
});

test("desktop: unknown IDs render the intended application not-found UI", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const guard = installRuntimeGuard(page);

  const cases = [
    ["heroes/999999/", "영웅을 찾을 수 없어."],
    ["soldiers/999999/", "용병을 찾을 수 없어"],
    ["equipment/999999/", "공개 장비를 찾을 수 없습니다."],
  ] as const;

  for (const [path, heading] of cases) {
    const response = await page.goto(hostedUrl(path), { waitUntil: "domcontentloaded" });
    expect(response, `missing response for ${path}`).not.toBeNull();
    expect(response!.status(), `unknown-id status for ${path}`).toBe(404);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }

  guard.assertClean();
});

test("mobile: responsive layout supports touch and keyboard interactions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  const guard = installRuntimeGuard(page);

  await page.goto(hostedUrl("soldiers/"), { waitUntil: "domcontentloaded" });
  await expectNoHorizontalOverflow(page);

  const spButton = page.getByRole("button", { name: "SP" });
  await spButton.tap();
  await expect(spButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("56개 표시")).toBeVisible();

  const firstSpCard = page
    .locator('section[aria-label="용병 목록"] a[aria-label$="상세 보기"]')
    .first();
  await firstSpCard.tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "상세 창 닫기" }).tap();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);

  await page.goto(hostedUrl("heroes/"), { waitUntil: "domcontentloaded" });
  await expectNoHorizontalOverflow(page);
  const heroSearch = page.getByLabel("이름 검색");
  await heroSearch.focus();
  await page.keyboard.type("레온");
  await expect(page.getByText(/검색 결과/)).toContainText("1 / 267명");

  guard.assertClean();
});
