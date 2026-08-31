import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAssetIntakeCli } from './run-v1.mjs';

const ROLLOUT_CONTRACT_PATH = 'tools/asset-intake/contract/skin-stage3-2-rollout.v1.json';

const readJson = async filePath => JSON.parse(await fs.readFile(filePath, 'utf8'));

export function parseSkinStage32Args(argv) {
  const options = {
    root: null,
    resourceMap: null,
    sourceArtifact: null,
    out: null,
    diagnostics: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--root', '--resource-map', '--source-artifact', '--out', '--diagnostics'].includes(arg)) {
      if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = argv[++i];
    } else if (arg === '--contract') {
      throw new Error('Skin Stage 3-2 rollout uses the frozen current contract and does not allow --contract override.');
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

const usage = () => [
  'Usage:',
  '  node tools/asset-intake/cli/run-skin-stage3-2-v1.mjs --root <authoritative-unity-root> [--resource-map <confirmed-map.json>] [--source-artifact <id>] [--out <file>] [--diagnostics <file>]',
  '',
  'This runner always consumes the current frozen Skin Stage 3-2 Asset Intake contract.',
  'It does not promote Project Status or treat branch-only historical evidence as current authority.',
].join('\n');

export async function loadSkinStage32RolloutAuthority() {
  const rollout = await readJson(ROLLOUT_CONTRACT_PATH);
  const readiness = await readJson(rollout.currentAuthority.activeSource);
  const contract = await readJson(rollout.currentAuthority.normalizedContract);

  if (rollout.schemaId !== 'asset-intake-skin-stage3-2-rollout/v1' || rollout.status !== 'DESIGN_FROZEN') {
    throw new Error('Skin Stage 3-2 rollout contract is not frozen.');
  }
  if (readiness.status !== rollout.currentAuthority.requiredStatus) {
    throw new Error(`Skin current authority status changed: ${readiness.status}`);
  }
  if (readiness.evidence?.present !== false) {
    throw new Error('Skin current authority unexpectedly claims evidence; re-evaluate the rollout predecessor before execution.');
  }
  if (contract.contractVersion !== 'asset-intake/v1' || contract.domain !== 'skin') {
    throw new Error('Skin normalized Asset Intake contract is invalid.');
  }
  if (contract.sourceContext?.path !== rollout.currentAuthority.activeSource) {
    throw new Error('Skin normalized contract does not point at the current authority source.');
  }

  const keys = contract.records.map(record => Number(record.canonicalKey?.value));
  if (JSON.stringify(keys) !== JSON.stringify(rollout.currentAuthority.expectedCanonicalKeys)) {
    throw new Error(`Skin rollout canonical keys drifted: ${JSON.stringify(keys)}`);
  }
  const locatorCount = contract.records.reduce((sum, record) => sum + record.expectedLocators.length, 0);
  if (locatorCount !== rollout.currentAuthority.expectedLocatorCount) {
    throw new Error(`Skin rollout locator count drifted: ${locatorCount}`);
  }

  return { rollout, readiness, contract };
}

export async function runSkinStage32Rollout(argv) {
  const options = parseSkinStage32Args(argv);
  if (options.help) return { status: 'HELP', exitCode: 0, text: `${usage()}\n` };
  if (!options.root) throw new Error('--root is required');

  const { rollout } = await loadSkinStage32RolloutAuthority();
  const args = [
    'skin',
    '--root', options.root,
    '--contract', rollout.currentAuthority.normalizedContract,
  ];
  if (options.resourceMap) args.push('--resource-map', options.resourceMap);
  if (options.sourceArtifact) args.push('--source-artifact', options.sourceArtifact);
  if (options.out) args.push('--out', options.out);
  if (options.diagnostics) args.push('--diagnostics', options.diagnostics);

  const result = await runAssetIntakeCli(args);
  const resolved = result.recordCounts?.resolved ?? 0;
  const pending = result.recordCounts?.pending ?? 0;
  const ambiguous = result.recordCounts?.ambiguous ?? 0;

  return {
    status: 'PASS_ASSET_INTAKE_SKIN_STAGE3_2_ROLLOUT_EXECUTION',
    exitCode: 0,
    currentAuthorityStatus: rollout.currentAuthority.requiredStatus,
    rolloutCompletion: rollout.rolloutCompletion,
    projectStatusPromoted: false,
    recordCounts: result.recordCounts,
    locatorCounts: result.locatorCounts,
    evidenceCount: result.evidenceCount,
    resolutionState: ambiguous > 0
      ? 'AMBIGUOUS_FAIL_CLOSED'
      : pending > 0
        ? 'PENDING_AUTHORITATIVE_EVIDENCE'
        : resolved === rollout.currentAuthority.expectedCanonicalKeys.length
          ? 'RESOLVED_ASSET_INTAKE_OUTPUT_NOT_PROJECT_STATUS_PROMOTED'
          : 'INCOMPLETE_FAIL_CLOSED',
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = await runSkinStage32Rollout(process.argv.slice(2));
    if (result.status === 'HELP') process.stdout.write(result.text);
    else console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[asset:intake:skin-stage3-2] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
