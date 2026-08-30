import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePaths, buildEffectiveMap, parseStdinText } from './analyze-project-doctor-d2-impact.mjs';
import { loadProjectDoctorD2V6Context } from './analyze-project-doctor-d2-impact-v6.mjs';

export const D2_V7_CONTRACT_PATH = 'data/contracts/project-doctor-d2-impact-contract.v7.json';
const read = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export function loadProjectDoctorD2V7Context(contractPath = D2_V7_CONTRACT_PATH) {
  const contract = read(contractPath);
  if (contract.status !== 'DESIGN_FROZEN' || contract.schemaId !== 'project-doctor-d2-impact-contract/v7') {
    throw new Error(`D2 V7 contract is not frozen: ${contract.status ?? 'missing'}`);
  }
  if (contract.extends !== 'data/contracts/project-doctor-d2-impact-contract.v6.json') {
    throw new Error('D2 V7 must extend frozen V6.');
  }
  const v6 = loadProjectDoctorD2V6Context(contract.extends);
  const effectiveMap = buildEffectiveMap(v6.effectiveMap, contract);
  return { contract, predecessor: v6.contract, baseMap: v6.baseMap, effectiveMap };
}

function parseCli(argv) {
  const options = { contractPath: D2_V7_CONTRACT_PATH, json: false, stdin: false, paths: [] };
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/analyze-project-doctor-d2-impact-v7.mjs [--json] [--stdin] [repository paths...]');
    process.exit(0);
  }
  try {
    const context = loadProjectDoctorD2V7Context(options.contractPath);
    const stdinText = options.stdin ? fs.readFileSync(0, 'utf8') : '';
    const inputPaths = [...options.paths, ...(options.stdin ? parseStdinText(stdinText) : [])];
    const result = analyzePaths(inputPaths, context.effectiveMap);
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log('PROJECT DOCTOR IMPACT — D2 V7');
      console.log(`Changed files : ${result.changedFileCount}`);
      console.log(`Status        : ${result.status}`);
      console.log(`Domains       : ${result.domains.length ? result.domains.join(', ') : '-'}`);
      for (const file of result.files) console.log(`${file.path ?? file.inputPath}: ${file.status} [${file.directNodes.join(', ') || '-'}]`);
    }
    process.exitCode = context.contract.exitPolicy?.[result.status] ?? (result.status === 'MAPPED' ? 0 : result.status === 'MANUAL_REVIEW' ? 3 : 2);
  } catch (error) {
    console.error(`[doctor:impact:v7] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
