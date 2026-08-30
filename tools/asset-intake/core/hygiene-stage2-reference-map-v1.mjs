import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();

export const PATHS = {
  contract: 'tools/asset-intake/contract/hygiene-stage2-reference-crosscheck.v1.json',
  sourceFreeze: 'tools/asset-intake/hygiene/generated/asset-hygiene-stage2-reference-sources.v1.json',
  inventory: 'tools/asset-intake/hygiene/generated/asset-hygiene-inventory.v1.json',
  soldierSource: 'data/generated/soldier-portrait-manifest.v9.json',
  soldierDelivery: 'data/generated/soldier-portrait-web-manifest.v1.json',
  bannerRelations: 'data/generated/banner-stage3-1-asset-relations.v1.json',
  bannerConsumers: [
    'data/generated/banner-stage3-3-basic-table-consumer.v1.json',
    'data/generated/banner-stage3-4-wish-consumer.v1.json',
    'data/generated/banner-stage3-5-cp-event-consumer.v1.json',
    'data/generated/banner-stage3-6-recurrence-pickup-log-consumer.v1.json',
  ],
  heroArtworkConsumer: 'data/generated/hero-card-artwork-stage4.v1.json',
  heroArtworkEvidence: 'data/generated/hero-artwork-h-a6-web-assets.v1.json',
  heroCardIconSource: 'data/generated/hero-card-icon-assets.v1.json',
  heroCardIconDelivery: 'data/generated/hero-card-icon-web-delivery.v1.json',
  equipmentPlan: 'data/generated/equipment-image-stage2-public-plan.v1.json',
  equipmentSummary: 'data/validation/equipment-image-stage2-final-summary.v3.json',
  factionAssets: 'data/generated/hero-fusion-faction-assets.v1.json',
  armyAssets: 'data/generated/army-icon-manifest.v1.json',
  movementIndex: 'data/generated/shared-movement-type-index.v1.json',
  referenceMap: 'tools/asset-intake/hygiene/generated/asset-hygiene-reference-map.v1.json',
  unresolved: 'tools/asset-intake/hygiene/generated/asset-hygiene-unresolved-reference.v1.json',
  summary: 'data/validation/asset-intake-hygiene-stage2-reference-crosscheck-summary.v1.json',
  checkpoint: 'docs/checkpoints/asset-intake-hygiene-stage2-reference-crosscheck.md',
};

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html']);
const IMAGE_RE = /(["'`])([^"'`\r\n]+?\.(?:png|jpe?g|webp|gif|svg|avif|bmp|ico))(?:[?#][^"'`\r\n]*)?\1/gi;

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function json(repositoryPath) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
}

function normSha(value) {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function webPathToRepositoryPath(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.includes('${') || /^(?:https?:|data:|blob:)/i.test(value)) return null;
  if (value.startsWith('/images/')) return `public${value}`;
  if (value.startsWith('images/')) return `public/${value}`;
  if (value.startsWith('/')) return `public${value}`;
  return null;
}

function resolveSourceLiteral(sourcePath, value) {
  if (typeof value !== 'string' || !value || value.includes('${') || /^(?:https?:|data:|blob:)/i.test(value)) return null;
  if (value.startsWith('@/')) return path.posix.normalize(`src/${value.slice(2)}`);
  const publicPath = webPathToRepositoryPath(value);
  if (publicPath) return path.posix.normalize(publicPath);
  if (value.startsWith('./') || value.startsWith('../')) {
    return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), value));
  }
  return null;
}

function canonicalKey(domain, value, assetKind) {
  return { domain, assetKind, value };
}

function referenceKey(reference) {
  return JSON.stringify(reference);
}

function sortReferences(references) {
  references.sort((a, b) => {
    const aa = `${a.kind}\0${a.source}\0${a.role ?? ''}\0${a.relation ?? ''}`;
    const bb = `${b.kind}\0${b.source}\0${b.role ?? ''}\0${b.relation ?? ''}`;
    return aa.localeCompare(bb, 'en');
  });
}

function collectPublicPaths(value, source, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectPublicPaths(item, source, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'publicPath' || key === 'webAssetPath' || key === 'webDeliveryPath') && typeof child === 'string') {
      const repositoryPath = webPathToRepositoryPath(child);
      if (repositoryPath) output.push({ repositoryPath, source, field: key });
    }
    collectPublicPaths(child, source, output);
  }
  return output;
}

function checkpointMarkdown(summary) {
  return `# Asset Hygiene Stage 2 — Reference / Evidence Cross-check\n\n기준일: 2026-08-30\n\n상태: \`${summary.status} / ${summary.completion}\`\n\nfreeze: \`${summary.freezeState}\`\n\n## 1. predecessor\n\n- AH-1 inventory: \`${PATHS.inventory}\`\n- AH-2 source freeze: \`${PATHS.sourceFreeze}\`\n- physical inventory records: ${summary.coverage.inventoryRecordCount}\n\nAH-1 inventory를 재생성하지 않고 2,188개 record를 그대로 reference-map population으로 사용했다.\n\n## 2. reference 결과\n\n\`\`\`text\ninventory records        ${summary.coverage.inventoryRecordCount}\nreference-map records    ${summary.coverage.referenceMapRecordCount}\nassets with references   ${summary.coverage.referencedAssetCount}\nassets without refs      ${summary.coverage.zeroReferenceAssetCount}\nreference edges          ${summary.coverage.referenceEdgeCount}\nunresolved references    ${summary.coverage.unresolvedReferenceCount}\nhard errors              ${summary.hardErrorCount}\n\`\`\`\n\nreference가 0개인 파일은 AH-2 오류나 UNUSED 판정이 아니다. AH-3의 UNREFERENCED/PROVENANCE 검토 입력일 뿐이다.\n\n## 3. domain collector\n\n- Soldier: v9 PNG source + lossless WebP delivery + current resolver\n- Banner: frozen Stage 3-1 exact repository relation + current generated consumers\n- Hero: current Stage 4 artwork consumer + H-A6 hash evidence + card-icon PNG/WebP chain\n- Equipment: frozen Stage 2 public-plan targetRepositoryPaths + current resolver\n- Faction: frozen 12-record localAssetPath manifest + current fusion consumer\n- Army: frozen 10-record filename/publicRoot manifest + current resolver\n- current frontend static references: tracked \`src/**\` text files의 exact image literals만 수집\n- Skin: authoritative bytes/evidence 부재 상태를 그대로 보존하며 물리 path를 발명하지 않음\n\n## 4. reference kinds\n\n${Object.entries(summary.referenceKinds).map(([kind, count]) => `- \`${kind}\`: ${count}`).join('\n')}\n\n## 5. REVIEW / BLOCKER\n\nREVIEW:\n${summary.reviews.length ? summary.reviews.map((review, index) => `${index + 1}. \`${review.code}\` — ${review.count ?? 1}`).join('\n') : '- 없음'}\n\nBLOCKER:\n${summary.blockers.length ? summary.blockers.map((blocker) => `- \`${blocker.code}\``).join('\n') : '- 없음'}\n\n## 6. 하지 않은 것\n\n\`\`\`text\nclassification\nACTIVE_VERIFIED primaryClass 확정\nUNREFERENCED primaryClass 확정\nPROVENANCE_UNKNOWN 판정\nSUPERSEDED 판정\nresolver collision 판정\ndelete / move / rename\nasset conversion\nfrontend rewrite\nraw ConfigData read\nsemantic recomputation\n\`\`\`\n\n## 7. 다음 시작점\n\n\`ASSET_HYGIENE_3_CLASSIFICATION\`\n\nAH-3는 이 frozen reference map과 AH-1 duplicate/basename flags를 입력으로 primaryClass + flags + review queue를 생성한다.\n\n## 8. 다시 열리는 조건\n\n- AH-1 physical baseline migration\n- Active Source Registry selection 변경\n- current manifest/resolver/consumer contract 변경\n- reference-map structural parity 파손\n- exact-path collector가 현재 source를 표현할 수 없는 실제 사례 발견\n\n## 9. 판정\n\n\`\`\`text\n${summary.status}\n${summary.completion}\n${summary.freezeState}\nhard error: ${summary.hardErrorCount}\nblocker: ${summary.blockers.length}\nnext: AH-3 classification\n\`\`\`\n`;
}

export async function buildStage2ReferenceMap({ write = false } = {}) {
  const [contract, sourceFreeze, inventory] = await Promise.all([
    json(PATHS.contract),
    json(PATHS.sourceFreeze),
    json(PATHS.inventory),
  ]);

  if (contract.physicalBaseline.inventoryRecordCount !== inventory.recordCount) {
    throw new Error(`AH-1 inventory count mismatch: ${inventory.recordCount}`);
  }
  if (sourceFreeze.inventoryRecordCount !== inventory.recordCount || sourceFreeze.assetDeltaGate?.inventoryReuse !== true) {
    throw new Error('AH-2 source freeze does not admit frozen AH-1 inventory reuse');
  }

  const records = inventory.records.map((record) => ({
    repositoryPath: record.repositoryPath,
    root: record.root,
    extension: record.extension,
    signature: record.signature,
    byteSize: record.byteSize,
    sha256: record.sha256,
    exactDuplicateGroup: record.exactDuplicateGroup ?? null,
    basenameCollisionGroup: record.basenameCollisionGroup ?? null,
    references: [],
  }));
  const byPath = new Map(records.map((record) => [record.repositoryPath, record]));
  const unresolved = [];
  const dedupe = new Map(records.map((record) => [record.repositoryPath, new Set()]));

  function addReference(repositoryPath, reference, expectedSha256 = null) {
    const record = byPath.get(repositoryPath);
    if (!record) {
      unresolved.push({ code: 'REFERENCE_PATH_NOT_IN_FROZEN_INVENTORY', repositoryPath, reference });
      return;
    }
    if (expectedSha256 && normSha(record.sha256) !== normSha(expectedSha256)) {
      unresolved.push({
        code: 'REFERENCE_SHA256_MISMATCH',
        repositoryPath,
        inventorySha256: record.sha256,
        expectedSha256,
        reference,
      });
      return;
    }
    const key = referenceKey(reference);
    if (dedupe.get(repositoryPath).has(key)) return;
    dedupe.get(repositoryPath).add(key);
    record.references.push(reference);
  }

  const [soldierSource, soldierDelivery] = await Promise.all([json(PATHS.soldierSource), json(PATHS.soldierDelivery)]);
  for (const item of soldierSource.records) {
    const repositoryPath = `public/images/soldiers/${item.fileName}`;
    addReference(repositoryPath, {
      kind: 'SOURCE_EVIDENCE_REF', source: PATHS.soldierSource, role: 'CANONICAL_SOLDIER_PNG_SOURCE',
      canonicalKey: canonicalKey('soldier', item.soldierId, 'portrait'),
    }, item.sha256);
  }
  for (const item of soldierDelivery.records) {
    const repositoryPath = `public/images/soldiers-webp/${item.fileName}`;
    const sourceRepositoryPath = `public/images/soldiers/${item.sourcePngFileName}`;
    addReference(sourceRepositoryPath, {
      kind: 'MANIFEST_REF', source: PATHS.soldierDelivery, role: 'DERIVATIVE_SOURCE_PNG',
      canonicalKey: canonicalKey('soldier', item.soldierId, 'portrait'),
    }, item.sourcePngSha256);
    addReference(repositoryPath, {
      kind: 'DERIVATIVE_REF', source: PATHS.soldierDelivery,
      role: 'LOSSLESS_WEBP_DELIVERY', relation: item.resolutionMethod,
      sourceRepositoryPath,
      canonicalKey: canonicalKey('soldier', item.soldierId, 'portrait'),
    }, item.sha256);
    addReference(repositoryPath, {
      kind: 'ACTIVE_PRODUCTION_REF', source: 'src/lib/soldier-portrait-assets.ts', role: 'CURRENT_SOLDIER_PORTRAIT_DELIVERY',
      canonicalKey: canonicalKey('soldier', item.soldierId, 'portrait'),
    }, item.sha256);
  }

  const bannerRelations = await json(PATHS.bannerRelations);
  for (const asset of bannerRelations.assets) {
    for (const repositoryPath of asset.repositoryPaths) {
      addReference(repositoryPath, {
        kind: 'SOURCE_EVIDENCE_REF', source: PATHS.bannerRelations, role: 'FROZEN_BANNER_ASSET_RELATION',
        assetId: asset.assetId,
      }, asset.contentSha256);
    }
  }
  for (const consumerPath of PATHS.bannerConsumers) {
    const consumer = await json(consumerPath);
    for (const hit of collectPublicPaths(consumer, consumerPath)) {
      if (!hit.repositoryPath.startsWith('public/images/banners/')) continue;
      addReference(hit.repositoryPath, {
        kind: 'ACTIVE_PRODUCTION_REF', source: consumerPath, role: 'CURRENT_BANNER_CONSUMER_PUBLIC_PATH', field: hit.field,
      });
    }
  }

  const [heroArtworkConsumer, heroArtworkEvidence, heroIconSource, heroIconDelivery] = await Promise.all([
    json(PATHS.heroArtworkConsumer), json(PATHS.heroArtworkEvidence), json(PATHS.heroCardIconSource), json(PATHS.heroCardIconDelivery),
  ]);
  const heroEvidenceByPath = new Map(heroArtworkEvidence.records.map((item) => [item.path, item]));
  for (const item of heroArtworkConsumer.records) {
    if (item.assetStatus !== 'RESOLVED' || !item.expectedFilePath || !item.webAssetPath) continue;
    const evidence = heroEvidenceByPath.get(item.expectedFilePath);
    addReference(item.expectedFilePath, {
      kind: 'ACTIVE_PRODUCTION_REF', source: 'src/lib/hero-list.server.ts', role: 'CURRENT_HERO_DETAIL_ARTWORK',
      manifest: PATHS.heroArtworkConsumer,
      canonicalKey: canonicalKey('hero', item.heroId, 'artwork'),
    }, evidence?.pngSha256 ?? null);
    addReference(item.expectedFilePath, {
      kind: 'MANIFEST_REF', source: PATHS.heroArtworkConsumer, role: 'CURRENT_HERO_ARTWORK_RESOLUTION',
      canonicalKey: canonicalKey('hero', item.heroId, 'artwork'),
    });
    if (evidence) {
      addReference(item.expectedFilePath, {
        kind: 'SOURCE_EVIDENCE_REF', source: PATHS.heroArtworkEvidence, role: evidence.status,
        canonicalKey: canonicalKey('hero', item.heroId, 'artwork'),
      }, evidence.pngSha256);
    }
  }
  for (const item of heroIconSource.records) {
    if (item.assetStatus !== 'RESOLVED') continue;
    addReference(item.expectedFilePath, {
      kind: 'SOURCE_EVIDENCE_REF', source: PATHS.heroCardIconSource, role: 'AUTHORITATIVE_HERO_CARD_ICON_PNG',
      canonicalKey: canonicalKey('hero', item.heroId, 'card-icon'),
    }, item.sha256);
  }
  for (const item of heroIconDelivery.records) {
    addReference(item.sourcePngFilePath, {
      kind: 'MANIFEST_REF', source: PATHS.heroCardIconDelivery, role: 'WEB_DELIVERY_SOURCE_PNG',
      canonicalKey: canonicalKey('hero', item.heroId, 'card-icon'),
    }, item.sourcePngSha256);
    addReference(item.webDeliveryFilePath, {
      kind: 'DERIVATIVE_REF', source: PATHS.heroCardIconDelivery, role: item.webDeliveryMode,
      relation: 'LOSSLESS_WEBP_FROM_AUTHORITATIVE_CARD_ICON_PNG', sourceRepositoryPath: item.sourcePngFilePath,
      canonicalKey: canonicalKey('hero', item.heroId, 'card-icon'),
    }, item.webDeliverySha256);
    addReference(item.webDeliveryFilePath, {
      kind: 'ACTIVE_PRODUCTION_REF', source: 'src/lib/hero-card-icon-assets.server.ts', role: 'CURRENT_HERO_LIST_CARD_ICON_DELIVERY',
      canonicalKey: canonicalKey('hero', item.heroId, 'card-icon'),
    }, item.webDeliverySha256);
  }

  const [equipmentPlan, equipmentSummary] = await Promise.all([json(PATHS.equipmentPlan), json(PATHS.equipmentSummary)]);
  if (equipmentPlan.counts?.publicEquipment !== 373 || equipmentSummary.counts?.verifiedRepositoryAssets !== 373) {
    throw new Error('Equipment current public asset contract is not the frozen 373-record Stage 2 set');
  }
  for (const group of equipmentPlan.sourceGroups) {
    for (const repositoryPath of group.targetRepositoryPaths) {
      addReference(repositoryPath, {
        kind: 'MANIFEST_REF', source: PATHS.equipmentPlan, role: 'FROZEN_EQUIPMENT_PUBLIC_TARGET_PATH',
        sourceIconPath: group.sourceIconPath,
      });
      addReference(repositoryPath, {
        kind: 'ACTIVE_PRODUCTION_REF', source: 'src/lib/equipment-image-assets.ts', role: 'CURRENT_EQUIPMENT_IMAGE_RESOLVER',
      });
    }
  }

  const factionAssets = await json(PATHS.factionAssets);
  for (const item of factionAssets.records) {
    if (item.assetStatus !== 'RESOLVED') continue;
    addReference(item.localAssetPath, {
      kind: 'SOURCE_EVIDENCE_REF', source: PATHS.factionAssets, role: 'FROZEN_FACTION_MARK',
      canonicalKey: canonicalKey('faction', item.factionId, 'mark'),
    }, item.sha256);
    addReference(item.localAssetPath, {
      kind: 'ACTIVE_PRODUCTION_REF', source: 'src/lib/hero-fusion-power.server.ts', role: 'CURRENT_HERO_FUSION_FACTION_MARK',
      canonicalKey: canonicalKey('faction', item.factionId, 'mark'),
    }, item.sha256);
  }

  const armyAssets = await json(PATHS.armyAssets);
  for (const item of armyAssets.records) {
    const repositoryPath = `public/${armyAssets.publicRoot}/${item.fileName}`;
    addReference(repositoryPath, {
      kind: 'MANIFEST_REF', source: PATHS.armyAssets, role: 'FROZEN_ARMY_ICON_FILENAME',
      canonicalKey: canonicalKey('army', item.armyId, 'icon'),
    });
    addReference(repositoryPath, {
      kind: 'ACTIVE_PRODUCTION_REF', source: 'src/lib/army-icon-assets.ts', role: 'CURRENT_ARMY_ICON_RESOLVER',
      canonicalKey: canonicalKey('army', item.armyId, 'icon'),
    });
  }

  const movementIndex = await json(PATHS.movementIndex);
  const movementNames = new Set(movementIndex.definitions.map((item) => item.iconFileName));

  const sourceFiles = execFileSync('git', ['ls-files', 'src'], { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean).sort((a, b) => a.localeCompare(b, 'en'));
  for (const sourcePath of sourceFiles) {
    if (!TEXT_EXTENSIONS.has(path.posix.extname(sourcePath).toLowerCase())) continue;
    let text;
    try {
      text = await readFile(path.join(REPO_ROOT, sourcePath), 'utf8');
    } catch {
      continue;
    }
    IMAGE_RE.lastIndex = 0;
    let match;
    while ((match = IMAGE_RE.exec(text)) !== null) {
      const literal = match[2];
      const repositoryPath = resolveSourceLiteral(sourcePath, literal);
      if (!repositoryPath) continue;
      if (!byPath.has(repositoryPath)) {
        unresolved.push({
          code: 'FRONTEND_EXACT_IMAGE_LITERAL_NOT_IN_FROZEN_INVENTORY',
          repositoryPath,
          reference: { kind: 'FRONTEND_REF', source: sourcePath, literal },
        });
        continue;
      }
      addReference(repositoryPath, { kind: 'FRONTEND_REF', source: sourcePath, role: 'EXACT_STATIC_IMAGE_LITERAL', literal });
      if (repositoryPath.startsWith('public/images/shared/movement/') && movementNames.has(path.posix.basename(repositoryPath))) {
        addReference(repositoryPath, { kind: 'MANIFEST_REF', source: PATHS.movementIndex, role: 'SHARED_MOVEMENT_ICON_FILENAME' });
      }
    }
  }

  for (const record of records) sortReferences(record.references);
  unresolved.sort((a, b) => `${a.code}\0${a.repositoryPath}`.localeCompare(`${b.code}\0${b.repositoryPath}`, 'en'));

  const kindCounts = {};
  let referencedAssetCount = 0;
  let referenceEdgeCount = 0;
  for (const record of records) {
    if (record.references.length) referencedAssetCount += 1;
    referenceEdgeCount += record.references.length;
    for (const reference of record.references) kindCounts[reference.kind] = (kindCounts[reference.kind] ?? 0) + 1;
  }
  const referenceKinds = Object.fromEntries(Object.entries(kindCounts).sort(([a], [b]) => a.localeCompare(b, 'en')));
  const zeroReferenceAssetCount = records.length - referencedAssetCount;
  const hardErrorCount = unresolved.length;
  const reviews = [];
  if (zeroReferenceAssetCount > 0) reviews.push({ code: 'ZERO_CURRENT_REFERENCE_ASSETS_PRESENT', count: zeroReferenceAssetCount, blocking: false });
  reviews.push({ code: 'SOLDIER_REGISTRY_SUPPLEMENTAL_MANIFEST_POINTER_LAGS_CURRENT_RESOLVER_CHAIN', count: 1, blocking: false });

  const referenceMap = {
    version: 1,
    schemaId: 'asset-hygiene-reference-map/v1',
    stage: 'ASSET_HYGIENE_2',
    status: hardErrorCount === 0 ? 'PASS' : 'BLOCKED',
    physicalBaseline: inventory.baseline,
    referenceBaseline: {
      sourceFreeze: PATHS.sourceFreeze,
      commit: sourceFreeze.referenceBaselineCommit,
      activeSourceRegistry: sourceFreeze.activeSourceRegistry,
    },
    recordCount: records.length,
    records,
  };

  const unresolvedArtifact = {
    version: 1,
    schemaId: 'asset-hygiene-unresolved-reference/v1',
    stage: 'ASSET_HYGIENE_2',
    status: hardErrorCount === 0 ? 'PASS_NO_UNRESOLVED_REFERENCE' : 'BLOCKED',
    count: unresolved.length,
    records: unresolved,
  };

  const summary = {
    version: 1,
    schemaId: 'asset-intake-hygiene-stage2-reference-crosscheck-summary/v1',
    stage: 'ASSET_HYGIENE_2',
    status: hardErrorCount === 0 ? 'PASS_ASSET_HYGIENE_STAGE2_REFERENCE_CROSSCHECK' : 'BLOCKED_ASSET_HYGIENE_STAGE2_REFERENCE_CROSSCHECK',
    completion: hardErrorCount === 0 ? 'COMPLETE' : 'INCOMPLETE',
    freezeState: hardErrorCount === 0 ? 'ASSET_HYGIENE_STAGE2_REFERENCE_MAP_FROZEN' : 'NOT_FROZEN',
    predecessor: PATHS.sourceFreeze,
    coverage: {
      inventoryRecordCount: inventory.recordCount,
      referenceMapRecordCount: records.length,
      referencedAssetCount,
      zeroReferenceAssetCount,
      referenceEdgeCount,
      unresolvedReferenceCount: unresolved.length,
    },
    referenceKinds,
    domainChecks: {
      soldierSourceCount: soldierSource.records.length,
      soldierDeliveryCount: soldierDelivery.records.length,
      bannerResolvedUniquePathCount: bannerRelations.referenceCensus.uniqueResolvedPathCount,
      heroArtworkResolvedCount: heroArtworkConsumer.summary.resolvedCount,
      heroCardIconSourceCount: heroIconSource.summary.fileCount,
      heroCardIconDeliveryCount: heroIconDelivery.summary.webDeliveryCount,
      equipmentPublicTargetCount: equipmentPlan.counts.publicEquipment,
      factionAssetCount: factionAssets.summary.fileCount,
      armyAssetCount: armyAssets.importedAssetCount,
      movementDefinitionCount: movementIndex.definitions.length,
      skinStatePreserved: sourceFreeze.domains?.skin?.state === 'READY_FOR_ASSET_EVIDENCE',
    },
    reviews,
    blockers: unresolved.map((item) => ({ code: item.code, repositoryPath: item.repositoryPath })),
    hardErrorCount,
    forbiddenOperationCounts: {
      assetMutation: 0,
      frontendMutation: 0,
      externalFetch: 0,
      rawConfigDataRead: 0,
      semanticRecomputation: 0,
      classification: 0,
    },
    nextStartPoint: hardErrorCount === 0 ? 'ASSET_HYGIENE_3_CLASSIFICATION' : 'ASSET_HYGIENE_2_REFERENCE_MAP_REPAIR',
  };

  if (write) {
    for (const outputPath of [PATHS.referenceMap, PATHS.unresolved, PATHS.summary, PATHS.checkpoint]) {
      await mkdir(path.dirname(path.join(REPO_ROOT, outputPath)), { recursive: true });
    }
    await writeFile(path.join(REPO_ROOT, PATHS.referenceMap), stable(referenceMap));
    await writeFile(path.join(REPO_ROOT, PATHS.unresolved), stable(unresolvedArtifact));
    await writeFile(path.join(REPO_ROOT, PATHS.summary), stable(summary));
    await writeFile(path.join(REPO_ROOT, PATHS.checkpoint), checkpointMarkdown(summary));
  }

  return { referenceMap, unresolvedArtifact, summary, checkpoint: checkpointMarkdown(summary) };
}
