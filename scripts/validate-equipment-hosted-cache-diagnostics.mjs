import { chromium } from "playwright";

const baseUrl = (process.env.HOSTED_BASE_URL || "https://luceatluxvestra42.github.io/langrisser-future-guide/").replace(/\/?$/, "/");
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA;
if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");

const check = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const url = (path) => new URL(path.replace(/^\//, ""), baseUrl).toString();
const hostedBaseUrl = new URL(baseUrl);

const cacheHeaderNames = [
  "cache-control",
  "etag",
  "last-modified",
  "age",
  "expires",
  "via",
  "x-cache",
  "x-cache-hits",
];

const selectCacheHeaders = (headers) => Object.fromEntries(
  cacheHeaderNames
    .filter((name) => headers[name] !== undefined)
    .map((name) => [name, headers[name]]),
);

const fetchEvidence = async (href, label) => {
  const response = await fetch(href, { cache: "no-store" });
  check(response.ok, `${label} request failed: ${response.status} ${href}`);
  const headers = Object.fromEntries(response.headers.entries());
  const cacheHeaders = selectCacheHeaders(headers);
  check(
    cacheHeaders["cache-control"] || cacheHeaders.etag || cacheHeaders["last-modified"],
    `${label} has no cache/revalidation metadata: ${href}`,
  );
  return {
    href,
    status: response.status,
    cacheHeaders,
  };
};

let manifestEvidence = null;
let manifest = null;
for (let attempt = 1; attempt <= 120; attempt += 1) {
  try {
    const manifestUrl = url(`authoritative-pages-source.json?qa=${Date.now()}`);
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (response.ok) {
      const candidate = await response.json();
      if (candidate.sourceSha === expectedSourceSha) {
        const headers = Object.fromEntries(response.headers.entries());
        manifestEvidence = {
          href: manifestUrl,
          status: response.status,
          cacheHeaders: selectCacheHeaders(headers),
        };
        manifest = candidate;
        break;
      }
    }
  } catch {}
  if (attempt < 120) await sleep(5000);
}

check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha}`);
check(manifest.semanticStageReopened === false, "deployment manifest reopened semantic stage");
check(
  manifestEvidence.cacheHeaders["cache-control"] || manifestEvidence.cacheHeaders.etag || manifestEvidence.cacheHeaders["last-modified"],
  "authoritative deployment manifest has no cache/revalidation metadata",
);
check(
  !String(manifestEvidence.cacheHeaders["cache-control"] ?? "").toLowerCase().includes("immutable"),
  "authoritative deployment manifest must not be immutable-cached",
);

const browser = await chromium.launch({ headless: true });
let result;

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    const detailUrl = url("equipment/581/");
    const response = await page.goto(detailUrl, { waitUntil: "networkidle", timeout: 45000 });
    check(response && response.status() < 400, `Equipment 581 detail failed: ${response?.status()}`);

    const responseHeaders = await response.allHeaders();
    const documentCacheHeaders = selectCacheHeaders(responseHeaders);
    check(
      documentCacheHeaders["cache-control"] || documentCacheHeaders.etag || documentCacheHeaders["last-modified"],
      "Equipment 581 document has no cache/revalidation metadata",
    );
    check(
      !String(documentCacheHeaders["cache-control"] ?? "").toLowerCase().includes("immutable"),
      "Equipment 581 HTML document must not be immutable-cached",
    );

    const serviceWorker = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) {
        return { supported: false, controlled: false, registrationCount: 0, scopes: [] };
      }
      const registrations = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        controlled: Boolean(navigator.serviceWorker.controller),
        registrationCount: registrations.length,
        scopes: registrations.map((registration) => registration.scope).sort(),
      };
    });

    check(!serviceWorker.controlled, "Equipment hosted page is controlled by a service worker; stale-cache behavior requires explicit review");
    check(serviceWorker.registrationCount === 0, `Equipment hosted page has service worker registrations: ${serviceWorker.registrationCount}`);

    const discoverAssets = () => page.evaluate(() => ({
      stylesheets: [...new Set(
        Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]'), (element) => element.href),
      )].sort(),
      scripts: [...new Set(
        Array.from(document.querySelectorAll("script[src]"), (element) => element.src),
      )].sort(),
    }));

    const firstAssets = await discoverAssets();
    check(firstAssets.stylesheets.length > 0, "Equipment 581 page has no stylesheet assets");
    check(firstAssets.scripts.length > 0, "Equipment 581 page has no script assets");

    const validateAsset = async (href, kind) => {
      const assetUrl = new URL(href);
      check(
        assetUrl.origin === hostedBaseUrl.origin && assetUrl.pathname.startsWith(hostedBaseUrl.pathname),
        `Equipment 581 ${kind} asset escaped authoritative Pages base: ${href}`,
      );
      const evidence = await fetchEvidence(assetUrl.href, `Equipment 581 ${kind} asset`);
      const fileName = assetUrl.pathname.split("/").filter(Boolean).at(-1) ?? "";
      return {
        ...evidence,
        path: assetUrl.pathname,
        fileName,
        fingerprinted: /(?:^|[-_.])[A-Za-z0-9_-]{7,}\.(?:css|js)$/i.test(fileName),
      };
    };

    const stylesheets = [];
    for (const href of firstAssets.stylesheets) stylesheets.push(await validateAsset(href, "stylesheet"));
    const scripts = [];
    for (const href of firstAssets.scripts) scripts.push(await validateAsset(href, "script"));

    await page.reload({ waitUntil: "networkidle", timeout: 45000 });
    const secondAssets = await discoverAssets();
    check(
      JSON.stringify(secondAssets) === JSON.stringify(firstAssets),
      "Equipment 581 asset signature changed across immediate reload",
    );

    result = {
      status: "PASS_EQUIPMENT_HOSTED_CACHE_DIAGNOSTICS",
      sourceSha: expectedSourceSha,
      deployedSourceSha: manifest.sourceSha,
      document: {
        href: detailUrl,
        status: response.status(),
        cacheHeaders: documentCacheHeaders,
      },
      manifest: manifestEvidence,
      serviceWorker,
      assets: {
        stylesheets,
        scripts,
        firstLoadSignature: firstAssets,
        reloadSignature: secondAssets,
        stableAcrossReload: true,
      },
      diagnosis: {
        immutableDocumentCache: false,
        serviceWorkerControlled: false,
        serviceWorkerRegistrations: 0,
        assetSignatureStableAcrossReload: true,
        result: "PASS",
      },
    };
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
