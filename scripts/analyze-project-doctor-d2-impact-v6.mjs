import fs from 'node:fs';
import { analyzePaths, buildEffectiveMap, parseStdinText } from './analyze-project-doctor-d2-impact.mjs';

export const D2_V6_CONTRACT_PATH = 'data/contracts/project-doctor-d2-impact-contract.v6.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function loadProjectDoctorD2V6Context(contractPath = D2_V6_CONTRACT_PATH) {
  const contract = read(contractPath);
  if (contract.status !== 'DESIGN_FROZEN' || contract.schemaId !== 'project-doctor-d2-impact-contract/v6') {
    throw new Error(`D2 V6 contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  const predecessor = read(contract.extends);
  if (predecessor.status !== 'DESIGN_FROZEN' || predecessor.schemaId !== 'project-doctor-d2-impact-contract/v5') {
    throw new Error('D2 V6 predecessor must be frozen V5.');
  }
  const baseMap = read(contract.baseMap ?? predecessor.baseMap);
  if (baseMap.status !== 'DESIGN_FROZEN') throw new Error('D2 base dependency map is not frozen.');
  const v5Map = buildEffectiveMap(baseMap, predecessor);
  const effectiveMap = buildEffectiveMap(v5Map, contract);
  return { contract, predecessor, baseMap, effectiveMap };
}

function parseCli(argv) {
  const options = { contractPath: D2_V6_CONTRACT_PATH, json: false, stdin: false, paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--contract') options.contractPath = argv[++i];
    else if (arg === '--help' || arg === '-h') options.help = true;
    else options.paths.push(arg);
  }
  return options;
}

const options = parseCli(process.argv.slice(2));
if (options.help) {
  console.log('Usage: node scripts/analyze-project-doctor-d2-impact-v6.mjs [--json] [--stdin] [repository paths...]');
  process.exit(0);
}

try {
  const context = loadProjectDoctorD2V6Context(options.contractPath);
  const stdinText = options.stdin ? fs.readFileSync(0, 'utf8') : '';
  const inputPaths = [...options.paths, ...(options.stdin ? parseStdinText(stdinText) : [])];
  const result = analyzePaths(inputPaths, context.effectiveMap);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('PROJECT DOCTOR IMPACT — D2 V6');
    console.log(`Changed files : ${result.changedFileCount}`);
    console.log(`Status        : ${result.status}`);
    console.log(`Domains       : ${result.domains.length ? result.domains.join(', ') : '-'}`);
    for (const file of result.files) {
      console.log(`${file.path ?? file.inputPath}: ${file.status} [${file.directNodes.join(', ') || '-'}]`);
    }
  }
  process.exitCode = context.contract.exitPolicy?.[result.status] ?? (result.status === 'MAPPED' ? 0 : result.status === 'MANUAL_REVIEW' ? 3 : 2);
} catch (error) {
  console.error(`[doctor:impact:v6] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
