from pathlib import Path

OLD_DEPLOY = Path('.github/workflows/project-doctor-authoritative-pages-deploy.yml')
NEW_DEPLOY = Path('.github/workflows/authoritative-pages-deploy.yml')
OLD_HOSTED = Path('scripts/project-doctor-validate-authoritative-pages-hosted.mjs')
NEW_HOSTED = Path('scripts/validate-authoritative-pages-hosted.mjs')
PAGES_CONFIG = Path('vite.config.pages.ts')
SKIN_READONLY = Path('scripts/validate-skin-stage3-5-static-assets-readonly.mjs')
OWNERS = Path('tools/project-check/contracts/owners.v1.json')
VALIDATORS = Path('tools/project-check/contracts/validators.v1.json')
PROJECT_CHECK_SELF_TEST = Path('tools/project-check/test/project-check-self-test.mjs')

old_workflow = OLD_DEPLOY.read_text()

# Track the exact already-proven Pages-only Vite configuration instead of recreating it.
start_marker = "          cat > vite.config.ts <<'TS'\n"
end_marker = "\n          TS"
start = old_workflow.index(start_marker) + len(start_marker)
end = old_workflow.index(end_marker, start)
config_block = old_workflow[start:end]
config_lines = [line[10:] if line.startswith('          ') else line for line in config_block.splitlines()]
PAGES_CONFIG.write_text('\n'.join(config_lines) + '\n')

workflow = old_workflow
workflow = workflow.replace('  SKIN_RUNTIME_REF: 8ad8b238f33253f87cb903fbdf56fa563dde77c3\n', '')

def drop_step(text, start_name, next_name):
    a = text.index(f'      - name: {start_name}\n')
    b = text.index(f'      - name: {next_name}\n', a)
    return text[:a] + text[b:]

workflow = drop_step(workflow, 'Overlay frozen Skin runtime only', 'Reconfirm frozen Hero artwork resolver freshness')
workflow = drop_step(workflow, 'Compose admission-aware GitHub Pages static build config', 'Build authoritative static candidate')
workflow = workflow.replace(
    '      - name: Compose latest product with frozen Skin presentation\n',
    '      - name: Validate current frozen product inputs\n',
)
workflow = workflow.replace(
    '          node scripts/project-doctor-compose-authoritative-pages-runtime.mjs\n',
    '          node scripts/validate-skin-stage3-5-static-assets-readonly.mjs\n',
)
workflow = workflow.replace(
    '      - name: Build authoritative static candidate\n        run: bun run build\n',
    '      - name: Build authoritative static candidate\n        run: |\n          node scripts/build-equipment-name-kr-presentation.mjs\n          bunx vite build --config vite.config.pages.ts\n',
)
workflow = workflow.replace(
    '            "skinRuntimeRef": "${SKIN_RUNTIME_REF}",\n',
    '            "skinSource": "CURRENT_REPOSITORY_FROZEN_CONSUMER",\n',
)
workflow = workflow.replace(
    '.github/workflows/project-doctor-authoritative-pages-deploy.yml',
    '.github/workflows/authoritative-pages-deploy.yml',
)
workflow = '\n'.join(line for line in workflow.splitlines() if 'EXPECTED_SKIN_REF:' not in line) + '\n'
workflow = workflow.replace(
    'run_hosted_validator project-doctor-authoritative-pages \\\n            node scripts/project-doctor-validate-authoritative-pages-hosted.mjs',
    'run_hosted_validator authoritative-pages \\\n            node scripts/validate-authoritative-pages-hosted.mjs',
)
workflow = workflow.replace(
    "          printf 'skinRuntimeRef=%s\\n' \"$SKIN_RUNTIME_REF\"\n",
    "          printf 'skinSource=%s\\n' 'CURRENT_REPOSITORY_FROZEN_CONSUMER'\n",
)

