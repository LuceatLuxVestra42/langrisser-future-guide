import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const EQUIPMENT_CONTRACT = "data/presentation/equipment-name-kr-authority.v1.json";
const SOLDIER_CONTRACT = "data/presentation/soldier-localization-authority.v1.json";

const readText = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

function parseEquipmentSource(text) {
  let type = null;
  let group = null;
  const records = [];
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\[[^\]]+\]$/u.test(line)) {
      type = line.slice(1, -1);
      continue;
    }
    if (/^===.*===$/u.test(line)) {
      group = line.replace(/^===|===$/gu, "");
      continue;
    }
    if (/^-+$/u.test(line) || line.startsWith("중국명")) continue;
    const columns = rawLine.split("\t").map((value) => value.trim());
    if (columns.length < 2 || !type || !group) continue;
    records.push({
      line: index + 1,
      type,
      group,
      nameCn: columns[0],
      nameKr: columns[1],
      extra: columns.slice(2),
    });
  }
  return records;
}

function parseSoldierNameSource(text) {
  let mode = null;
  const records = [];
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("## 1~2티어")) {
      mode = "LOWER";
      continue;
    }
    if (line.startsWith("## 3티어")) {
      mode = "TIER3";
      continue;
    }
    if (mode === "LOWER" && line.includes(" - ")) {
      const [nameCn, ...rest] = line.split(" - ");
      records.push({
        line: index + 1,
        group: "LOWER",
        nameCn: nameCn.trim(),
        nameKr: rest.join(" - ").trim(),
        provisional: false,
      });
      continue;
    }
    if (mode === "TIER3" && line.includes(" = ") && !line.startsWith("-")) {
      const [nameCn, ...rest] = line.split(" = ");
      const rawKr = rest.join(" = ").trim();
      records.push({
        line: index + 1,
        group: "TIER3",
        nameCn: nameCn.trim(),
        nameKr: rawKr.replace(/\s*\[임시 표시명.*$/u, "").trim(),
        provisional: rawKr.includes("[임시 표시명"),
      });
    }
  }
  return records;
}

function parseAbilitySource(text) {
  let mode = null;
  let category = null;
  const records = [];
  for (const [index, rawLine] of text.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("2티어(")) {
      mode = "TIER2";
      continue;
    }
    if (line.startsWith("===3티어(")) {
      mode = "TIER3";
      continue;
    }
    if (line === "===SP 용병===") {
      mode = "SP";
      continue;
    }
    if (/^\[[^\]]+\]$/u.test(line)) {
      category = line.slice(1, -1);
      continue;
    }
    if (mode && category && line.includes(" - ")) {
      const [nameKr, ...rest] = line.split(" - ");
      records.push({
        line: index + 1,
        mode,
        category,
        nameKr: nameKr.trim(),
        textKr: rest.join(" - ").trim(),
      });
    }
  }
  return records;
}

function uniqueBy(records, key, label, errors) {
  const map = new Map();
  for (const record of records) {
    const value = record[key];
    if (map.has(value)) {
      errors.push({
        code: "DUPLICATE_AUTHORITY_KEY",
        message: `${label} duplicate ${key}: ${value}`,
      });
    } else {
      map.set(value, record);
    }
  }
  return map;
}

function compareNameSet(expectedNames, actualRows, label, errors) {
  const missingExpectedNames = expectedNames.filter((value) => !nonEmpty(value));
  if (missingExpectedNames.length > 0) {
    errors.push({
      code: "ABILITY_CANONICAL_KOREAN_NAME_MISSING",
      message: `${label} has ${missingExpectedNames.length} canonical records without an effective Korean name.`,
    });
  }
  const expected = new Set(expectedNames.filter(nonEmpty));
  const actual = new Set(actualRows.map((row) => row.nameKr));
  for (const value of expected) {
    if (!actual.has(value)) {
      errors.push({ code: "ABILITY_NAME_COVERAGE_MISSING", message: `${label} missing: ${value}` });
    }
  }
  for (const value of actual) {
    if (!expected.has(value)) {
      errors.push({ code: "ABILITY_NAME_COVERAGE_EXTRA", message: `${label} unexpected: ${value}` });
    }
  }
}

