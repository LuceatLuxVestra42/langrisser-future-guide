import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const ROOT = process.cwd();
const CONTRACT_PATH = 'data/contracts/localization-audit-hero-talent-kr-sheet-source.v1.json';

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};

function fail(message, context = {}) {
  const suffix = Object.keys(context).length ? `\n${JSON.stringify(context, null, 2)}` : '';
  throw new Error(`${message}${suffix}`);
}

function parseArgs(argv) {
  const options = { check: false, json: false, output: null, sourceDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--output') options.output = argv[++index];
    else if (arg === '--source-dir') options.sourceDir = argv[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return options;
}

function rawUrl(contract, relativePath) {
  const encoded = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://raw.githubusercontent.com/${contract.source.repository}/${contract.source.ref}/${encoded}`;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'langrisser-future-guide-localization-extractor' } });
  if (!response.ok) fail(`Failed to fetch KR-sheet source: HTTP ${response.status}`, { url });
  return response.text();
}

function makeSourceReader(contract, sourceDir) {
  if (sourceDir) {
    const root = path.resolve(sourceDir);
    return {
      mode: 'LOCAL_SOURCE_DIR',
      locator: root,
      read: async (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'),
    };
  }
  return {
    mode: 'PINNED_RAW_GITHUB',
    locator: `https://raw.githubusercontent.com/${contract.source.repository}/${contract.source.ref}/`,
    read: async (relativePath) => fetchText(rawUrl(contract, relativePath)),
  };
}

function parseLegacyHeroData(sourceText, sourcePath) {
  const normalized = sourceText.replace(/^\uFEFF/u, '');
  const sandbox = Object.create(null);
  vm.createContext(sandbox);
  try {
    vm.runInContext(`${normalized}\n;globalThis.__result = data;`, sandbox, { timeout: 1000, filename: sourcePath });
  } catch (error) {
    fail(`Unable to parse legacy Hero data: ${sourcePath}`, { error: error.message });
  }
  const data = sandbox.__result;
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== 'object') fail(`Legacy Hero data did not expose data[0]: ${sourcePath}`);
  return data[0];
}

function extractRouteKeys(heroHtml) {
  const keys = [];
  const regex = /hero\/index\.html\?name=([^'";&]+)'/gu;
  let match;
  while ((match = regex.exec(heroHtml)) !== null) keys.push(match[1]);
  return keys;
}

function buildMasterIndexes(master) {
  const byId = new Map(master.records.map((record) => [record.heroId, record]));
  const byKr = new Map();
  const byCn = new Map();
  for (const record of master.records) {
    if (record.nameKr) {
      const rows = byKr.get(record.nameKr) ?? [];
      rows.push(record);
      byKr.set(record.nameKr, rows);
    }
    if (record.nameCn) {
      const rows = byCn.get(record.nameCn) ?? [];
      rows.push(record);
      byCn.set(record.nameCn, rows);
    }
  }
  return { byId, byKr, byCn };
}

function matchHero({ routeKey, legacy, contract, indexes }) {
  const explicit = contract.matching.exceptions.find((row) => row.sourceKey === routeKey);
  if (explicit) {
    const target = indexes.byId.get(explicit.heroId);
    if (!target) fail('Explicit legacy Hero exception points to an unknown current Hero ID.', explicit);
    return { target, method: 'EXPLICIT_SOURCE_KEY_EXCEPTION' };
  }

  const krCandidates = indexes.byKr.get(legacy.Name) ?? [];
  if (krCandidates.length === 1) return { target: krCandidates[0], method: 'EXACT_KR_NAME' };
  if (krCandidates.length > 1) {
    const narrowed = krCandidates.filter((record) => record.nameCn === legacy.ChName);
    if (narrowed.length === 1) return { target: narrowed[0], method: 'EXACT_KR_NAME_THEN_CN_NAME' };
    fail('Ambiguous exact Korean-name localization match after exact Chinese-name disambiguation.', {
      routeKey,
      legacyNameKr: legacy.Name,
      legacyNameCn: legacy.ChName ?? null,
      candidateHeroIds: krCandidates.map((row) => row.heroId),
      narrowedHeroIds: narrowed.map((row) => row.heroId),
    });
  }

  const cnCandidates = indexes.byCn.get(legacy.ChName) ?? [];
  if (cnCandidates.length === 1) return { target: cnCandidates[0], method: 'EXACT_CN_NAME' };
  if (cnCandidates.length > 1) {
    fail('Ambiguous exact Chinese-name localization match.', {
      routeKey,
      legacyNameCn: legacy.ChName,
      candidateHeroIds: cnCandidates.map((row) => row.heroId),
    });
  }

  fail('Unable to match legacy Hero to the reviewed current Hero master by exact name.', {
    routeKey,
    legacyNameKr: legacy.Name ?? null,
    legacyNameCn: legacy.ChName ?? null,
  });
}

function extractTalent(legacy, sourcePath, contract) {
  const talent = legacy.Talent?.[0];
  if (!talent || typeof talent !== 'object') fail('Missing Talent[0] in legacy Hero source.', { sourcePath });
  if (contract.validation.requireTalentName && !talent.TalentName) fail('Missing Talent[0].TalentName.', { sourcePath });
  const abilities = talent.Abilities;
  if (!Array.isArray(abilities) || abilities.length < 6) fail('Talent[0].Abilities must contain the 1-6 star slots.', { sourcePath, length: abilities?.length ?? null });
  const descriptions = contract.scope.includeStars.map((star) => {
    const raw = abilities[star - 1]?.Desc;
    if (contract.validation.requireFourStarDescriptions && (typeof raw !== 'string' || raw.length === 0)) fail(`Missing ${star}-star talent description.`, { sourcePath });
    return [star, raw];
  });
  return {
    nameKr: talent.TalentName,
    descriptionsRaw: Object.fromEntries(descriptions.map(([star, raw]) => [`star${star}`, raw])),
  };
}

function sameTalent(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function buildOutput({ contract, master, source }) {
  const heroHtml = await source.read(contract.source.heroIndexPath);
  const routeKeys = extractRouteKeys(heroHtml);
  if (routeKeys.length !== contract.scope.expectedCardRouteCount) fail('Legacy Hero card route count mismatch.', { expected: contract.scope.expectedCardRouteCount, actual: routeKeys.length });

  const indexes = buildMasterIndexes(master);
  const rows = await mapConcurrent(routeKeys, 16, async (routeKey, sourceOrder) => {
    const relativeSourcePath = `${contract.source.heroDataDir}/${routeKey}.js`;
    const legacy = parseLegacyHeroData(await source.read(relativeSourcePath), relativeSourcePath);
    const { target, method } = matchHero({ routeKey, legacy, contract, indexes });
    return {
      sourceOrder,
      heroId: target.heroId,
      currentNameKr: target.nameKr,
      currentNameCn: target.nameCn,
      sourceKey: routeKey,
      sourcePath: relativeSourcePath,
      sourceNameKr: legacy.Name ?? null,
      sourceNameCn: legacy.ChName ?? null,
      matchMethod: method,
      talent: extractTalent(legacy, relativeSourcePath, contract),
    };
  });

  const grouped = new Map();
  for (const row of rows) {
    const group = grouped.get(row.heroId) ?? [];
    group.push(row);
    grouped.set(row.heroId, group);
  }

  const duplicateGroups = [...grouped.entries()].filter(([, group]) => group.length > 1);
  const expectedDuplicate = contract.validation.expectedDuplicateRouteGroup;
  if (duplicateGroups.length !== 1 || duplicateGroups[0][0] !== expectedDuplicate.heroId || duplicateGroups[0][1].length !== expectedDuplicate.routeCount) {
    fail('Unexpected duplicate legacy Hero route groups.', {
      expected: expectedDuplicate,
      actual: duplicateGroups.map(([heroId, group]) => ({ heroId, routeCount: group.length, sourceKeys: group.map((row) => row.sourceKey) })),
    });
  }
  for (const [, group] of duplicateGroups) {
    if (!group.slice(1).every((row) => sameTalent(row.talent, group[0].talent))) fail('Duplicate legacy Hero routes disagree on normal Talent data.', { sourceKeys: group.map((row) => row.sourceKey) });
  }

  const records = [...grouped.values()]
    .map((group) => ({
      heroId: group[0].heroId,
      nameKr: group[0].currentNameKr,
      nameCn: group[0].currentNameCn,
      sheetKeys: group.map((row) => row.sourceKey),
      primarySheetKey: group[0].sourceKey,
      sourcePaths: group.map((row) => row.sourcePath),
      matchMethod: group[0].matchMethod,
      sourceNameKr: group[0].sourceNameKr,
      sourceNameCn: group[0].sourceNameCn,
      talent: group[0].talent,
      sourceOrder: Math.min(...group.map((row) => row.sourceOrder)),
      sourceStatus: 'DIRECT_KR_SHEET',
    }))
    .sort((left, right) => left.sourceOrder - right.sourceOrder);

  if (records.length !== contract.scope.expectedUniqueHeroCount) fail('Legacy KR-sheet unique Hero count mismatch.', { expected: contract.scope.expectedUniqueHeroCount, actual: records.length });

  const cutoffActual = records.slice(-2).map((record) => record.heroId);
  if (JSON.stringify(cutoffActual) !== JSON.stringify(contract.scope.cutoffHeroIds)) fail('KR-sheet cutoff anchors are not the final two unique Hero records.', { expected: contract.scope.cutoffHeroIds, actual: cutoffActual });
  const cutoffKeys = records.slice(-2).map((record) => record.primarySheetKey);
  if (JSON.stringify(cutoffKeys) !== JSON.stringify(contract.scope.cutoffSourceKeys)) fail('KR-sheet cutoff source keys changed.', { expected: contract.scope.cutoffSourceKeys, actual: cutoffKeys });

  const coveredIds = new Set(records.map((record) => record.heroId));
  const postCutoffHeroIds = master.records.filter((record) => !coveredIds.has(record.heroId)).map((record) => record.heroId);
  if (postCutoffHeroIds.length !== contract.scope.expectedPostCutoffHeroCount) fail('Post-cutoff current Hero count mismatch.', { expected: contract.scope.expectedPostCutoffHeroCount, actual: postCutoffHeroIds.length, postCutoffHeroIds });

  const matchMethodCounts = Object.fromEntries([...new Set(records.map((record) => record.matchMethod))].sort().map((method) => [method, records.filter((record) => record.matchMethod === method).length]));

  return {
    version: 1,
    schemaId: 'hero-talent-kr-sheet-source/v1',
    status: 'PASS',
    scope: 'localization-presentation-evidence-only',
    source: {
      repository: contract.source.repository,
      ref: contract.source.ref,
      fetchMode: source.mode,
      locator: source.locator,
      heroIndexPath: contract.source.heroIndexPath,
      heroDataDir: contract.source.heroDataDir,
    },
    authorityBoundary: {
      identityMutation: false,
      relationshipMutation: false,
      normalTalentOnly: true,
      spTalentExcluded: true,
      rawHtmlPreserved: true,
    },
    coverage: {
      cardRouteCount: routeKeys.length,
      uniqueHeroCount: records.length,
      canonicalHeroCount: master.recordCount,
      postCutoffHeroCount: postCutoffHeroIds.length,
      postCutoffHeroIds,
      cutoffHeroIds: contract.scope.cutoffHeroIds,
    },
    matching: {
      mode: contract.matching.mode,
      order: [...contract.matching.order, 'EXACT_KR_NAME_THEN_CN_NAME'],
      explicitExceptionHeroIds: contract.matching.exceptions.map((row) => row.heroId),
      matchMethodCounts,
    },
    records,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const contract = readJson(CONTRACT_PATH);
  const master = readJson(contract.currentHeroMaster);
  const source = makeSourceReader(contract, options.sourceDir);
  const result = await buildOutput({ contract, master, source });
  const outputPath = path.resolve(ROOT, options.output ?? contract.output);

  if (options.check) {
    if (!fs.existsSync(outputPath)) fail('Committed KR-sheet Hero talent output is missing.', { outputPath });
    const expected = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    if (JSON.stringify(stable(result)) !== JSON.stringify(stable(expected))) fail('Committed KR-sheet Hero talent output is stale or mismatched.');
    console.log(`Hero Talent KR Sheet Source: PASS (${result.coverage.uniqueHeroCount}/${result.coverage.canonicalHeroCount}; post-cutoff ${result.coverage.postCutoffHeroCount})`);
    return;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, outputPath)} (${result.coverage.uniqueHeroCount} Heroes)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
