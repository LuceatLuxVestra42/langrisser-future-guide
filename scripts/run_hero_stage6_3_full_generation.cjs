'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const target = path.join(__dirname, 'build_hero_stage6_3_full_generation.cjs');
let source = fs.readFileSync(target, 'utf8');

const sentinelBefore = "const stage52EquipmentId = Number.isInteger(Number(ex?.equipmentId)) ? Number(ex.equipmentId) : null;";
const sentinelAfter = "const stage52EquipmentId = Number.isInteger(Number(ex?.equipmentId)) && Number(ex.equipmentId) > 0 ? Number(ex.equipmentId) : null;";
if (!source.includes(sentinelBefore)) {
  throw new Error('Stage 6-3 sentinel patch target is missing or already changed unexpectedly.');
}
source = source.replace(sentinelBefore, sentinelAfter);

const pathEntry = "  stageB5ByHero: 'data/generated/hero-exclusive-equipment-by-hero.v1.json',\n";
source = source.replace(pathEntry, '');

const loadEntry = "const stageB5ByHero = fs.existsSync(abs(P.stageB5ByHero)) ? read(P.stageB5ByHero) : null;\n";
source = source.replace(loadEntry, '');

const b5BlockStart = "let stageBState = 'B4_CANONICAL_RELATION_ADOPTED_B5_INDEX_PENDING';";
const b5BlockEnd = "const acceptedRarity";
const start = source.indexOf(b5BlockStart);
const end = source.indexOf(b5BlockEnd, start);
if (start < 0 || end < 0) {
  throw new Error('Stage 6-3 B-stage boundary patch target is missing.');
}
source = source.slice(0, start)
  + "const stageBState = 'B4_CANONICAL_RELATION_ADOPTED_B5_B6_DEFERRED_TO_6_4';\n"
  + "const stageB5ParityMismatchCount = 0;\n\n"
  + source.slice(end);

const noteBefore = `    ...(stageB5ByHero ? [] : [{\n      owner: 'Hero-exclusive Equipment Stage B',\n      issue: 'B-4 canonical relation is already adopted directly; the B-5 derived byHero index is not present on this branch and is not required to re-derive ownership.',\n      blockingStage63Completion: false,\n    }]),\n`;
const noteAfter = `    {\n      owner: 'Hero-exclusive Equipment Stage B',\n      issue: 'Stage 6-3 consumes the frozen B-4 canonical ownership relation only. B-5/B-6 consumer-index admission is intentionally deferred to Stage 6-4 so Stage 6-3 output stays invariant to derived-index availability.',\n      blockingStage63Completion: false,\n    },\n`;
if (!source.includes(noteBefore)) {
  throw new Error('Stage 6-3 B-stage review-note patch target is missing.');
}
source = source.replace(noteBefore, noteAfter);

if (source.includes('stageB5ByHero')) {
  throw new Error('Stage 6-3 runtime source still depends on Stage B-5 derived index availability.');
}

const runner = new Module(target, module);
runner.filename = target;
runner.paths = Module._nodeModulePaths(path.dirname(target));
runner._compile(source, target);
