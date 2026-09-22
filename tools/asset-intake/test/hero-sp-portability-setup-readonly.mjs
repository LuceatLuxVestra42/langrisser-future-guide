import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "experiments", "hero-sp-portability");
const fixture = JSON.parse(fs.readFileSync(path.join(root, "fixture.v1.json"), "utf8"));

assert.equal(fixture.status, "SETUP_READY_NOT_EXECUTED");
assert.equal(fixture.authorityBoundary, "PORTABILITY_TEST_FIXTURE_ONLY_NOT_CANONICAL");
assert.deepEqual(fixture.records.map((x) => x.heroId), [6, 13, 29, 37, 56]);
assert.equal(new Set(fixture.records.map((x) => x.heroId)).size, 5);
assert.equal(new Set(fixture.records.map((x) => x.charImageId)).size, 5);
assert.equal(fixture.guardrails.nameJoin, false);
assert.equal(fixture.guardrails.idArithmetic, false);
assert.equal(fixture.guardrails.filenameSimilarityMapping, false);
assert.equal(fixture.guardrails.existingGeneratedWebpInput, false);
assert.equal(fixture.guardrails.existingManifestInput, false);
assert.equal(fixture.guardrails.repositoryHistoryRuntimeDependency, false);
assert.equal(fixture.runtime.spineVersion, "3.3.05");
assert.deepEqual(fixture.runtime.pose, { animation: "idle_Normal", time: 0 });
assert.equal(fixture.runtime.spineRuntimeCommit, "1c1936532527900f74cfb58f7002998bf157b254");

const requirements = fs.readFileSync(path.join(root, "requirements.lock.txt"), "utf8");
for (const pin of ["UnityPy==1.25.3", "Pillow==12.3.0", "numpy==2.4.6"]) {
  assert.equal(requirements.split(/\r?\n/).includes(pin), true, "missing pin: " + pin);
}

for (const name of ["extract_render_input.py", "render_spine_geometry.py", "SpineGeometry.cs", "run_cleanroom.py"]) {
  const text = fs.readFileSync(path.join(root, name), "utf8");
  for (const forbidden of ["git show ", "langrisser-future-guide", "public/images/heroes/sp"]) {
    assert.equal(text.includes(forbidden), false, name + " contains forbidden runtime dependency: " + forbidden);
  }
}

const extractor = fs.readFileSync(path.join(root, "extract_render_input.py"), "utf8");
assert.match(extractor, /fixture\.v1\.json/);
assert.equal(extractor.includes("data/evidence/hero-sp-artwork-source-census.v1.json"), false);

const geometry = fs.readFileSync(path.join(root, "SpineGeometry.cs"), "utf8");
assert.match(geometry, /3\.3\.05/);
assert.match(geometry, /idle_Normal/);

const runner = fs.readFileSync(path.join(root, "run_cleanroom.py"), "utf8");
assert.match(runner, /codeload\.github\.com\/EsotericSoftware\/spine-runtimes/);
assert.match(runner, /PASS_CLEANROOM_SP_PORTABILITY/);

console.log(JSON.stringify({
  status: "PASS_ASSET_PORTABILITY_SETUP_READONLY",
  fixtureCount: fixture.records.length,
  heroIds: fixture.records.map((x) => x.heroId),
  repositoryHistoryRuntimeDependency: false
}));
