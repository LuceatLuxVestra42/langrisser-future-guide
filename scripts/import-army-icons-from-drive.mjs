import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data/generated/army-icon-manifest.v1.json");
const PUBLIC_DIR = path.join(ROOT, "public/images/army");
const TMP_DIR = path.join(ROOT, ".tmp/army-icons-drive");

const ASSETS = [
  {
    fileName: "Icon_Occupation_Infantryman.png",
    driveId: "1nnOmWQl1CvpODSiKcJyQEtMfyARvo3qI",
    size: 10862,
    sha256: "7864de7f6fa31377012c824a552c85f0f3fa81762745c0ab222670978b4b9c92",
  },
  {
    fileName: "Icon_Occupation_Marines.png",
    driveId: "16Gw5BRJvVLO0LBFWf9M3ncpghH-yJQwL",
    size: 11194,
    sha256: "78790ef4c6fc1aca9fc4e44c38beb9359f1ab2b6509e600cd2d087e7b594d028",
  },
  {
    fileName: "Icon_Occupation_Cavalry.png",
    driveId: "12JpJkaQh8m2CAqg09bCLAJoZJ55bmTce",
    size: 12941,
    sha256: "02ea484bc271a05a4d3aecb5e71e4c5f032ebf9914764874deb0f3938e2ce0cf",
  },
  {
    fileName: "Icon_Occupation_Fly.png",
    driveId: "1D4Z_DxDRwF5SEvZ8YiwyZYdMd4xb1P13",
    size: 11941,
    sha256: "c3265c6f8adfbd835fd7de56441ab8b6f970859923464c3a922d8108e48fa2eb",
  },
  {
    fileName: "Icon_Occupation_Water.png",
    driveId: "1HyUR4FM2kK1em8Xr88OPehzAc1iwTzlY",
    size: 13074,
    sha256: "400570f4dd3575ec101fdba7e05600c0c9651f5d3651b96cf75e20344d72bc85",
  },
  {
    fileName: "Icon_Occupation_Archer.png",
    driveId: "1jYcXCvQmfE4-II3YPKS6wfOYU9L8fbT0",
    size: 12886,
    sha256: "51aefdc214440a9ace89a0a50b98b50920362b2e22815855d03bc3f13447f429",
  },
  {
    fileName: "Icon_Occupation_Assassin.png",
    driveId: "1GP_ERKwjcc_B7q2Ngz_4uADYyXFpc_Vp",
    size: 12798,
    sha256: "ae5b6e4f0c0cd69462d141ddb6ec24b2fee23da3f47bdbf3f6582ca21f8e6003",
  },
  {
    fileName: "Icon_Occupation_Magician.png",
    driveId: "1KKfyJU84fcafIvJ2bV5yOHQ0oR5zaMnc",
    size: 12676,
    sha256: "040c4280a713310f8362e72ac6a5fd7d162ae366adc428798800f94d8283c97a",
  },
  {
    fileName: "Icon_Occupation_Monk.png",
    driveId: "1y7R0cQO3usKfQgBo-iNYPdiHQ1VIa1MM",
    size: 11944,
    sha256: "ff6e2c449ed704dbd5bfd6c4f7df4f1e1f7945e21ae473f8584f6eb96448a556",
  },
  {
    fileName: "Icon_Occupation_Monster.png",
    driveId: "1aaKiQdZhoxu4nuhpD1k-bskArjdRgLcc",
    size: 10488,
    sha256: "5a49287ad3e56e90476b0ffaa6e3d1dc4241091ada513170da6fbdcfb1d23aab",
  },
];

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isPng(bytes) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

async function isExpectedFile(filePath, asset) {
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size !== asset.size) return false;
    const bytes = await readFile(filePath);
    return isPng(bytes) && digest(bytes) === asset.sha256;
  } catch {
    return false;
  }
}

async function downloadAsset(asset) {
  const urls = [
    `https://drive.usercontent.google.com/download?id=${asset.driveId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${asset.driveId}&confirm=t`,
  ];

  const failures = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0" },
      });
      if (!response.ok) {
        failures.push(`${response.status} ${response.statusText} from ${new URL(url).host}`);
        continue;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (!isPng(bytes)) {
        failures.push(`non-PNG response from ${new URL(url).host}`);
        continue;
      }
      if (bytes.length !== asset.size) {
        failures.push(
          `size mismatch from ${new URL(url).host}: expected ${asset.size}, got ${bytes.length}`,
        );
        continue;
      }

      const actualSha = digest(bytes);
      if (actualSha !== asset.sha256) {
        failures.push(
          `SHA-256 mismatch from ${new URL(url).host}: expected ${asset.sha256}, got ${actualSha}`,
        );
        continue;
      }

      const outputPath = path.join(TMP_DIR, asset.fileName);
      await writeFile(outputPath, bytes);
      console.log(`downloaded ${asset.fileName} (${bytes.length} bytes)`);
      return;
    } catch (error) {
      failures.push(`${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`${asset.fileName}: download failed: ${failures.join("; ")}`);
}

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const manifestNames = new Set(manifest.records?.map((record) => record.fileName) ?? []);
if (ASSETS.length !== 10 || ASSETS.some((asset) => !manifestNames.has(asset.fileName))) {
  throw new Error("Drive asset source list does not match the 10-record army icon manifest.");
}

let ready = manifest.assetsReady === true;
for (const asset of ASSETS) {
  if (!(await isExpectedFile(path.join(PUBLIC_DIR, asset.fileName), asset))) {
    ready = false;
    break;
  }
}

if (ready) {
  console.log("Official army icon import already complete: 10/10 expected PNGs verified by SHA-256.");
  process.exit(0);
}

await rm(PUBLIC_DIR, { recursive: true, force: true });
await rm(TMP_DIR, { recursive: true, force: true });
await mkdir(TMP_DIR, { recursive: true });

manifest.assetsReady = false;
delete manifest.importedAssetCount;
delete manifest.importedFrom;
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

for (const asset of ASSETS) {
  await downloadAsset(asset);
}

const result = spawnSync(
  process.execPath,
  [
    path.join(ROOT, "scripts/prepare-army-icons.mjs"),
    "--source-root",
    TMP_DIR,
    "--source-label",
    "Korean legacy sheet asset Drive; exact filename matched to ConfigData Icon_NoBack and SHA-256 pinned",
  ],
  { cwd: ROOT, stdio: "inherit" },
);

await rm(TMP_DIR, { recursive: true, force: true });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("Army icon Drive import PASS: 10/10 PNGs staged into public/images/army.");
