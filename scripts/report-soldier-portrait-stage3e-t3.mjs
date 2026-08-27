import { readFile, writeFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('data/generated/soldier-portrait-manifest.v3.json', 'utf8'));
const current = JSON.parse(await readFile('data/generated/soldier-detail-stage5-6.v1.json', 'utf8')).records;
const discovery = JSON.parse(await readFile('data/validation/soldier-portrait-legacy-discovery-stage3c.v1.json', 'utf8'));
const currentById = new Map(current.map((r) => [r.soldierId, r]));
const discoveryById = new Map(discovery.results.map((r) => [r.soldierId, r]));

const unresolvedT3 = manifest.unresolved.filter((u) => !u.isSp && Number(u.tier) === 3);
const rows = unresolvedT3.map((u) => {
  const r = currentById.get(u.soldierId) ?? {};
  const d = discoveryById.get(u.soldierId) ?? {};
  return {
    soldierId: u.soldierId,
    nameKr: r.identity?.nameKr ?? u.nameKr ?? null,
    armyType: r.identity?.armyType ?? u.armyType ?? null,
    tier: r.identity?.tier ?? u.tier ?? null,
    model: r.source?.model ?? r.model ?? r.identity?.model ?? null,
    unresolvedReason: u.reason ?? null,
    stage3cStatus: d.status ?? null,
    legacyName: d.legacyName ?? null,
    legacySourceUrl: d.legacySourceUrl ?? null,
    legacyCandidates: d.legacyCandidates ?? [],
    level1Numbers: d.currentLevel1Numbers ?? [],
    level10Numbers: d.currentLevel10Numbers ?? [],
  };
});

const output = {
  version: 1,
  stage: 'soldier-portrait-stage3e-t3-inventory',
  generatedAt: new Date().toISOString(),
  sourceManifest: 'data/generated/soldier-portrait-manifest.v3.json',
  unresolvedT3Count: rows.length,
  rows,
};
await writeFile('data/validation/soldier-portrait-stage3e-t3-inventory.v1.json', `${JSON.stringify(output, null, 2)}\n`);
await writeFile(
  'data/validation/soldier-portrait-stage3e-t3-inventory.compact.tsv',
  ['soldierId\tnameKr\tarmyType\tstage3cStatus\tlegacyName', ...rows.map((r) => [r.soldierId, r.nameKr ?? '', r.armyType ?? '', r.stage3cStatus ?? '', r.legacyName ?? ''].join('\t'))].join('\n') + '\n',
);
console.log(`STAGE3E_T3_COUNT=${rows.length}`);
for (const row of rows) {
  console.log(`T3 ${row.soldierId}\t${row.nameKr ?? '(null)'}\t${row.armyType}\t${row.stage3cStatus}\tlegacy=${row.legacyName ?? '-'}\tmodel=${row.model ?? '-'}`);
}
