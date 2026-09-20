import fs from "node:fs";

const overlayPath = "data/presentation/hero-heart-fetter-effect-kr.v1.json";
const shardPaths = [
  "data/generated/hero-heart-fetter-site-consumer/skill-text-001.json",
  "data/generated/hero-heart-fetter-site-consumer/skill-text-002.json",
  "data/generated/hero-heart-fetter-site-consumer/skill-text-003.json",
];

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const overlay = readJson(overlayPath);
const sourceSkills = {};
for (const path of shardPaths) Object.assign(sourceSkills, readJson(path).skills);

const errors = [];
const rows = overlay.skills ?? {};
const sourceIds = Object.keys(sourceSkills).sort((a, b) => Number(a) - Number(b));
const overlayIds = Object.keys(rows).sort((a, b) => Number(a) - Number(b));

if (overlay.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (overlay.kind !== "HERO_HEART_FETTER_EFFECT_KR") errors.push("unexpected kind");
if (overlay.policy?.semanticAuthority !== false) errors.push("semanticAuthority must remain false");
if (overlay.policy?.presentationLocalizationOnly !== true) errors.push("presentationLocalizationOnly must be true");
if (overlay.policy?.fallbackToCn !== false) errors.push("fallbackToCn must remain false");
if (sourceIds.length !== 1066) errors.push(`source skill count expected 1066, got ${sourceIds.length}`);
if (overlayIds.length !== sourceIds.length) errors.push(`overlay skill count ${overlayIds.length} != source ${sourceIds.length}`);
if (JSON.stringify(overlayIds) !== JSON.stringify(sourceIds)) errors.push("overlay skillId set differs from frozen source");

const cleanCn = (value) => String(value)
  .replace(/<color=#[0-9A-Fa-f]{6}>(.*?)<\/color>/g, "$1")
  .replace(/\r/g, "")
  .replace(/\n+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const stripJobPrefix = (value) => cleanCn(value)
  .replace(/^职业为[^:：，,]+生效\s*[:：，,]\s*/, "")
  .replace(/^职业[^:：，,]+生效\s*[:：，,]\s*/, "")
  .replace(/^职业为[^:：，,]+\s*[:：]\s*/, "")
  .trim();

const numericTokens = (value) => (String(value).match(/\d+(?:\.\d+)?%?/g) ?? []);

for (const id of sourceIds) {
  const row = rows[id];
  const cn = sourceSkills[id];
  if (!row) continue;
  if (row.descriptionCn !== cn) errors.push(`skill ${id}: descriptionCn drift`);
  if (row.method !== "RULE_BASED_EQUIPMENT_STYLE_V1") errors.push(`skill ${id}: unexpected method`);
  if (typeof row.descriptionKr !== "string" || !row.descriptionKr.trim()) {
    errors.push(`skill ${id}: empty descriptionKr`);
    continue;
  }
  if (/[\u3400-\u9FFF]/u.test(row.descriptionKr)) errors.push(`skill ${id}: Chinese character remains in descriptionKr`);
  if (/(?:\\+\\+|--|\\+-|-\\+)/.test(row.descriptionKr)) errors.push(`skill ${id}: malformed adjacent signs in descriptionKr`);\n  const srcNums = numericTokens(stripJobPrefix(cn));
  const krNums = numericTokens(row.descriptionKr);
  if (JSON.stringify(srcNums) !== JSON.stringify(krNums)) {
    errors.push(`skill ${id}: numeric token parity failed: ${JSON.stringify(srcNums)} != ${JSON.stringify(krNums)}`);
  }
}

if (overlay.counts?.skills !== overlayIds.length) errors.push("overlay counts.skills mismatch");
if (overlay.counts?.unresolved !== 0) errors.push("overlay unresolved must be 0");

if (errors.length) {
  console.error(JSON.stringify({ status: "FAIL", errorCount: errors.length, errors: errors.slice(0, 100) }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  sourceSkillCount: sourceIds.length,
  translatedSkillCount: overlayIds.length,
  unresolved: 0,
  semanticAuthority: false,
  presentationLocalizationOnly: true,
}, null, 2));
