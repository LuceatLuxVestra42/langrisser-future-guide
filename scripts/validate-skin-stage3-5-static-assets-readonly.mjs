import fs from "node:fs";
import { evaluateStaticWebAssetManifest } from "./validate-skin-stage3-5-static-web-assets.mjs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const contract = readJson("data/contracts/skin-stage3-5-static-web-asset-map.v1.json");
const manifest = readJson("data/generated/skin-stage3-5-static-web-asset-map.v1.json");
const relation = readJson("data/generated/skin-stage2-3-bidirectional-relation.v1.json");
const frozenValidation = readJson("data/validation/skin-stage3-5-static-web-asset-map.v1.json");
const result = evaluateStaticWebAssetManifest(manifest, relation, ".", contract);
if (!result.finalReady || result.counts.acceptedSkinCount !== 540 || result.counts.missingFileCount !== 0 || result.counts.hashMismatchCount !== 0 || result.counts.unexpectedFileCount !== 0) {
  throw new Error(`Frozen Skin static asset validation failed: ${JSON.stringify(result.counts)}`);
}
if (frozenValidation.finalReady !== true || frozenValidation.status !== result.status || JSON.stringify(frozenValidation.counts) !== JSON.stringify(result.counts)) {
  throw new Error("Frozen Skin validation checkpoint no longer matches current repository bytes.");
}
console.log(JSON.stringify({ status: "PASS_SKIN_STATIC_ASSETS_READONLY", finalReady: true, skinCount: 540, repositoryMutation: false }, null, 2));
