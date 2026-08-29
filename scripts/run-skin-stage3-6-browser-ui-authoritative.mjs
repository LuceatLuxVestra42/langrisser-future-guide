import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = 'scripts/validate-skin-stage3-6-browser-ui.mjs';
const tempPath = 'scripts/.skin-stage3-6-browser-ui-authoritative.runtime.mjs';
const oldBlock = `async function verifyHostedSentinel() {
  const response = await fetch(url(\`skin-stage3-6-hosted-ready.json?browser=\${Date.now()}\`), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  assert(response.ok, \`Hosted sentinel returned HTTP \${response.status}\`);
  const payload = await response.json();
  assert(payload?.status === "READY_FOR_SKIN_STAGE3_6_HOSTED_QA", \`Hosted sentinel status mismatch: \${JSON.stringify(payload)}\`);
  assert(payload?.sourceSha === hostedSummary.sourceSha, \`Hosted sentinel source SHA drift: \${payload?.sourceSha} != \${hostedSummary.sourceSha}\`);
  assert(payload?.heroDetailPageCount === 267 && payload?.skinPngCount === 540, \`Hosted sentinel population mismatch: \${JSON.stringify(payload)}\`);
  return payload;
}`;
const newBlock = `async function verifyHostedSentinel() {
  const response = await fetch(url(\`authoritative-pages-source.json?browser=\${Date.now()}\`), {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  assert(response.ok, \`Authoritative Hosted sentinel returned HTTP \${response.status}\`);
  const payload = await response.json();
  assert(payload?.status === "AUTHORITATIVE_GITHUB_PAGES_DEPLOYMENT", \`Authoritative Hosted sentinel status mismatch: \${JSON.stringify(payload)}\`);
  assert(payload?.sourceSha === hostedSummary.sourceSha, \`Authoritative Hosted source SHA drift: \${payload?.sourceSha} != \${hostedSummary.sourceSha}\`);
  assert(/^[0-9a-f]{40}$/i.test(payload?.skinRuntimeRef ?? ""), \`Authoritative Skin runtime ref is invalid: \${payload?.skinRuntimeRef}\`);
  assert(payload?.skinPngCount === 540 && payload?.semanticStageReopened === false, \`Authoritative Hosted Skin boundary mismatch: \${JSON.stringify(payload)}\`);
  assert(payload?.publisher === ".github/workflows/project-doctor-authoritative-pages-deploy.yml", \`Unexpected Hosted publisher: \${payload?.publisher}\`);
  return payload;
}`;

const source = fs.readFileSync(sourcePath, 'utf8');
const matches = source.split(oldBlock).length - 1;
if (matches !== 1) throw new Error(`Browser QA adapter expected exactly one legacy sentinel block, got ${matches}`);
const adapted = source.replace(oldBlock, newBlock);
fs.writeFileSync(tempPath, adapted);
try {
  await import(`${pathToFileURL(path.resolve(tempPath)).href}?run=${Date.now()}`);
} finally {
  fs.rmSync(tempPath, { force: true });
}
