import crypto from "node:crypto";
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("data/generated/hero-casting-law-material-icon-assets.v1.json", "utf8"));
if (
  manifest?.schemaId !== "hero-casting-law-material-icon-assets/v1" ||
  manifest?.status !== "FROZEN" ||
  manifest?.completion !== "COMPLETE" ||
  !Array.isArray(manifest?.records) ||
  manifest.records.length !== 45
) {
  throw new Error("Casting Law icon manifest is not frozen/complete.");
}

function gitBlobSha(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return crypto.createHash("sha1").update(header).update(bytes).digest("hex");
}

const results = await Promise.all(
  manifest.records.map(async (record) => {
    const response = await fetch(record.asset.url, {
      headers: { "User-Agent": "langrisser-future-guide-casting-law-icon-validator/1" },
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`itemId=${record.itemId} asset HTTP ${response.status}: ${record.asset.url}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha = gitBlobSha(bytes);
    if (bytes.length !== record.asset.bytes) {
      throw new Error(`itemId=${record.itemId} bytes=${bytes.length}, expected=${record.asset.bytes}`);
    }
    if (sha !== record.asset.gitBlobSha) {
      throw new Error(`itemId=${record.itemId} Git blob SHA=${sha}, expected=${record.asset.gitBlobSha}`);
    }
    return {
      itemId: record.itemId,
      bytes: bytes.length,
      gitBlobSha: sha,
      contentType: response.headers.get("content-type"),
    };
  }),
);

console.log(JSON.stringify({
  checkpoint: "HERO_CASTING_LAW_MATERIAL_ICON_NETWORK_PROBE",
  status: "PASS",
  assetCount: results.length,
  totalBytes: results.reduce((sum, row) => sum + row.bytes, 0),
  sourceCommit: manifest.sourceSnapshot.commit,
}, null, 2));
