import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const producerPath = path.join(root, "scripts/build-equipment-name-kr-presentation.mjs");
const inputs = [
  "data/localization/equipment-name-kr/weapon.tsv",
  "data/localization/equipment-name-kr/armor.tsv",
  "data/localization/equipment-name-kr/headgear.tsv",
  "data/localization/equipment-name-kr/accessory.tsv",
  "data/generated/equipment_stage3_2_display_metadata.json",
];
const outputs = [
  "data/generated/equipment-name-kr-user-approved.v1.json",
  "data/validation/equipment-name-kr-user-approved-summary.v1.json",
];

function fail(message) {
  console.error(`[equipment-name-kr-freshness] FAIL: ${message}`);
  process.exit(1);
}

for (const absolutePath of [
  producerPath,
  ...inputs.map((value) => path.join(root, value)),
  ...outputs.map((value) => path.join(root, value)),
]) {
  if (!fs.existsSync(absolutePath)) {
    fail(`missing required path: ${path.relative(root, absolutePath)}`);
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "equipment-name-kr-freshness-"));

try {
  for (const relativePath of inputs) {
    const source = path.join(root, relativePath);
    const target = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  const result = spawnSync(process.execPath, [producerPath], {
    cwd: tempRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`producer failed in isolated temp workspace with exit ${result.status}`);
  }

  const stale = [];
  for (const relativePath of outputs) {
    const expectedPath = path.join(tempRoot, relativePath);
    const trackedPath = path.join(root, relativePath);
    if (!fs.existsSync(expectedPath)) {
      fail(`producer did not create expected output: ${relativePath}`);
    }

    const expected = fs.readFileSync(expectedPath);
    const tracked = fs.readFileSync(trackedPath);
    if (!expected.equals(tracked)) stale.push(relativePath);
  }

  if (stale.length > 0) {
    fail(
      `stale generated presentation: ${stale.join(", ")}. Run npm run prepare:equipment-names and commit the refreshed outputs.`,
    );
  }

  console.log(`[equipment-name-kr-freshness] PASS outputs=${outputs.length}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