forbidden_workflow = [
    'SKIN_RUNTIME_REF',
    'project-doctor-compose-authoritative-pages-runtime',
    'project-doctor-validate-authoritative-pages-hosted',
    'project-doctor-authoritative-pages-deploy.yml',
]
for token in forbidden_workflow:
    leftovers = [line for line in workflow.splitlines() if token in line]
    if leftovers:
        raise SystemExit(f'active deployment workflow still contains retired token {token}: {leftovers}')
NEW_DEPLOY.write_text(workflow)

# Preserve the proven hosted/browser checks while removing only the historical overlay identity.
hosted = OLD_HOSTED.read_text()
hosted = hosted.replace('const expectedSkinRef = process.env.EXPECTED_SKIN_REF;\n', '')
hosted = hosted.replace(
    'if (!expectedSourceSha || !expectedSkinRef) throw new Error("EXPECTED_SOURCE_SHA and EXPECTED_SKIN_REF are required");',
    'if (!expectedSourceSha) throw new Error("EXPECTED_SOURCE_SHA is required");',
)
hosted = hosted.replace(
    'candidate.sourceSha === expectedSourceSha && candidate.skinRuntimeRef === expectedSkinRef',
    'candidate.sourceSha === expectedSourceSha && candidate.skinSource === "CURRENT_REPOSITORY_FROZEN_CONSUMER" && candidate.skinPngCount === 540',
)
hosted = hosted.replace(
    'check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha} skin=${expectedSkinRef}`);',
    'check(manifest, `authoritative deployment manifest did not reach source=${expectedSourceSha} with current frozen Skin consumer`);',
)
hosted = hosted.replace(
    '    skinRuntimeRef: expectedSkinRef,',
    '    skinSource: "CURRENT_REPOSITORY_FROZEN_CONSUMER",',
)
for token in ['expectedSkinRef', 'EXPECTED_SKIN_REF', 'skinRuntimeRef']:
    if token in hosted:
        raise SystemExit(f'generic hosted validator still contains historical Skin identity token: {token}')
NEW_HOSTED.write_text(hosted)

# Independent read-only Skin asset owner validator: it evaluates the existing frozen contract
# against repository bytes and does not write validation/checkpoint output.
SKIN_READONLY.write_text('''import fs from "node:fs";\nimport { evaluateStaticWebAssetManifest } from "./validate-skin-stage3-5-static-web-assets.mjs";\n\nconst readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));\nconst contract = readJson("data/contracts/skin-stage3-5-static-web-asset-map.v1.json");\nconst manifest = readJson("data/generated/skin-stage3-5-static-web-asset-map.v1.json");\nconst relation = readJson("data/generated/skin-stage2-3-bidirectional-relation.v1.json");\nconst frozenValidation = readJson("data/validation/skin-stage3-5-static-web-asset-map.v1.json");\nconst result = evaluateStaticWebAssetManifest(manifest, relation, ".", contract);\nif (!result.finalReady || result.counts.acceptedSkinCount !== 540 || result.counts.missingFileCount !== 0 || result.counts.hashMismatchCount !== 0 || result.counts.unexpectedFileCount !== 0) {\n  throw new Error(`Frozen Skin static asset validation failed: ${JSON.stringify(result.counts)}`);\n}\nif (frozenValidation.finalReady !== true || frozenValidation.status !== result.status || JSON.stringify(frozenValidation.counts) !== JSON.stringify(result.counts)) {\n  throw new Error("Frozen Skin validation checkpoint no longer matches current repository bytes.");\n}\nconsole.log(JSON.stringify({ status: "PASS_SKIN_STATIC_ASSETS_READONLY", finalReady: true, skinCount: 540, repositoryMutation: false }, null, 2));\n''')

owners = OWNERS.read_text()
old_owner = '{"id":"skin-assets","validators":[],"manualReview":"Skin asset ownership remains manual until authoritative asset evidence and an independent final owner are admitted."}'
new_owner = '{"id":"skin-assets","validators":["skin-static-assets-readonly"]}'
if old_owner not in owners:
    raise SystemExit('skin-assets owner anchor changed')
owners = owners.replace(old_owner, new_owner, 1)

