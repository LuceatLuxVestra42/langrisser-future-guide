'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DUMP = path.join(ROOT, 'data', 'metadata', 'dump.cs');
const OUT = path.join(ROOT, 'data', 'validation', 'hero-display-stat-investigation.v1.json');

const text = fs.readFileSync(DUMP, 'utf8');
const lines = text.split(/\r?\n/);

function findIndexes(term) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(term)) out.push(i);
  return out;
}

function around(index, before = 20, after = 40) {
  const start = Math.max(0, index - before);
  const end = Math.min(lines.length - 1, index + after);
  return {
    startLine: start + 1,
    endLine: end + 1,
    lines: lines.slice(start, end + 1).map((value, offset) => ({ line: start + offset + 1, text: value })),
  };
}

function findDeclarationIndex(pattern) {
  return lines.findIndex((line) => pattern.test(line.trim()));
}

function extractTypeBlock(index, maxLines = 260) {
  if (index < 0) return null;
  let end = Math.min(lines.length - 1, index + maxLines);
  for (let i = index + 1; i <= end; i += 1) {
    if (i > index + 3 && lines[i].startsWith('// Namespace:')) {
      end = i - 1;
      break;
    }
  }
  return {
    startLine: index + 1,
    endLine: end + 1,
    lines: lines.slice(index, end + 1).map((value, offset) => ({ line: index + offset + 1, text: value })),
  };
}

function nearestType(index) {
  for (let i = index; i >= Math.max(0, index - 3000); i -= 1) {
    const s = lines[i].trim();
    if (/^(public|private|protected|internal)\s+(sealed\s+|static\s+|abstract\s+|partial\s+)*(class|struct|enum|interface)\s+/.test(s)) {
      return { line: i + 1, text: s };
    }
  }
  return null;
}

const symbols = [
  'CanReachFetterUnlockCondition',
  'IsHeroFetterConditionTypeComplete',
  'GetFettersCoditionDesc',
  'GetHeroFetterCanJumpUncompleteConditionList',
  'FettersConfessionUIController_EventOnFetterJumpToMission',
];

const symbolHits = Object.fromEntries(symbols.map((symbol) => {
  const indexes = findIndexes(symbol);
  return [symbol, indexes.map((index) => ({ line: index + 1, text: lines[index], owner: nearestType(index), context: around(index, 12, 24) }))];
}));

const completionDecl = findDeclarationIndex(/^public sealed class HeroFetterCompletionCondition\b/);
const enumDecl = findDeclarationIndex(/^public enum FetterCompleteConditionType\b/);
const enumReflection = findDeclarationIndex(/^public static class ConfigDataFetterCompleteConditionTypeReflection\b/);
const heroFetterInfoDecl = findDeclarationIndex(/^public sealed class ConfigDataHeroFetterInfo\b/);

const result = {
  version: 2,
  status: completionDecl >= 0 ? 'FOUND' : 'NOT_FOUND',
  source: {
    path: 'data/metadata/dump.cs',
    sizeBytes: fs.statSync(DUMP).size,
    lineCount: lines.length,
  },
  declarations: {
    heroFetterCompletionCondition: extractTypeBlock(completionDecl),
    fetterCompleteConditionType: extractTypeBlock(enumDecl),
    fetterCompleteConditionTypeReflection: extractTypeBlock(enumReflection, 100),
    configDataHeroFetterInfo: extractTypeBlock(heroFetterInfoDecl, 180),
  },
  symbolHits,
  exactSearch: {
    completionConditionDeclarationLine: completionDecl >= 0 ? completionDecl + 1 : null,
    enumDeclarationLine: enumDecl >= 0 ? enumDecl + 1 : null,
    enumReflectionLine: enumReflection >= 0 ? enumReflection + 1 : null,
    configDataHeroFetterInfoLine: heroFetterInfoDecl >= 0 ? heroFetterInfoDecl + 1 : null,
    heroFetterCompletionConditionOccurrences: findIndexes('HeroFetterCompletionCondition').length,
    fetterCompleteConditionTypeOccurrences: findIndexes('FetterCompleteConditionType').length,
  },
  note: 'Il2CppDumper dump.cs exposes type layouts, enum values and method signatures/RVAs, but not native method bodies. Runtime branch semantics beyond enum/type contracts require native GameAssembly disassembly if not inferable from these declarations.',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  status: result.status,
  exactSearch: result.exactSearch,
  symbolLines: Object.fromEntries(Object.entries(symbolHits).map(([k, v]) => [k, v.map((x) => x.line)])),
}, null, 2));
