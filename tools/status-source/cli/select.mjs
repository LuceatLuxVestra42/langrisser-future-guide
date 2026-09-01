#!/usr/bin/env node
import { selectActiveSources } from '../lib/select-active-sources.mjs';

try {
  const result = selectActiveSources({ repoRoot: process.cwd() });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('STATUS SOURCE — R1 SELECTION');
    console.log(`Status   : ${result.status}`);
    console.log(`Entries  : ${result.entryCount}`);
    console.log(`Selected : ${result.selectedCount}`);
    for (const [domain, selected] of Object.entries(result.domains)) {
      console.log(`${domain}: ${selected.selectedId} -> ${selected.sourcePath}`);
    }
  }
} catch (error) {
  console.error(`[status-source:r1] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
