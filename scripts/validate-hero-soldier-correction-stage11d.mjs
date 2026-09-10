import fs from 'node:fs';

const contractPath = 'data/contracts/hero-soldier-correction-stage11d-freeze-contract.v1.json';
const checkpointPath = 'data/validation/hero-soldier-correction-stage11d-final.v1.json';
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
const errors = [];

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const add4 = (a, b) => ({
  hp: a.hp + b.hp,
  atk: a.atk + b.atk,
  def: a.def + b.def,
  mdef: a.mdef + b.mdef,
});
const norm4 = (a) => ({ hp: a.hp / 100, atk: a.atk / 100, def: a.def / 100, mdef: a.mdef / 100 });

if (contract.stage !== 'HERO_SOLDIER_CORRECTION_11D') errors.push('CONTRACT_STAGE_MISMATCH');
if (contract.freezePolicy?.status !== 'FINAL_FROZEN') errors.push('CONTRACT_NOT_FINAL_FROZEN');
if (checkpoint.status !== 'PASS_HERO_SOLDIER_CORRECTION_STAGE11D_FREEZE') errors.push('CHECKPOINT_STATUS_MISMATCH');
if (checkpoint.completion !== 'COMPLETE' || checkpoint.freezeState !== 'FINAL_FROZEN') errors.push('CHECKPOINT_NOT_COMPLETE_FROZEN');
if (checkpoint.contract !== contractPath) errors.push('CHECKPOINT_CONTRACT_POINTER_MISMATCH');
if (checkpoint.blockers?.length !== 0 || checkpoint.hardErrorCount !== 0) errors.push('CHECKPOINT_HAS_BLOCKER_OR_ERROR');

const f = contract.leonFixture;
if (f?.heroId !== 6) errors.push('LEON_HERO_ID_MISMATCH');
if (!eq(norm4(f.normalRawBase), f.normalBasePercent)) errors.push('LEON_NORMAL_BASE_NORMALIZATION_MISMATCH');
if (!eq(norm4(f.spRawBase), f.spBasePercent)) errors.push('LEON_SP_BASE_NORMALIZATION_MISMATCH');
if (!eq(f.normalBasePercent, f.spBasePercent) || f.baseClassification !== 'SAME_BASE_CONFIRMED') errors.push('LEON_BASE_CLASSIFICATION_MISMATCH');
if (!eq(add4(f.normalBasePercent, f.bondContributionPercent), f.normalFinalPercent)) errors.push('LEON_NORMAL_FINAL_ARITHMETIC_MISMATCH');
if (!eq(add4(f.spBasePercent, f.bondContributionPercent), f.spFinalPercent)) errors.push('LEON_SP_FINAL_ARITHMETIC_MISMATCH');
if (f.spBondPolicy !== 'REUSED_UNCHANGED' || contract.canonicalContract?.bondContribution?.spPolicy !== 'REUSED_UNCHANGED') errors.push('SP_BOND_POLICY_MISMATCH');
if (contract.canonicalContract?.bondContribution?.replacementOrExclusionInSp !== false) errors.push('SP_BOND_REPLACEMENT_EXCLUSION_NOT_FALSE');

const expectedOffsets = { HPCmd_INI: '0x40', DFCmd_INI: '0x44', ATCmd_INI: '0x48', MagicDFCmd_INI: '0x4c' };
if (!eq(contract.runtimeAuthority?.spCmdFieldOffsets, expectedOffsets)) errors.push('SP_CMD_OFFSETS_MISMATCH');
const expectedModifierTypes = { HPCmdAdd: 93, ATCmdAdd: 94, DFCmdAdd: 95, MagicDFCmdAdd: 96 };
if (!eq(contract.runtimeAuthority?.hero3ModifierTypes, expectedModifierTypes)) errors.push('HERO3_MODIFIER_TYPES_MISMATCH');
if (contract.runtimeAuthority?.calculationOwner !== 'BlackJack.ProjectL.Battle.BattleProperty.ComputeSoldierProperties') errors.push('RUNTIME_OWNER_MISMATCH');
if (!String(contract.runtimeAuthority?.spSelector || '').startsWith('GetSPHeroInfoIfJobIsSP')) errors.push('SP_SELECTOR_MISMATCH');

const ckLeon = checkpoint.fixtureChecks?.leon;
const toArray = (x) => [x.hp, x.atk, x.def, x.mdef];
if (!eq(ckLeon?.normalBase, toArray(f.normalBasePercent))) errors.push('CHECKPOINT_NORMAL_BASE_MISMATCH');
if (!eq(ckLeon?.spBase, toArray(f.spBasePercent))) errors.push('CHECKPOINT_SP_BASE_MISMATCH');
if (!eq(ckLeon?.bondContribution, toArray(f.bondContributionPercent))) errors.push('CHECKPOINT_BOND_MISMATCH');
if (!eq(ckLeon?.normalFinal, toArray(f.normalFinalPercent))) errors.push('CHECKPOINT_NORMAL_FINAL_MISMATCH');
if (!eq(ckLeon?.spFinal, toArray(f.spFinalPercent))) errors.push('CHECKPOINT_SP_FINAL_MISMATCH');

for (const k of ['spSelectorPresent','spCmdOffsetsConfirmed','computeSoldierPropertiesOwnerConfirmed','hero3ModifierIndicesConfirmed','modifierIndexAccessConfirmed','spBranchReusesCommonHero3Application']) {
  if (checkpoint.runtimeChecks?.[k] !== true) errors.push(`RUNTIME_CHECK_FALSE:${k}`);
}
if (checkpoint.runtimeChecks?.spSpecificHero3ExclusionObserved !== false) errors.push('SP_EXCLUSION_OBSERVED_NOT_FALSE');
if (checkpoint.runtimeChecks?.spSpecificHero3ReplacementObserved !== false) errors.push('SP_REPLACEMENT_OBSERVED_NOT_FALSE');

for (const k of ['nameJoinCount','idArithmeticSemanticMappingCount','frontendSemanticRecomputeCount','rawSourceMutationCount']) {
  if (checkpoint.boundaryChecks?.[k] !== 0) errors.push(`BOUNDARY_COUNT_NONZERO:${k}`);
}
if (checkpoint.boundaryChecks?.runtimeBinaryCommitted !== false) errors.push('RUNTIME_BINARY_COMMITTED');

const result = {
  status: errors.length ? 'FAIL' : 'PASS',
  stage: contract.stage,
  contract: contractPath,
  checkpoint: checkpointPath,
  leon: {
    heroId: f.heroId,
    normalBase: toArray(f.normalBasePercent),
    spBase: toArray(f.spBasePercent),
    bondContribution: toArray(f.bondContributionPercent),
    normalFinal: toArray(f.normalFinalPercent),
    spFinal: toArray(f.spFinalPercent),
  },
  errorCount: errors.length,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
