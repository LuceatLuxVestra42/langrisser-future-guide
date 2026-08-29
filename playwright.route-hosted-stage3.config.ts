import { defineConfig } from "@playwright/test";

const baseURL =
  process.env.ROUTE_HOSTED_QA_BASE_URL ??
  "https://luceatluxvestra42.github.io/langrisser-future-guide/";

export default defineConfig({
  testDir: "./tests/route-hosted-browser",
  testMatch: /stage3\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results/route-hosted-qa-stage3.json" }],
  ],
  outputDir: "test-results/route-hosted-qa-stage3-artifacts",
  use: {
    baseURL,
    locale: "ko-KR",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 1000 },
        hasTouch: false,
        isMobile: false,
      },
    },
    {
      name: "chromium-mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
