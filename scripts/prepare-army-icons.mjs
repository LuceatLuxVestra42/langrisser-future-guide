import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "data/configdata/ConfigDataArmyInfo.json");
const MANIFEST_PATH = path.join(ROOT, "data/generated/army-icon-manifest.v1.json");
const PUBLIC_DIR = path.join(ROOT, "public/images/army");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const sourceRootIndex = args.indexOf("--source-root");
const sourceRoot =
  sourceRootIndex >= 0 && args[sourceRootIndex + 1]
    ? path.resolve(args[sourceRootIndex + 1])
    : process.env.LANGRISSER_ARMY_ASSET_ROOT
      ? path.resolve(process.env.LANGRISSER_ARMY_ASSET_ROOT)
      : null;
const sourceLabelIndex = args.indexOf("--source-label");
const sourceLabel =
  sourceLabelIndex >= 0 && args[sourceLabelIndex + 1]
    ? args[sourceLabelIndex + 1]
    : "Unity export; source path intentionally not persisted";

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));

if (!Array.isArray(config)) throw new Error("ConfigDataArmyInfo.json must be an array.");
if (!Array.isArray(manifest.records) || manifest.records.length !== 10) {
  throw new Error(`Expected 10 army icon manifest records; got ${manifest.records?.length ?? 0}.`);
}

const configById = new Map(config.map((record) => [record.ID, record]));
const errors = [];

for (const record of manifest.records) {
  const source = configById.get(record.armyId);
  if (!source) {
    errors.push(`${record.armyType}: Army ID ${record.armyId} is missing from ConfigDataArmyInfo.json`);
    continue;
  }

  if (source.Icon_NoBack !== record.iconNoBackLocator) {
    errors.push(
      `${record.armyType}: Icon_NoBack mismatch (manifest=${record.iconNoBackLocator}, config=${source.Icon_NoBack})`,
    );
  }

  const expectedFileName = path.posix.basename(source.Icon_NoBack);
  if (expectedFileName !== record.fileName) {
    errors.push(
      `${record.armyType}: filename mismatch (manifest=${record.fileName}, config=${expectedFileName})`,
    );
  }
}

if (new Set(manifest.records.map((record) => record.armyType)).size !== 10) {
  errors.push("armyType values must be unique.");
}
if (new Set(manifest.records.map((record) => record.armyId)).size !== 10) {
  errors.push("armyId values must be unique.");
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

const existingPublicFiles = [];
for (const record of manifest.records) {
  const outputPath = path.join(PUBLIC_DIR, record.fileName);
  if (await exists(outputPath)) existingPublicFiles.push(record.fileName);
}

if (manifest.assetsReady && existingPublicFiles.length !== manifest.records.length) {
  errors.push(
    `manifest.assetsReady=true but only ${existingPublicFiles.length}/${manifest.records.length} public army icons exist.`,
  );
}
if (!manifest.assetsReady && existingPublicFiles.length > 0) {
  errors.push(
    `Partial/unactivated public army icon import detected (${existingPublicFiles.length}/${manifest.records.length}). Run the import pipeline to completion.`,
  );
}

if (errors.length > 0) {
  console.error("Army icon pipeline validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (checkOnly) {
  console.log(
    `Army icon locator validation PASS: ${manifest.records.length} ConfigData Icon_NoBack mappings; assetsReady=${manifest.assetsReady}.`,
  );
  process.exit(0);
}

if (!sourceRoot) {
  console.log("Army icon locators are valid, but no source root was supplied.");
  console.log(
    "Import usage: node scripts/prepare-army-icons.mjs --source-root <directory containing UI/Icon/Army_ABS or the Army_ABS files> [--source-label <provenance>]",
  );
  process.exit(0);
}

await mkdir(PUBLIC_DIR, { recursive: true });

function sourceCandidates(record) {
  return [
    path.join(sourceRoot, ...record.iconNoBackLocator.split("/")),
    path.join(sourceRoot, "UI", "Icon", "Army_ABS", record.fileName),
    path.join(sourceRoot, "Army_ABS", record.fileName),
    path.join(sourceRoot, record.fileName),
  ];
}

for (const record of manifest.records) {
  const candidates = sourceCandidates(record);
  let inputPath = null;
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      inputPath = candidate;
      break;
    }
  }

  if (!inputPath) {
    throw new Error(
      `${record.armyType}: could not locate ${record.fileName} below ${sourceRoot}. Checked: ${candidates.join(", ")}`,
    );
  }

  await copyFile(inputPath, path.join(PUBLIC_DIR, record.fileName));
  console.log(`${record.armyType}: ${inputPath} -> public/images/army/${record.fileName}`);
}

manifest.assetsReady = true;
manifest.importedAssetCount = manifest.records.length;
manifest.importedFrom = sourceLabel;
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Army icon import PASS: ${manifest.records.length} official Icon_NoBack PNGs copied.`);
console.log(`Updated ${path.relative(ROOT, MANIFEST_PATH)} with assetsReady=true.`);
