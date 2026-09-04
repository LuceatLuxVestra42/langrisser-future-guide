#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyTrackedMutation,
  collectTrackedMutationSignature,
} from '../lib/tracked-mutation.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--repo') options.repo = rest[++index];
    else if (arg === '--output') options.output = rest[++index];
    else if (arg === '--head') options.head = rest[++index];
    else if (arg === '--base') options.base = rest[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function writeJson(value, output) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (output) fs.writeFileSync(output, text, 'utf8');
  else process.stdout.write(text);
}

export function runCli(options) {
  if (options.command === 'signature') {
    const signature = collectTrackedMutationSignature(options.repo ?? process.cwd());
    writeJson(signature, options.output);
    return { exitCode: 0, value: signature };
  }

  if (options.command === 'classify') {
    if (!options.head || !options.base) {
      throw new Error('classify requires --head <json> and --base <json>.');
    }
    const head = JSON.parse(fs.readFileSync(options.head, 'utf8'));
    const base = JSON.parse(fs.readFileSync(options.base, 'utf8'));
    const classification = classifyTrackedMutation(head, base);
    writeJson(classification, options.output);
    return { exitCode: classification.exitCode, value: classification };
  }

  throw new Error('Use signature or classify.');
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const { exitCode } = runCli(parseArgs(process.argv.slice(2)));
    process.exitCode = exitCode;
  } catch (error) {
    console.error(`[project-check tracked-mutation] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}
