import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const readText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(readText(p));
const hash = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const present = (v) => typeof v === "string" && v.trim().length > 0;
const error = (list, code, message) => list.push({ code, message });

function uniqueMap(rows, key, label, errors) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (map.has(value)) error(errors, "DUPLICATE_AUTHORITY_KEY", `${label} duplicate ${key}: ${value}`);
    else map.set(value, row);
  }
  return map;
}

function parseEquipment(text) {
  let type = null;
  let group = null;
  const rows = [];
  for (const [i, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\[[^\]]+\]$/u.test(line)) { type = line.slice(1, -1); continue; }
    if (/^===.*===$/u.test(line)) { group = line.replace(/^===|===$/gu, ""); continue; }
    if (/^-+$/u.test(line) || line.startsWith("중국명")) continue;
    const cols = raw.split("\t").map((v) => v.trim());
    if (type && group && cols.length >= 2) rows.push({ line: i + 1, type, group, nameCn: cols[0], nameKr: cols[1] });
  }
  return rows;
}

function parseSoldierNames(text) {
  let mode = null;
  const rows = [];
  for (const [i, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## 1~2티어")) { mode = "LOWER"; continue; }
    if (line.startsWith("## 3티어")) { mode = "TIER3"; continue; }
    if (mode === "LOWER" && line.includes(" - ")) {
      const [nameCn, ...rest] = line.split(" - ");
      rows.push({ line: i + 1, group: mode, nameCn: nameCn.trim(), nameKr: rest.join(" - ").trim(), provisional: false });
    } else if (mode === "TIER3" && line.includes(" = ") && !line.startsWith("-")) {
      const [nameCn, ...rest] = line.split(" = ");
      const rawKr = rest.join(" = ").trim();
      rows.push({ line: i + 1, group: mode, nameCn: nameCn.trim(), nameKr: rawKr.replace(/\s*\[임시 표시명.*$/u, "").trim(), provisional: rawKr.includes("[임시 표시명") });
    }
  }
  return rows;
}

function parseAbilities(text) {
  let mode = null;
  let category = null;
  const rows = [];
  for (const [i, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("2티어(")) { mode = "TIER2"; continue; }
    if (line.startsWith("===3티어(")) { mode = "TIER3"; continue; }
    if (line === "===SP 용병===") { mode = "SP"; continue; }
    if (/^\[[^\]]+\]$/u.test(line)) { category = line.slice(1, -1); continue; }
    if (mode && category && line.includes(" - ")) {
      const [nameKr, ...rest] = line.split(" - ");
      rows.push({ line: i + 1, mode, category, nameKr: nameKr.trim(), textKr: rest.join(" - ").trim() });
    }
  }
  return rows;
}

function compareNames(expectedNames, actualRows, label, errors) {
  const missingNames = expectedNames.filter((v) => !present(v));
  if (missingNames.length) error(errors, "ABILITY_AUTHORITY_NAME_MISSING", `${label} has ${missingNames.length} records without authoritative Korean names.`);
  const expected = new Set(expectedNames.filter(present));
  const actual = new Set(actualRows.map((r) => r.nameKr));
  for (const name of expected) if (!actual.has(name)) error(errors, "ABILITY_NAME_COVERAGE_MISSING", `${label} missing: ${name}`);
  for (const name of actual) if (!expected.has(name)) error(errors, "ABILITY_NAME_COVERAGE_EXTRA", `${label} unexpected: ${name}`);
}

function validate() {
  const errors = [];
  const reviews = [];
  const eq = readJson("data/presentation/equipment-name-kr-authority.v1.json");
  const sol = readJson("data/presentation/soldier-localization-authority.v1.json");

  if (eq.schemaId !== "equipment-name-kr-authority/v1" || eq.identityBoundary?.nameTextAuthority !== true || eq.identityBoundary?.identityAuthority !== false || eq.identityBoundary?.publicAdmissionAuthority !== false || eq.identityBoundary?.runtimeNameJoinAllowed !== false) {
    error(errors, "EQUIPMENT_AUTHORITY_CONTRACT_MISMATCH", "Equipment presentation authority boundary mismatch.");
  }
  if (sol.schemaId !== "soldier-localization-authority/v1" || sol.identityBoundary?.nameTextAuthority !== true || sol.identityBoundary?.abilityTextAuthority !== true || sol.identityBoundary?.identityAuthority !== false || sol.identityBoundary?.heroSoldierRelationAuthority !== false || sol.identityBoundary?.runtimeNameJoinAllowed !== false) {
    error(errors, "SOLDIER_AUTHORITY_CONTRACT_MISMATCH", "Soldier presentation authority boundary mismatch.");
  }

  const eqText = readText(eq.source.path);
  const solNameText = readText(sol.sources.names.path);
  const solAbilityText = readText(sol.sources.abilities.path);
  if (hash(eqText) !== eq.source.sha256) error(errors, "EQUIPMENT_SOURCE_HASH_MISMATCH", "Equipment source hash mismatch.");
  if (hash(solNameText) !== sol.sources.names.sha256) error(errors, "SOLDIER_NAME_SOURCE_HASH_MISMATCH", "Soldier name source hash mismatch.");
  if (hash(solAbilityText) !== sol.sources.abilities.sha256) error(errors, "SOLDIER_ABILITY_SOURCE_HASH_MISMATCH", "Soldier ability source hash mismatch.");

  const eqRows = parseEquipment(eqText);
  const eqByCn = uniqueMap(eqRows, "nameCn", "Equipment authority", errors);
  const eqCanonical = readJson(eq.identityBoundary.canonicalIdentitySource).records ?? [];
  const eqCanonicalByCn = uniqueMap(eqCanonical, "nameCn", "Equipment canonical", errors);
  const eqUnresolved = eqRows.filter((r) => r.nameKr === "미확정");
  const eqResolved = eqRows.filter((r) => r.nameKr !== "미확정");
  const eqSections = Object.fromEntries(Object.keys(eq.expected.sectionCounts).map((g) => [g, eqRows.filter((r) => r.group === g).length]));
  if (eqRows.length !== eq.expected.sourceRecordCount || eqCanonical.length !== eq.expected.canonicalRecordCount) error(errors, "EQUIPMENT_COUNT_MISMATCH", `Equipment source/canonical ${eqRows.length}/${eqCanonical.length}.`);
  if (eqResolved.length !== eq.expected.resolvedKoreanTextCount || eqUnresolved.length !== eq.expected.unresolvedKoreanTextCount) error(errors, "EQUIPMENT_TEXT_COUNT_MISMATCH", "Equipment resolved/unresolved counts diverged.");
  for (const [g, n] of Object.entries(eq.expected.sectionCounts)) if (eqSections[g] !== n) error(errors, "EQUIPMENT_SECTION_COUNT_MISMATCH", `${g} ${eqSections[g]} != ${n}`);
  for (const row of eqRows) {
    if (!present(row.nameCn) || !present(row.nameKr)) error(errors, "EQUIPMENT_EMPTY_AUTHORITY_TEXT", `Equipment source line ${row.line} has empty text.`);
    if (!eqCanonicalByCn.has(row.nameCn)) error(errors, "EQUIPMENT_AUTHORITY_UNKNOWN_IDENTITY", `Unknown Equipment identity: ${row.nameCn}`);
  }
  for (const row of eqCanonical) if (!eqByCn.has(row.nameCn)) error(errors, "EQUIPMENT_AUTHORITY_MISSING_IDENTITY", `Missing Equipment authority identity: ${row.equipmentId}:${row.nameCn}`);

  let eqDownstreamMismatch = 0;
  try {
    const downstream = readJson(eq.downstream.currentIdBoundPresentation);
    for (const row of eqRows) {
      const canonical = eqCanonicalByCn.get(row.nameCn);
      if (!canonical) continue;
      const projected = downstream.byEquipmentId?.[String(canonical.equipmentId)];
      const expectedKr = row.nameKr === "미확정" ? null : row.nameKr;
      if (!projected || projected.nameCn !== row.nameCn || projected.nameKr !== expectedKr) eqDownstreamMismatch += 1;
    }
  } catch { eqDownstreamMismatch = eqRows.length; }
  if (eqDownstreamMismatch) reviews.push({ code: "EQUIPMENT_NAME_LEGACY_CONSUMER_PARITY_REVIEW", blocking: false, count: eqDownstreamMismatch });

  const nameRows = parseSoldierNames(solNameText);
  const lowerNames = nameRows.filter((r) => r.group === "LOWER");
  const t3Names = nameRows.filter((r) => r.group === "TIER3");
  const provisionalNames = t3Names.filter((r) => r.provisional);
  const nameByCn = uniqueMap(nameRows, "nameCn", "Soldier name authority", errors);
  if (nameRows.length !== sol.expected.normalSoldierCount || lowerNames.length !== sol.expected.lowerTierNameCount || t3Names.length !== sol.expected.tier3NameCount || provisionalNames.length !== sol.expected.tier3ProvisionalNameCount || t3Names.length - provisionalNames.length !== sol.expected.tier3ConfirmedNameCount) error(errors, "SOLDIER_NAME_SOURCE_COUNT_MISMATCH", "Soldier name authority counts diverged.");

  const soldierRows = readJson(sol.identityBoundary.canonicalIdentitySource).records ?? [];
  const normal = soldierRows.filter((r) => r.isSp === false);
  const sp = soldierRows.filter((r) => r.isSp === true);
  const byId = new Map(soldierRows.map((r) => [r.soldierId, r]));
  if (normal.length !== sol.expected.normalSoldierCount) error(errors, "SOLDIER_NORMAL_CANONICAL_COUNT_MISMATCH", `Normal Soldier ${normal.length} != ${sol.expected.normalSoldierCount}`);
  for (const row of normal) if (!nameByCn.has(row.nameCn)) error(errors, "SOLDIER_NAME_AUTHORITY_MISSING_IDENTITY", `Missing Soldier name authority: ${row.soldierId}:${row.nameCn}`);
  const normalCn = new Set(normal.map((r) => r.nameCn));
  for (const row of nameRows) if (!normalCn.has(row.nameCn)) error(errors, "SOLDIER_NAME_AUTHORITY_UNKNOWN_IDENTITY", `Unknown normal Soldier identity: ${row.nameCn}`);

  const lower = readJson("data/presentation/soldier-lower-tier-name-kr.v1.json");
  const provisional = readJson("data/presentation/soldier-t3-provisional-name-kr.v1.json");
  const correction = readJson("data/presentation/soldier-confirmed-name-correction.v1.json");
  const lowerById = new Map((lower.records ?? []).map((r) => [r.soldierId, r]));
  const provisionalById = new Map((provisional.records ?? []).map((r) => [r.soldierId, r]));
  const correctionById = new Map((correction.records ?? []).map((r) => [r.soldierId, r]));
  const effectiveName = (r) => correctionById.get(r.soldierId)?.displayNameKr ?? lowerById.get(r.soldierId)?.nameKr ?? provisionalById.get(r.soldierId)?.displayNameKr ?? r.nameKr ?? null;
  let soldierDownstreamMismatch = 0;
  for (const row of normal) if (nameByCn.get(row.nameCn)?.nameKr !== effectiveName(row)) soldierDownstreamMismatch += 1;
  const provisionalCn = new Set(provisionalNames.map((r) => r.nameCn));
  for (const id of (provisional.records ?? []).map((r) => r.soldierId)) {
    const row = byId.get(id);
    if (!row || !provisionalCn.has(row.nameCn)) error(errors, "SOLDIER_PROVISIONAL_BOUNDARY_MISMATCH", `Provisional Soldier ${id} is not provisional in authority source.`);
  }
  if (soldierDownstreamMismatch) reviews.push({ code: "SOLDIER_NAME_DOWNSTREAM_PARITY_REVIEW", blocking: false, count: soldierDownstreamMismatch });

  const abilities = parseAbilities(solAbilityText);
  const t2Abilities = abilities.filter((r) => r.mode === "TIER2");
  const t3Abilities = abilities.filter((r) => r.mode === "TIER3");
  const spAbilities = abilities.filter((r) => r.mode === "SP");
  uniqueMap(t2Abilities, "nameKr", "Tier2 ability authority", errors);
  uniqueMap(t3Abilities, "nameKr", "Tier3 ability authority", errors);
  uniqueMap(spAbilities, "nameKr", "SP ability authority", errors);
  const ax = sol.expected.ability;
  if (abilities.length !== ax.totalRecordCount || t2Abilities.length !== ax.tier2Count || t3Abilities.length !== ax.normalTier3Count || spAbilities.length !== ax.spTier3Count) error(errors, "SOLDIER_ABILITY_SOURCE_COUNT_MISMATCH", "Soldier ability authority counts diverged.");
  for (const row of abilities) if (!present(row.nameKr) || !present(row.textKr)) error(errors, "SOLDIER_ABILITY_EMPTY_TEXT", `Soldier ability line ${row.line} has empty text.`);

  const authoritativeName = (r) => nameByCn.get(r.nameCn)?.nameKr ?? null;
  compareNames(normal.filter((r) => r.tier === 2).map(authoritativeName), t2Abilities, "Tier2 ability authority", errors);
  compareNames(normal.filter((r) => r.tier === 3).map(authoritativeName), t3Abilities, "Tier3 ability authority", errors);
  const expectedSpNames = [];
  for (const row of sp) {
    const base = byId.get(row.normalSoldierId);
    if (!base || base.isSp) { error(errors, "SOLDIER_SP_BASE_RELATION_MISMATCH", `SP Soldier ${row.soldierId} has invalid normalSoldierId ${row.normalSoldierId}`); continue; }
    const name = authoritativeName(base);
    if (!present(name)) { error(errors, "SOLDIER_SP_BASE_NAME_MISSING", `SP Soldier ${row.soldierId} base ${base.soldierId} has no authoritative Korean name.`); continue; }
    expectedSpNames.push(name);
  }
  compareNames(expectedSpNames, spAbilities, "SP ability authority", errors);
  if (sp.length !== ax.spTier3Count) error(errors, "SOLDIER_SP_CANONICAL_COUNT_MISMATCH", `SP Soldier ${sp.length} != ${ax.spTier3Count}`);
  reviews.push(...(sol.reviews ?? []));

  return {
    version: 1,
    schemaId: "equipment-soldier-presentation-authority-validation/v1",
    status: errors.length ? "FAIL" : reviews.length ? "PASS_WITH_REVIEW" : "PASS",
    scope: "presentation-localization-authority-only",
    boundaries: { identityMutation: false, relationMutation: false, publicAdmissionMutation: false, runtimeNameJoin: false, idArithmetic: false, repositoryMutation: false },
    equipment: { sourceRecords: eqRows.length, canonicalRecords: eqCanonical.length, resolvedKoreanText: eqResolved.length, unresolvedKoreanText: eqUnresolved.length, sectionCounts: eqSections, downstreamMismatchCount: eqDownstreamMismatch },
    soldierNames: { sourceRecords: nameRows.length, normalCanonicalRecords: normal.length, lowerTierRecords: lowerNames.length, tier3Records: t3Names.length, tier3ProvisionalRecords: provisionalNames.length, downstreamMismatchCount: soldierDownstreamMismatch },
    soldierAbilities: { totalRecords: abilities.length, tier2Records: t2Abilities.length, normalTier3Records: t3Abilities.length, spRecords: spAbilities.length, canonicalSpRecords: sp.length, idBoundProductionConsumerAdmitted: false },
    errors,
    reviews,
  };
}

const result = validate();
if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  console.log(`Localization user authority: ${result.status}`);
  console.log(`Equipment ${result.equipment.sourceRecords}/${result.equipment.canonicalRecords}, downstream review ${result.equipment.downstreamMismatchCount}`);
  console.log(`Soldier names ${result.soldierNames.sourceRecords}/${result.soldierNames.normalCanonicalRecords}, downstream review ${result.soldierNames.downstreamMismatchCount}`);
  console.log(`Soldier abilities ${result.soldierAbilities.totalRecords} = T2 ${result.soldierAbilities.tier2Records} + T3 ${result.soldierAbilities.normalTier3Records} + SP ${result.soldierAbilities.spRecords}`);
  for (const review of result.reviews) console.log(`REVIEW ${review.code}${review.count != null ? ` count=${review.count}` : ""}`);
}
if (result.status === "FAIL") {
  for (const e of result.errors) console.error(`${e.code}: ${e.message}`);
  process.exit(1);
}
