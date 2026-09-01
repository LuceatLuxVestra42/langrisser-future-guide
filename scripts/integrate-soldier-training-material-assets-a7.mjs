import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

const BRANCH = "work/soldier-training-material-assets-stage1";
const A6_MANIFEST_PATH = "data/manifests/soldier-training-material-assets-a6-webp.v1.json";
const A6_MANIFEST_BLOB = "69af732325de4ddcb0c2ca3bedc5eac9da8edee0";
const COMPONENT_PATH = "src/components/soldier-detail-modal.tsx";
const HELPER_PATH = "src/lib/soldier-training-material-assets.ts";
const VALIDATION_PATH = "data/validation/soldier-training-material-assets-a7.v1.json";
const CHECKPOINT_PATH = "docs/checkpoints/soldier-training-material-assets-a7.md";

const finalizeBuild = process.argv.includes("--finalize-build");
const errors = [];

function fail(condition, message) {
  if (!condition) errors.push(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableWrite(path, payload) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

const manifest = JSON.parse(readFileSync(A6_MANIFEST_PATH, "utf8"));
const currentBlob = execFileSync("git", ["rev-parse", `HEAD:${A6_MANIFEST_PATH}`], {
  encoding: "utf8",
}).trim();

fail(currentBlob === A6_MANIFEST_BLOB, `A6 manifest freshness mismatch: ${currentBlob}`);
fail(manifest.schemaId === "soldier-training-material-assets-a6-webp-delivery/v1", "A6 schema mismatch");
fail(manifest.status === "PASS" && manifest.completion === "COMPLETE", "A6 is not PASS/COMPLETE");
fail(manifest.summary?.target === 24, "A6 target != 24");
fail(manifest.summary?.webpVerified === 24, "A6 webpVerified != 24");
fail(manifest.summary?.losslessPixelParity === 24, "A6 pixel parity != 24");
fail(manifest.summary?.alphaParity === 24, "A6 alpha parity != 24");
fail(manifest.summary?.missing === 0 && manifest.summary?.extras === 0 && manifest.summary?.errors === 0, "A6 has missing/extras/errors");
fail(Array.isArray(manifest.records) && manifest.records.length === 24, "A6 record count != 24");

const itemIds = new Set();
const webpPaths = new Set();
let repositoryHashParity = 0;
let dimensions172 = 0;
let recordPixelParity = 0;
let recordAlphaParity = 0;

for (const record of manifest.records ?? []) {
  itemIds.add(record.itemId);
  webpPaths.add(record.webpPath);
  fail(record.deliveryStatus === "DELIVERED_LOSSLESS", `deliveryStatus mismatch: ${record.itemId}`);
  fail(record.lossless === true, `lossless false: ${record.itemId}`);
  fail(record.pixelParity === true, `pixel parity false: ${record.itemId}`);
  fail(record.alphaParity === true, `alpha parity false: ${record.itemId}`);
  fail(record.width === 172 && record.height === 172, `dimensions mismatch: ${record.itemId}`);
  fail(/^public\/images\/soldier-training-materials-webp\/\d+\.webp$/.test(record.webpPath), `invalid WebP path: ${record.itemId}`);
  fail(record.webpPath === `public/images/soldier-training-materials-webp/${record.itemId}.webp`, `itemId/path parity mismatch: ${record.itemId}`);

  if (record.width === 172 && record.height === 172) dimensions172 += 1;
  if (record.pixelParity === true) recordPixelParity += 1;
  if (record.alphaParity === true) recordAlphaParity += 1;

  if (!existsSync(record.webpPath)) {
    errors.push(`missing repository WebP: ${record.webpPath}`);
    continue;
  }
  const actual = readFileSync(record.webpPath);
  if (sha256(actual) === record.webpSha256 && actual.length === record.webpByteSize) {
    repositoryHashParity += 1;
  } else {
    errors.push(`repository WebP hash/size mismatch: ${record.itemId}`);
  }
}

fail(itemIds.size === 24, `unique item IDs=${itemIds.size}`);
fail(webpPaths.size === 24, `unique WebP paths=${webpPaths.size}`);
fail(repositoryHashParity === 24, `repository WebP hash parity=${repositoryHashParity}`);

let component = readFileSync(COMPONENT_PATH, "utf8");
const helper = readFileSync(HELPER_PATH, "utf8");
const importAnchor = 'import { getOfficialSoldierPortraitUrl } from "@/lib/soldier-portrait-assets";';
const materialImport = 'import { getSoldierTrainingMaterialIconUrl } from "@/lib/soldier-training-material-assets";';

if (!component.includes(materialImport)) {
  fail(component.includes(importAnchor), "Soldier detail import anchor missing");
  component = component.replace(importAnchor, `${importAnchor}\n${materialImport}`);
}

const oldMaterialCard = `          {totals.materials.map((material) => (\n            <div\n              key={\`\${material.goodsType}:\${material.itemId}\`}\n              className="rounded-lg border border-border bg-background px-2.5 py-2"\n            >\n              <p className="truncate text-[10px] font-semibold text-muted-foreground">\n                아이템 #{material.itemId}\n              </p>\n              <p className="mt-0.5 text-base font-black tabular-nums text-foreground">× {material.count}</p>\n            </div>\n          ))}`;

const newMaterialCard = `          {totals.materials.map((material) => {\n            const iconUrl = getSoldierTrainingMaterialIconUrl(material.itemId);\n            return (\n              <div\n                key={\`\${material.goodsType}:\${material.itemId}\`}\n                className="rounded-lg border border-border bg-background px-2.5 py-2"\n              >\n                <div className="flex items-center gap-2">\n                  {iconUrl ? (\n                    <img\n                      src={iconUrl}\n                      alt=""\n                      aria-hidden="true"\n                      width={44}\n                      height={44}\n                      loading="lazy"\n                      className="h-11 w-11 shrink-0 object-contain"\n                    />\n                  ) : (\n                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-black text-muted-foreground">\n                      #{material.itemId}\n                    </div>\n                  )}\n                  <div className="min-w-0">\n                    <p className="truncate text-[10px] font-semibold text-muted-foreground">\n                      아이템 #{material.itemId}\n                    </p>\n                    <p className="mt-0.5 text-base font-black tabular-nums text-foreground">\n                      × {material.count}\n                    </p>\n                  </div>\n                </div>\n              </div>\n            );\n          })}`;

if (component.includes(oldMaterialCard)) {
  component = component.replace(oldMaterialCard, newMaterialCard);
} else {
  fail(component.includes(newMaterialCard), "Training material presentation block is neither legacy nor A7 form");
}

if (!finalizeBuild && errors.length === 0) {
  writeFileSync(COMPONENT_PATH, component, "utf8");
}

const finalComponent = finalizeBuild ? readFileSync(COMPONENT_PATH, "utf8") : component;
fail(finalComponent.includes(materialImport), "A7 material helper import missing");
fail(finalComponent.includes("getSoldierTrainingMaterialIconUrl(material.itemId)"), "A7 itemId icon consumer missing");
fail(finalComponent.includes('src={iconUrl}'), "A7 WebP image consumer missing");
fail(!helper.includes("ConfigData"), "A7 helper must not use raw ConfigData");
fail(!helper.includes("nameKr") && !helper.includes("nameCn"), "A7 helper must not use names as identity");
fail(helper.includes("new Map(manifest.records.map((record) => [record.itemId, record]))"), "A7 helper is not direct itemId map");
fail(helper.includes('record.webpPath.replace(/^public\\//, "")'), "A7 helper does not consume frozen WebP path");

const status = errors.length === 0 ? "PASS" : "FAIL";
const preflight = errors.length === 0 ? "PASS" : "FAIL";
const build = finalizeBuild && errors.length === 0 ? "PASS" : finalizeBuild ? "FAIL" : "PENDING";
const completion = finalizeBuild && errors.length === 0 ? "PREDEPLOY_COMPLETE" : "INCOMPLETE";
const nextStartPoint = finalizeBuild && errors.length === 0
  ? "A7.3 Deployment/Hosted Gate against authoritative GitHub Pages commit, then A7.4 Browser/UI Gate"
  : "A7.2 Build Gate";

const validation = {
  version: 1,
  schemaId: "soldier-training-material-assets-a7-frontend-integration/v1",
  stage: "A7 - Soldier UI Integration",
  status,
  completion,
  predecessor: {
    a6ManifestPath: A6_MANIFEST_PATH,
    expectedA6ManifestBlobSha: A6_MANIFEST_BLOB,
    currentA6ManifestBlobSha: currentBlob,
    a6Status: manifest.status,
    a6Completion: manifest.completion,
  },
  gates: {
    preflight,
    build,
    deploymentHosted: "BLOCKED_AWAITING_AUTHORITATIVE_PAGES_DEPLOY",
    browserUi: "BLOCKED_UNTIL_HOSTED_PASS",
  },
  counts: {
    target: 24,
    uniqueItemIds: itemIds.size,
    uniqueWebpPaths: webpPaths.size,
    repositoryWebpHashParity: repositoryHashParity,
    dimensions172x172: dimensions172,
    manifestPixelParity: recordPixelParity,
    manifestAlphaParity: recordAlphaParity,
    missing: (manifest.records ?? []).filter((record) => !existsSync(record.webpPath)).length,
    errors: errors.length,
  },
  consumer: {
    route: "/soldiers/$soldierId",
    componentPath: COMPONENT_PATH,
    helperPath: HELPER_PATH,
    identity: "itemId",
    assetRoot: "public/images/soldier-training-materials-webp",
    presentation: "training total material cards",
  },
  boundaries: {
    semanticRecomputed: false,
    configDataRuntimeUsed: false,
    nameJoinUsed: false,
    idArithmeticUsed: false,
    fuzzyOrVisualMatchingUsed: false,
    a5PngChanged: false,
    a6WebpChanged: false,
    resolverChangedOutsideDomainHelper: false,
    spAwakenMaterialPresentationChanged: false,
  },
  blocker: finalizeBuild && errors.length === 0
    ? "AUTHORITATIVE_GITHUB_PAGES_DEPLOYMENT_NOT_YET_AT_A7_COMMIT"
    : errors.length > 0
      ? "A7_PREFLIGHT_OR_BUILD_FAILURE"
      : "A7_BUILD_NOT_RUN",
  nextStartPoint,
  hardErrors: errors,
};

stableWrite(VALIDATION_PATH, validation);

mkdirSync(dirname(CHECKPOINT_PATH), { recursive: true });
writeFileSync(
  CHECKPOINT_PATH,
  `# Soldier Training Material Assets A7 — Soldier UI Integration\n\n상태: \`${status} / ${completion}\`\n\n## 현재 상태\n\n- Preflight: **${preflight}**\n- Build: **${build}**\n- Deployment/Hosted: **BLOCKED_AWAITING_AUTHORITATIVE_PAGES_DEPLOY**\n- Browser/UI: **BLOCKED_UNTIL_HOSTED_PASS**\n\nBuild PASS를 Hosted PASS로 간주하지 않는다. 현재 작업 브랜치는 authoritative GitHub Pages 배포 commit이 아니므로 Hosted/Browser gate는 의도적으로 열어 두지 않는다.\n\n## authoritative predecessor\n\n- \`${A6_MANIFEST_PATH}\`\n- expected/current blob: \`${A6_MANIFEST_BLOB}\` / \`${currentBlob}\`\n- A6: \`${manifest.status} / ${manifest.completion}\`\n- A6 WebP: **24/24 lossless decoded-pixel + alpha parity**\n\n## A7 consumer\n\n- helper: \`${HELPER_PATH}\`\n- component: \`${COMPONENT_PATH}\`\n- identity: \`itemId\` direct map\n- asset: \`public/images/soldier-training-materials-webp/{itemId}.webp\`\n- UI: 비-SP 용병 상세의 \`레벨별 소모재료 → 총 소모재료\` 카드에 아이콘 표시\n- 기존 수량/레벨 계산은 변경하지 않음\n\n## Preflight 결과\n\n\`target=24 / unique itemId=${itemIds.size} / WebP path=${webpPaths.size} / repository hash parity=${repositoryHashParity} / 172x172=${dimensions172} / pixel parity=${recordPixelParity} / alpha parity=${recordAlphaParity} / errors=${errors.length}\`\n\n## boundaries\n\n- semantic/ConfigData 재계산 없음\n- raw ConfigData runtime fallback 없음\n- name JOIN / ID arithmetic / fuzzy / visual matching 없음\n- A5 PNG / A6 WebP 변경 없음\n- SP 전직 재료 표현 변경 없음\n- Hosted/Browser 실패가 발생해도 semantic upstream을 자동 재개하지 않음\n\n## 실제 BLOCKER\n\n\`${validation.blocker}\`\n\n## 다음 시작점\n\n${nextStartPoint}.\n\n## 다시 열리는 조건\n\n- A6 manifest blob 또는 24 WebP hash 변경\n- itemId -> WebP path 1:1 parity 파손\n- frontend가 frozen A6 helper를 우회해 다른 asset identity를 생성\n- Hosted에서 base-path/direct-entry/static asset failure 발견 시 presentation/hosting 계층만 재개\n`,
  "utf8",
);

console.log(JSON.stringify(validation, null, 2));
if (errors.length > 0) process.exit(1);