# Keep retired paths only as tombstone routing so their deletion has an explicit owner.
route_anchor = '".github/workflows/project-doctor-authoritative-pages-deploy.yml","scripts/project-doctor-validate-authoritative-pages-hosted.mjs"'
route_replacement = '".github/workflows/project-doctor-authoritative-pages-deploy.yml","scripts/project-doctor-validate-authoritative-pages-hosted.mjs","scripts/project-doctor-compose-authoritative-pages-runtime.mjs",".github/workflows/authoritative-pages-deploy.yml","scripts/validate-authoritative-pages-hosted.mjs"'
if route_anchor not in owners:
    raise SystemExit('route-hosted owner anchor changed')
owners = owners.replace(route_anchor, route_replacement, 1)

skin_anchor = '"patterns":["data/generated/skin-stage3-*","data/validation/skin-stage3-*","data/contracts/skin-stage3-*","data/evidence/skin-stage3-*","scripts/*skin-stage3*",".github/workflows/skin-stage3-*"],'
skin_replacement = '"patterns":["public/images/skins/**","data/generated/skin-stage3-*","data/validation/skin-stage3-*","data/contracts/skin-stage3-*","data/evidence/skin-stage3-*","scripts/*skin-stage3*",".github/workflows/skin-stage3-*"],'
if skin_anchor not in owners:
    raise SystemExit('skin-assets path rule anchor changed')
owners = owners.replace(skin_anchor, skin_replacement, 1)

hero_anchor = '"patterns":["src/routes/heroes*.tsx","src/lib/hero-*.ts","src/lib/hero-*.tsx"],'
hero_replacement = '"patterns":["src/routes/heroes*.tsx","src/lib/hero-*.ts","src/lib/hero-*.tsx","src/lib/skin-detail.server.ts"],'
if hero_anchor not in owners:
    raise SystemExit('hero frontend path rule anchor changed')
owners = owners.replace(hero_anchor, hero_replacement, 1)
OWNERS.write_text(owners)

validators = VALIDATORS.read_text()
marker = '''    {\n      "id": "equipment-assets",'''
insertion = '''    {\n      "id": "skin-static-assets-readonly",\n      "phase": 30,\n      "executable": "node",\n      "args": ["scripts/validate-skin-stage3-5-static-assets-readonly.mjs"],\n      "owner": "skin-assets",\n      "coverage": "Read-only parity of the frozen Stage 3-5 Skin static manifest, 540 repository PNG bytes, Stage 2 relation, and frozen validation checkpoint."\n    },\n'''
if marker not in validators:
    raise SystemExit('validator catalog anchor changed')
validators = validators.replace(marker, insertion + marker, 1)
VALIDATORS.write_text(validators)

# The old self-test intentionally asserted MANUAL_REVIEW while skin-assets had no independent validator.
# After admitting the read-only owner validator, this exact regression fixture must become PLAN_READY.
self_test = PROJECT_CHECK_SELF_TEST.read_text()
old_fixture = '''const skinAsset = routeProjectCheckPaths(['data/evidence/skin-stage3-2-static-source-evidence.v1.json'], contracts);\nassert.equal(skinAsset.status, 'MANUAL_REVIEW');\nassert.deepEqual(skinAsset.files[0].owners, ['skin-assets']);\nassert.deepEqual(validatorIds(skinAsset), []);'''
new_fixture = '''const skinAsset = routeProjectCheckPaths(['data/evidence/skin-stage3-2-static-source-evidence.v1.json'], contracts);\nassert.equal(skinAsset.status, 'PLAN_READY');\nassert.deepEqual(skinAsset.files[0].owners, ['skin-assets']);\nassert.deepEqual(validatorIds(skinAsset), ['skin-static-assets-readonly']);'''
if old_fixture not in self_test:
    raise SystemExit('Project Check skin-assets regression fixture anchor changed')
self_test = self_test.replace(old_fixture, new_fixture, 1)
PROJECT_CHECK_SELF_TEST.write_text(self_test)

print('PASS_MATERIALIZE_CURRENT_TREE_PAGES_RUNTIME')