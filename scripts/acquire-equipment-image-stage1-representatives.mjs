import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const EQUIPMENT_ASSET_FOLDER_ID = '1VDnmXeLilTogokXV-5UW-RinS2vMtVVp';
const EVIDENCE_PATH = path.join(ROOT, 'data/evidence/equipment-image-stage1-source-evidence.v1.json');

const representatives = [
  {
    label: 'weapon',
    equipmentId: 6,
    fileName: 'Equip_Dagger6.png',
    driveFileId: '1cVKDb30uIqCQ-P52LXKWyv2CG6Xtk5Il',
    sourceLocator: 'UI/Icon/Equip_ABS/Equip_Dagger6.png',
    targetRepositoryPath: 'public/images/equipment/6.png',
    expectedBytes: 20097,
    expectedSha256: '4a58142e159ae0df9b941e1182e006a197ae299ba031c6acca93d679227f566d',
  },
  {
    label: 'armor',
    equipmentId: 59,
    fileName: 'Equip_MetalArmor6.png',
    driveFileId: '1lH5FpBU5wkwY3JSv9f7fJfPY2ibwGOj5',
    sourceLocator: 'UI/Icon/Equip_ABS/Equip_MetalArmor6.png',
    targetRepositoryPath: 'public/images/equipment/59.png',
    expectedBytes: 29003,
    expectedSha256: 'd7a8b62a6d7c09daa5ee01aa1686c12eaada9fa8e767b23739c2a2ef59f82699',
  },
  {
    label: 'headgear',
    equipmentId: 80,
    fileName: 'Equip_MetalHelmet6.png',
    driveFileId: '1mvvsBEsd-puHPk8sccCxRIRwgCaO1cKG',
    sourceLocator: 'UI/Icon/Equip_ABS/Equip_MetalHelmet6.png',
    targetRepositoryPath: 'public/images/equipment/80.png',
    expectedBytes: 33866,
    expectedSha256: '773e1ba326105eba3e47e64363bf417d86402cffc95eb7e4aba87f2fbefa71c8',
  },
  {
    label: 'accessory',
    equipmentId: 99,
    fileName: 'Equip_Boots4.png',
    driveFileId: '1eWi_PDFTtMOJ_0rXRiil7-RHcEGk55Uh',
    sourceLocator: 'UI/Icon/Equip_ABS/Equip_Boots4.png',
    targetRepositoryPath: 'public/images/equipment/99.png',
    expectedBytes: 29291,
    expectedSha256: 'b1d0c0a7ce6f45c6391b75b36a1c3be39ea9021ae57778a734053a5be9cf1828',
  },
  {
    label: 'exclusive-equipment',
    equipmentId: 273,
    fileName: 'Equip_Sword13.png',
    driveFileId: '16O7zSzTqVerxftMnghdjkwwGjmVAU7TC',
    sourceLocator: 'UI/Icon/Equip_ABS/Equip_Sword13.png',
    targetRepositoryPath: 'public/images/equipment/273.png',
    expectedBytes: 19383,
    expectedSha256: 'fff84e6beaf9793017abea71b6cfddf0cca73cd8256cb22a6f840c1187f38f82',
  },
];

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function inspectPng(data) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngSignatureValid = data.length >= 24 && data.subarray(0, 8).equals(signature);
  const ihdrValid = pngSignatureValid && data.subarray(12, 16).toString('ascii') === 'IHDR';
  return {
    pngSignatureValid,
    ihdrValid,
    width: ihdrValid ? data.readUInt32BE(16) : null,
    height: ihdrValid ? data.readUInt32BE(20) : null,
  };
}

async function downloadExactDriveFile(record) {
  const url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(record.driveFileId)}&export=download&confirm=t`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`${record.fileName}: Google Drive download failed: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const evidenceRecords = [];
const discoveryResults = [];

for (const record of representatives) {
  const data = await downloadExactDriveFile(record);
  const digest = sha256(data);
  const png = inspectPng(data);

  if (data.length !== record.expectedBytes) {
    throw new Error(`${record.fileName}: byte length ${data.length} != expected ${record.expectedBytes}`);
  }
  if (digest !== record.expectedSha256) {
    throw new Error(`${record.fileName}: SHA-256 ${digest} != expected ${record.expectedSha256}`);
  }
  if (!png.pngSignatureValid || !png.ihdrValid) {
    throw new Error(`${record.fileName}: invalid PNG signature/IHDR`);
  }
  if (png.width !== 172 || png.height !== 172) {
    throw new Error(`${record.fileName}: dimensions ${png.width}x${png.height} != expected 172x172`);
  }

  const target = path.join(ROOT, record.targetRepositoryPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);

  discoveryResults.push({
    fileName: record.fileName,
    matchCount: 1,
    folderId: EQUIPMENT_ASSET_FOLDER_ID,
    driveFileId: record.driveFileId,
  });

  evidenceRecords.push({
    label: record.label,
    equipmentId: record.equipmentId,
    sourceLocator: record.sourceLocator,
    sourceEvidenceStatus: 'VERIFIED_EXACT_SOURCE_EXPORT',
    sourceArtifact: `google-drive:file:${record.driveFileId};folder:${EQUIPMENT_ASSET_FOLDER_ID};name:${record.fileName}`,
    sourceSha256: digest,
    sourceBytes: data.length,
    sourceWidth: png.width,
    sourceHeight: png.height,
  });

  console.log(`${record.equipmentId} ${record.fileName}: ${data.length} bytes ${png.width}x${png.height} sha256=${digest}`);
}

const evidence = {
  evidence: 'equipment-image-stage1-source-evidence-v1',
  stage: 'Equipment Image Stage 1',
  status: 'VERIFIED_EXACT_SOURCE_EXPORT',
  discovery: {
    connectedSource: 'Korean legacy sheet asset Google Drive / 장비 folder',
    folderId: EQUIPMENT_ASSET_FOLDER_ID,
    method: 'parent-scoped exact filename metadata search followed by raw file download',
    searchedAt: '2026-08-28',
    results: discoveryResults,
    interpretation: 'All five frozen ConfigDataEquipmentInfo.Icon basenames were resolved as exact filenames inside the dedicated legacy Equipment asset folder. Raw bytes were admitted only after byte-length, PNG signature/IHDR, 172x172 dimensions, and pre-recorded SHA-256 checks passed.',
  },
  records: evidenceRecords,
};

fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
console.log('Equipment image Stage 1 representative source acquisition: 5/5 verified.');