function buildResult() {
  const errors = [];
  const reviews = [];
  const equipmentContract = readJson(EQUIPMENT_CONTRACT);
  const soldierContract = readJson(SOLDIER_CONTRACT);

  if (
    equipmentContract.schemaId !== "equipment-name-kr-authority/v1" ||
    equipmentContract.status !== "PASS_WITH_REVIEW" ||
    equipmentContract.identityBoundary?.nameTextAuthority !== true ||
    equipmentContract.identityBoundary?.identityAuthority !== false ||
    equipmentContract.identityBoundary?.publicAdmissionAuthority !== false ||
    equipmentContract.identityBoundary?.runtimeNameJoinAllowed !== false
  ) {
    errors.push({ code: "EQUIPMENT_AUTHORITY_CONTRACT_MISMATCH", message: "Equipment localization authority contract boundary mismatch." });
  }

  if (
    soldierContract.schemaId !== "soldier-localization-authority/v1" ||
    soldierContract.status !== "PASS_WITH_REVIEW" ||
    soldierContract.identityBoundary?.nameTextAuthority !== true ||
    soldierContract.identityBoundary?.abilityTextAuthority !== true ||
    soldierContract.identityBoundary?.identityAuthority !== false ||
    soldierContract.identityBoundary?.heroSoldierRelationAuthority !== false ||
    soldierContract.identityBoundary?.runtimeNameJoinAllowed !== false
  ) {
    errors.push({ code: "SOLDIER_AUTHORITY_CONTRACT_MISMATCH", message: "Soldier localization authority contract boundary mismatch." });
  }

  const equipmentText = readText(equipmentContract.source.path);
  const soldierNameText = readText(soldierContract.sources.names.path);
  const soldierAbilityText = readText(soldierContract.sources.abilities.path);

  if (sha256(equipmentText) !== equipmentContract.source.sha256) {
    errors.push({ code: "EQUIPMENT_SOURCE_HASH_MISMATCH", message: "Equipment authoritative source hash mismatch." });
  }
  if (sha256(soldierNameText) !== soldierContract.sources.names.sha256) {
    errors.push({ code: "SOLDIER_NAME_SOURCE_HASH_MISMATCH", message: "Soldier name authoritative source hash mismatch." });
  }
  if (sha256(soldierAbilityText) !== soldierContract.sources.abilities.sha256) {
    errors.push({ code: "SOLDIER_ABILITY_SOURCE_HASH_MISMATCH", message: "Soldier ability authoritative source hash mismatch." });
  }

  const equipmentRows = parseEquipmentSource(equipmentText);
  const equipmentExpected = equipmentContract.expected;
  const equipmentByNameCn = uniqueBy(equipmentRows, "nameCn", "Equipment authority", errors);
  const sectionCounts = Object.fromEntries(
    Object.keys(equipmentExpected.sectionCounts).map((group) => [
      group,
      equipmentRows.filter((row) => row.group === group).length,
    ]),
  );
  const unresolvedEquipment = equipmentRows.filter((row) => row.nameKr === "미확정");
  const resolvedEquipment = equipmentRows.filter((row) => row.nameKr !== "미확정");
  if (equipmentRows.length !== equipmentExpected.sourceRecordCount) {
    errors.push({ code: "EQUIPMENT_SOURCE_COUNT_MISMATCH", message: `Equipment source ${equipmentRows.length} != ${equipmentExpected.sourceRecordCount}` });
  }
  if (resolvedEquipment.length !== equipmentExpected.resolvedKoreanTextCount || unresolvedEquipment.length !== equipmentExpected.unresolvedKoreanTextCount) {
    errors.push({ code: "EQUIPMENT_KOREAN_TEXT_COUNT_MISMATCH", message: "Equipment resolved/unresolved Korean text counts diverged." });
  }
  for (const [group, expected] of Object.entries(equipmentExpected.sectionCounts)) {
    if (sectionCounts[group] !== expected) {
      errors.push({ code: "EQUIPMENT_SECTION_COUNT_MISMATCH", message: `${group} ${sectionCounts[group]} != ${expected}` });
    }
  }
  for (const row of equipmentRows) {
    if (!nonEmpty(row.nameCn) || !nonEmpty(row.nameKr)) {
      errors.push({ code: "EQUIPMENT_EMPTY_AUTHORITY_TEXT", message: `Equipment source line ${row.line} contains an empty CN/KR value.` });
    }
  }

  const equipmentCanonical = readJson(equipmentContract.identityBoundary.canonicalIdentitySource);
  const equipmentCanonicalRows = equipmentCanonical.records ?? [];
  const canonicalEquipmentByNameCn = uniqueBy(equipmentCanonicalRows, "nameCn", "Equipment canonical", errors);
  if (equipmentCanonicalRows.length !== equipmentExpected.canonicalRecordCount) {
    errors.push({ code: "EQUIPMENT_CANONICAL_COUNT_MISMATCH", message: `Equipment canonical ${equipmentCanonicalRows.length} != ${equipmentExpected.canonicalRecordCount}` });
  }
  for (const row of equipmentRows) {
    if (!canonicalEquipmentByNameCn.has(row.nameCn)) {
      errors.push({ code: "EQUIPMENT_AUTHORITY_UNKNOWN_IDENTITY", message: `Equipment source has unknown canonical nameCn: ${row.nameCn}` });
    }
  }
  for (const row of equipmentCanonicalRows) {
    if (!equipmentByNameCn.has(row.nameCn)) {
      errors.push({ code: "EQUIPMENT_AUTHORITY_MISSING_IDENTITY", message: `Equipment canonical identity missing from authority: ${row.equipmentId}:${row.nameCn}` });
    }
  }

  let equipmentDownstreamMismatchCount = 0;
  try {
    const downstream = readJson(equipmentContract.downstream.currentIdBoundPresentation);
    for (const row of equipmentRows) {
      const canonical = canonicalEquipmentByNameCn.get(row.nameCn);
      if (!canonical) continue;
      const projected = downstream.byEquipmentId?.[String(canonical.equipmentId)];
      const expectedKr = row.nameKr === "미확정" ? null : row.nameKr;
      if (!projected || projected.nameCn !== row.nameCn || projected.nameKr !== expectedKr) {
        equipmentDownstreamMismatchCount += 1;
      }
    }
  } catch {
    equipmentDownstreamMismatchCount = equipmentRows.length;
  }
  if (equipmentDownstreamMismatchCount > 0) {
    reviews.push({
      code: "EQUIPMENT_NAME_LEGACY_CONSUMER_PARITY_REVIEW",
      blocking: false,
      count: equipmentDownstreamMismatchCount,
      message: "Authoritative Equipment Korean text differs from the current ID-bound downstream presentation. Refresh downstream only; do not reopen canonical/admission semantics.",
    });
  }

  const soldierNameRows = parseSoldierNameSource(soldierNameText);
  const lowerNameRows = soldierNameRows.filter((row) => row.group === "LOWER");
  const tier3NameRows = soldierNameRows.filter((row) => row.group === "TIER3");
  const provisionalNameRows = tier3NameRows.filter((row) => row.provisional);
  const soldierNameByCn = uniqueBy(soldierNameRows, "nameCn", "Soldier name authority", errors);

  if (
    soldierNameRows.length !== soldierContract.expected.normalSoldierCount ||
    lowerNameRows.length !== soldierContract.expected.lowerTierNameCount ||
    tier3NameRows.length !== soldierContract.expected.tier3NameCount ||
    provisionalNameRows.length !== soldierContract.expected.tier3ProvisionalNameCount ||
    tier3NameRows.length - provisionalNameRows.length !== soldierContract.expected.tier3ConfirmedNameCount
  ) {
    errors.push({ code: "SOLDIER_NAME_SOURCE_COUNT_MISMATCH", message: "Soldier name authority counts diverged." });
  }

  const soldierList = readJson(soldierContract.identityBoundary.canonicalIdentitySource);
  const soldierRows = soldierList.records ?? [];
  const normalSoldiers = soldierRows.filter((row) => row.isSp === false);
  const spSoldiers = soldierRows.filter((row) => row.isSp === true);
  const soldierById = new Map(soldierRows.map((row) => [row.soldierId, row]));
  const lowerPresentation = readJson("data/presentation/soldier-lower-tier-name-kr.v1.json");
  const provisionalPresentation = readJson("data/presentation/soldier-t3-provisional-name-kr.v1.json");
  const correctionPresentation = readJson("data/presentation/soldier-confirmed-name-correction.v1.json");
  const lowerById = new Map((lowerPresentation.records ?? []).map((row) => [row.soldierId, row]));
  const provisionalById = new Map((provisionalPresentation.records ?? []).map((row) => [row.soldierId, row]));
  const correctionById = new Map((correctionPresentation.records ?? []).map((row) => [row.soldierId, row]));

  const effectiveNameKr = (record) => {
    const correction = correctionById.get(record.soldierId);
    if (correction?.displayNameKr) return correction.displayNameKr;
    const lower = lowerById.get(record.soldierId);
    if (lower?.nameKr) return lower.nameKr;
    const provisional = provisionalById.get(record.soldierId);
    if (provisional?.displayNameKr) return provisional.displayNameKr;
    return record.nameKr ?? null;
  };

  if (normalSoldiers.length !== soldierContract.expected.normalSoldierCount) {
    errors.push({ code: "SOLDIER_NORMAL_CANONICAL_COUNT_MISMATCH", message: `Normal Soldier ${normalSoldiers.length} != ${soldierContract.expected.normalSoldierCount}` });
  }

  let soldierNameDownstreamMismatchCount = 0;
  for (const record of normalSoldiers) {
    const source = soldierNameByCn.get(record.nameCn);
    if (!source) {
      errors.push({ code: "SOLDIER_NAME_AUTHORITY_MISSING_IDENTITY", message: `Normal Soldier missing from name authority: ${record.soldierId}:${record.nameCn}` });
      continue;
    }
    const effective = effectiveNameKr(record);
    if (!nonEmpty(effective) || source.nameKr !== effective) {
      soldierNameDownstreamMismatchCount += 1;
    }
  }
  for (const source of soldierNameRows) {
    if (!normalSoldiers.some((row) => row.nameCn === source.nameCn)) {
      errors.push({ code: "SOLDIER_NAME_AUTHORITY_UNKNOWN_IDENTITY", message: `Soldier name authority has unknown normal identity: ${source.nameCn}` });
    }
  }
  const provisionalIds = new Set((provisionalPresentation.records ?? []).map((row) => row.soldierId));
  const sourceProvisionalCn = new Set(provisionalNameRows.map((row) => row.nameCn));
  for (const soldierId of provisionalIds) {
    const row = soldierById.get(soldierId);
    if (!row || !sourceProvisionalCn.has(row.nameCn)) {
      errors.push({ code: "SOLDIER_PROVISIONAL_BOUNDARY_MISMATCH", message: `Provisional Soldier ${soldierId} is not marked provisional in authority source.` });
    }
  }
  if (soldierNameDownstreamMismatchCount > 0) {
    reviews.push({
      code: "SOLDIER_NAME_DOWNSTREAM_PARITY_REVIEW",
      blocking: false,
      count: soldierNameDownstreamMismatchCount,
      message: "Soldier name authority differs from current effective presentation for some records. Refresh presentation overlays only; do not mutate Soldier identity.",
    });
  }

  const abilityRows = parseAbilitySource(soldierAbilityText);
  const tier2Abilities = abilityRows.filter((row) => row.mode === "TIER2");
  const tier3Abilities = abilityRows.filter((row) => row.mode === "TIER3");
  const spAbilities = abilityRows.filter((row) => row.mode === "SP");
  uniqueBy(tier2Abilities, "nameKr", "Tier2 ability authority", errors);
  uniqueBy(tier3Abilities, "nameKr", "Tier3 ability authority", errors);
  uniqueBy(spAbilities, "nameKr", "SP ability authority", errors);

  const abilityExpected = soldierContract.expected.ability;
  if (
    tier2Abilities.length !== abilityExpected.tier2Count ||
    tier3Abilities.length !== abilityExpected.normalTier3Count ||
    spAbilities.length !== abilityExpected.spTier3Count ||
    abilityRows.length !== abilityExpected.totalRecordCount
  ) {
    errors.push({ code: "SOLDIER_ABILITY_SOURCE_COUNT_MISMATCH", message: "Soldier ability authority counts diverged." });
  }
  for (const row of abilityRows) {
    if (!nonEmpty(row.nameKr) || !nonEmpty(row.textKr)) {
      errors.push({ code: "SOLDIER_ABILITY_EMPTY_TEXT", message: `Soldier ability source line ${row.line} has empty name/text.` });
    }
  }

  const tier2Normal = normalSoldiers.filter((row) => row.tier === 2);
  const tier3Normal = normalSoldiers.filter((row) => row.tier === 3);
  compareNameSet(tier2Normal.map(effectiveNameKr), tier2Abilities, "Tier2 ability authority", errors);
  compareNameSet(tier3Normal.map(effectiveNameKr), tier3Abilities, "Tier3 ability authority", errors);

  const expectedSpNames = [];
  for (const sp of spSoldiers) {
    const base = soldierById.get(sp.normalSoldierId);
    if (!base || base.isSp) {
      errors.push({ code: "SOLDIER_SP_BASE_RELATION_MISMATCH", message: `SP Soldier ${sp.soldierId} has invalid normalSoldierId ${sp.normalSoldierId}` });
      continue;
    }
    const name = effectiveNameKr(base);
    if (!nonEmpty(name)) {
      errors.push({ code: "SOLDIER_SP_BASE_NAME_MISSING", message: `SP Soldier ${sp.soldierId} base Soldier ${base.soldierId} has no effective Korean name.` });
      continue;
    }
    expectedSpNames.push(name);
  }
  compareNameSet(expectedSpNames, spAbilities, "SP ability authority", errors);

  if (spSoldiers.length !== abilityExpected.spTier3Count) {
    errors.push({ code: "SOLDIER_SP_CANONICAL_COUNT_MISMATCH", message: `SP Soldier ${spSoldiers.length} != ${abilityExpected.spTier3Count}` });
  }

  reviews.push(...(soldierContract.reviews ?? []));

  const status = errors.length > 0 ? "FAIL" : reviews.length > 0 ? "PASS_WITH_REVIEW" : "PASS";
  return {
    version: 1,
    schemaId: "equipment-soldier-presentation-authority-validation/v1",
    status,
    scope: "presentation-localization-authority-only",
    boundaries: {
      identityMutation: false,
      relationMutation: false,
      publicAdmissionMutation: false,
      runtimeNameJoin: false,
      idArithmetic: false,
      repositoryMutation: false,
    },
    equipment: {
      sourceRecords: equipmentRows.length,
      canonicalRecords: equipmentCanonicalRows.length,
      resolvedKoreanText: resolvedEquipment.length,
      unresolvedKoreanText: unresolvedEquipment.length,
      sectionCounts,
      downstreamMismatchCount: equipmentDownstreamMismatchCount,
    },
    soldierNames: {
      sourceRecords: soldierNameRows.length,
      normalCanonicalRecords: normalSoldiers.length,
      lowerTierRecords: lowerNameRows.length,
      tier3Records: tier3NameRows.length,
      tier3ProvisionalRecords: provisionalNameRows.length,
      downstreamMismatchCount: soldierNameDownstreamMismatchCount,
    },
    soldierAbilities: {
      totalRecords: abilityRows.length,
      tier2Records: tier2Abilities.length,
      normalTier3Records: tier3Abilities.length,
      spRecords: spAbilities.length,
      canonicalSpRecords: spSoldiers.length,
      idBoundProductionConsumerAdmitted: false,
    },
    errors,
    reviews,
  };
}

const args = new Set(process.argv.slice(2));
const result = buildResult();
if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  console.log(`Localization user authority: ${result.status}`);
  console.log(`Equipment ${result.equipment.sourceRecords}/${result.equipment.canonicalRecords}, downstream review ${result.equipment.downstreamMismatchCount}`);
  console.log(`Soldier names ${result.soldierNames.sourceRecords}/${result.soldierNames.normalCanonicalRecords}, downstream review ${result.soldierNames.downstreamMismatchCount}`);
  console.log(`Soldier abilities ${result.soldierAbilities.totalRecords} = T2 ${result.soldierAbilities.tier2Records} + T3 ${result.soldierAbilities.normalTier3Records} + SP ${result.soldierAbilities.spRecords}`);
  for (const review of result.reviews) {
    console.log(`REVIEW ${review.code}${review.count != null ? ` count=${review.count}` : ""}`);
  }
}
if (result.status === "FAIL") {
  for (const error of result.errors) console.error(`${error.code}: ${error.message}`);
  process.exit(1);
}
