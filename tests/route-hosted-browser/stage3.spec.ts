import { expect, test, type Page, type Request } from "@playwright/test";

const BASE_URL =
  process.env.ROUTE_HOSTED_QA_BASE_URL ??
  "https://luceatluxvestra42.github.io/langrisser-future-guide/";
const EXPECTED_SOURCE_SHA = process.env.ROUTE_HOSTED_QA_EXPECTED_SOURCE_SHA?.trim() ?? "";
const BASE_ORIGIN = new URL(BASE_URL).origin;
const REPOSITORY_BASE = "/langrisser-future-guide/";

function hostedUrl(path = "") {
  return new URL(path.replace(/^\/+/, ""), BASE_URL).toString();
}

function guardedResourceType(request: Request) {
  return ["document", "fetch", "xhr", "script", "stylesheet"].includes(request.resourceType());
}

function installNavigationAudit(
  page: Page,
  options: { allowExpectedDocument404?: boolean } = {},
) {
  const issues: string[] = [];

  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (
      options.allowExpectedDocument404 &&
      text.includes("Failed to load resource") &&
      text.includes("status of 404")
    ) {
      return;
    }
    issues.push(`console.error: ${text}`);
  });

  page.on("requestfailed", (request) => {
    if (!guardedResourceType(request)) return;
    issues.push(
      `requestfailed: ${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    );
  });

  page.on("response", (response) => {
    const request = response.request();
    if (!guardedResourceType(request) || response.status() < 400) return;

    const url = new URL(response.url());
    if (url.origin !== BASE_ORIGIN) return;
    if (
      options.allowExpectedDocument404 &&
      request.resourceType() === "document" &&
      response.status() === 404
    ) {
      return;
    }

    issues.push(
      `http-error: ${response.status()} ${request.resourceType()} ${request.method()} ${response.url()}`,
    );
  });

  return {
    assertClean() {
      expect(issues, issues.join("\n")).toEqual([]);
    },
  };
}

async function expectBrowserEdgeFresh(page: Page) {
  if (!EXPECTED_SOURCE_SHA) return;

  await expect
    .poll(
      async () => {
        const sentinel = new URL(hostedUrl("qa-main-source.txt"));
        sentinel.searchParams.set("qa3-browser-freshness", `${Date.now()}`);
        const response = await page.request.get(sentinel.toString(), {
          headers: { "cache-control": "no-cache" },
        });
        if (!response.ok()) return `HTTP_${response.status()}`;
        return (await response.text()).trim();
      },
      {
        message: "QA-3 Browser edge must expose the deployed candidate SHA",
        timeout: 60_000,
        intervals: [1_000, 2_000, 5_000, 5_000, 10_000],
      },
    )
    .toBe(EXPECTED_SOURCE_SHA);
}

async function expectRepositoryBase(page: Page) {
  expect(new URL(page.url()).pathname.startsWith(REPOSITORY_BASE)).toBe(true);
}

test("desktop: home to Hero detail keeps deep document history and clean runtime", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const audit = installNavigationAudit(page);

  await expectBrowserEdgeFresh(page);
  await page.goto(hostedUrl(), { waitUntil: "domcontentloaded" });
  await expectRepositoryBase(page);

  const heroCategory = page.getByRole("link", { name: "캐릭터" });
  await expect(heroCategory).toHaveAttribute("href", "/langrisser-future-guide/heroes/");
  await heroCategory.click();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/?$/);

  const search = page.getByLabel("이름 검색");
  await search.fill("레온");
  const leonLink = page.getByRole("link", { name: /레온 SSR 상세 보기/ });
  await expect(leonLink).toHaveCount(1);
  await expect(leonLink).toHaveAttribute("href", "/langrisser-future-guide/heroes/6/");
  await leonLink.click();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/6\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "레온" })).toBeVisible();

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "영웅" })).toBeVisible();

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("랑그릿사 모바일");

  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "영웅" })).toBeVisible();

  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/6\/?$/);
  await expect(page.getByRole("heading", { level: 1, name: "레온" })).toBeVisible();
  await expectRepositoryBase(page);

  audit.assertClean();
});

test("desktop: Soldier modal follows browser back/forward and preserves parent filter", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const audit = installNavigationAudit(page);

  await expectBrowserEdgeFresh(page);
  await page.goto(hostedUrl("soldiers/"), { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder("검색");
  await search.fill("중장 창병");
  await expect(page.getByText("1개 표시")).toBeVisible();

  await page.getByRole("link", { name: "중장 창병 상세 보기" }).click();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/102\/?$/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(search).toHaveValue("중장 창병");
  await expect(page.getByText("1개 표시")).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/102\/?$/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("중장 창병", { exact: true }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);
  await expect(search).toHaveValue("중장 창병");

  audit.assertClean();
});

test("desktop: unknown Hero 404 can recover to home and survive history traversal", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop");
  const audit = installNavigationAudit(page, { allowExpectedDocument404: true });

  await expectBrowserEdgeFresh(page);
  const response = await page.goto(hostedUrl("heroes/999999/"), { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "영웅을 찾을 수 없어." })).toBeVisible();

  const homeLink = page.getByRole("link", { name: "메인으로 돌아가기" });
  await expect(homeLink).toHaveAttribute("href", "/langrisser-future-guide/");
  await homeLink.click();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("랑그릿사 모바일");

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/heroes\/999999\/?$/);
  await expect(page.getByRole("heading", { name: "영웅을 찾을 수 없어." })).toBeVisible();

  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/langrisser-future-guide\/?$/);
  await expectRepositoryBase(page);

  audit.assertClean();
});

test("mobile: Soldier detail history works with touch navigation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-mobile");
  const audit = installNavigationAudit(page);

  await expectBrowserEdgeFresh(page);
  await page.goto(hostedUrl(), { waitUntil: "domcontentloaded" });
  const soldierCategory = page.getByRole("link", { name: "용병" });
  await expect(soldierCategory).toHaveAttribute("href", "/langrisser-future-guide/soldiers/");
  await soldierCategory.tap();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);

  const search = page.getByPlaceholder("검색");
  await search.fill("중장 창병");
  await page.getByRole("link", { name: "중장 창병 상세 보기" }).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/102\/?$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/?$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(search).toHaveValue("중장 창병");

  await page.goForward();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/langrisser-future-guide\/soldiers\/102\/?$/);
  await expectRepositoryBase(page);

  audit.assertClean();
});
