import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAssetRoot, stableInventoryJson } from '../core/engine-v1.mjs';
import { routeAssetRequest, stableRoutingJson } from '../core/route-v1.mjs';
import {
  adaptSkinContractDocument,
  buildSkinModelResourceMap,
  stableSkinAdapterJson,
} from '../adapters/skin-v1.mjs';

const readJson = async filePath => JSON.parse(await fs.readFile(filePath, 'utf8'));

export function parseAssetIntakeCli(argv) {
  const [command, ...rest] = argv;
  const options = {
    command: command ?? null,
    root: null,
    contract: null,
    resourceMap: null,
    sourceArtifact: null,
    request: null,
    out: null,
    diagnostics: null,
    help: false,
  };
  if (command === '--help' || command === '-h' || command == null) {
    options.help = true;
    return options;
  }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--root', '--contract', '--resource-map', '--source-artifact', '--request', '--out', '--diagnostics'].includes(arg)) {
      if (!rest[i + 1]) throw new Error(`${arg} requires a value`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = rest[++i];
    } else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

const usage = () => [
  'Usage:',
  '  npm run asset:intake -- scan --root <dir> [--source-artifact <id>] [--out <file>]',
  '  npm run asset:intake -- skin --root <dir> --contract <file> [--resource-map <file>] [--out <file>] [--diagnostics <file>]',
  '  npm run asset:intake -- route --request <file> [--out <file>]',
  '  npm run asset:intake:route -- --request <file> [--out <file>]',
  '',
  'Notes:',
  '  - scan emits deterministic root-relative file evidence.',
  '  - skin consumes an existing frozen asset-intake/v1 Skin contract.',
  '  - route enforces project evidence -> Asset Intake -> approved external source priority.',
  '  - verified external candidates must re-enter Asset Intake and are never direct production assets.',
  '  - RESOURCE_ID resolution requires an explicit confirmed resource map.',
  '  - no name join, similarity matching, ID arithmetic, or cross-root fallback is performed.',
].join('\n');

async function writeOrPrint(text, outPath) {
  if (!outPath) {
    process.stdout.write(text);
    return;
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text);
}

function resourceEntriesFrom(document) {
  if (Array.isArray(document)) return document;
  if (Array.isArray(document?.modelResourcePrefabMap)) return document.modelResourcePrefabMap;
  if (Array.isArray(document?.records)) return document.records;
  throw new Error('resource map JSON must be an array or contain modelResourcePrefabMap/records');
}

export async function runAssetIntakeCli(argv) {
  const options = parseAssetIntakeCli(argv);
  if (options.help) return { status: 'HELP', exitCode: 0, text: `${usage()}\n` };
  if (!['scan', 'skin', 'route'].includes(options.command)) throw new Error(`unsupported command: ${options.command}`);

  if (options.command === 'route') {
    if (!options.request) throw new Error('--request is required for route');
    const request = await readJson(options.request);
    const routed = routeAssetRequest(request);
    await writeOrPrint(stableRoutingJson(routed), options.out);
    if (routed.exitCode !== 0) {
      return { status: routed.status, exitCode: routed.exitCode, errors: routed.errors ?? [] };
    }
    return {
      status: 'PASS_ASSET_INTAKE_OPERATIONAL_ROUTE',
      exitCode: 0,
      action: routed.decision.action,
      sourceKey: routed.decision.sourceKey,
      terminal: routed.decision.terminal,
    };
  }

  if (!options.root) throw new Error('--root is required');
  const inventory = await scanAssetRoot(options.root, { sourceArtifact: options.sourceArtifact });
  if (options.command === 'scan') {
    await writeOrPrint(stableInventoryJson(inventory), options.out);
    return { status: 'PASS_ASSET_INTAKE_SCAN', exitCode: 0, fileCount: inventory.length };
  }

  if (!options.contract) throw new Error('--contract is required for skin');
  const contract = await readJson(options.contract);
  let resourceMap = null;
  if (options.resourceMap) {
    const mapDocument = await readJson(options.resourceMap);
    resourceMap = buildSkinModelResourceMap(resourceEntriesFrom(mapDocument));
  }
  const result = adaptSkinContractDocument(contract, inventory, {
    resourceMap,
    sourceContext: {
      path: options.contract,
      stage: 'Asset Intake Stage 4',
      checkpoint: 'repository-cli-execution',
      status: 'REPOSITORY_EXECUTION',
    },
  });
  await writeOrPrint(stableSkinAdapterJson(result.document), options.out);
  if (options.diagnostics) {
    await fs.mkdir(path.dirname(options.diagnostics), { recursive: true });
    await fs.writeFile(options.diagnostics, `${JSON.stringify(result.diagnostics, null, 2)}\n`);
  }
  return {
    status: 'PASS_ASSET_INTAKE_SKIN_ADAPTER_EXECUTION',
    exitCode: 0,
    recordCounts: result.diagnostics.recordCounts,
    locatorCounts: result.diagnostics.locatorCounts,
    evidenceCount: result.diagnostics.evidenceCount,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = await runAssetIntakeCli(process.argv.slice(2));
    if (result.status === 'HELP') process.stdout.write(result.text);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`[asset:intake] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
