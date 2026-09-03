#!/usr/bin/env node
import process from 'node:process';
import {
  collectChangedPaths,
  loadProjectCheckContracts,
  routeProjectCheckPaths,
} from '../lib/project-check.mjs';

function parseArgs(argv) {
  const args = { base: null, head: 'HEAD' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') args.base = argv[++i] ?? null;
    else if (argv[i] === '--head') args.head = argv[++i] ?? null;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.base) throw new Error('--base is required.');
  if (!args.head) throw new Error('--head is required.');
  return args;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const contracts = loadProjectCheckContracts();
  const paths = collectChangedPaths({ base: args.base, head: args.head });
  const route = routeProjectCheckPaths(paths, contracts);
  console.log(JSON.stringify({
    version: 1,
    schemaId: 'project-check-merge-gate-projection/v1',
    status: route.status,
    base: args.base,
    head: args.head,
    changedFileCount: route.changedFileCount,
    owners: route.owners,
    mergeGates: route.mergeGates,
    manualReviews: route.manualReviews,
    boundaries: {
      ownerPropagationCount: 0,
      changeClassFanOutCount: 0,
      mergeGatePathInferenceCount: 0,
      semanticRecomputationCount: 0
    }
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: 'BLOCKER_MERGE_GATE_PROJECTION',
    message: String(error?.message ?? error)
  }, null, 2));
  process.exitCode = 2;
}
