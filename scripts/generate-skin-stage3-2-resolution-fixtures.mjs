import fs from 'node:fs';

const INVENTORY = 'data/generated/skin-stage3-1-asset-inventory.v1.json';
const OUT = 'data/fixtures/skin-stage3-2-resolution-fixtures.v1.json';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const inventory = load(INVENTORY);
const records = Array.isArray(inventory.records) ? inventory.records : [];
if (records.length !== 540) throw new Error(`Expected 540 Stage 3-1 records, got ${records.length}`);

const metrics = row => {
  const bindings = Array.isArray(row.modelBindings) ? row.modelBindings : [];
  const ids = Array.isArray(row.modelResourceIds)
    ? row.modelResourceIds.map(Number)
    : [...new Set(bindings.map(x => Number(x.skinResourceId)))];
  const perResource = new Map();
  for (const b of bindings) {
    const id = Number(b.skinResourceId);
    perResource.set(id, (perResource.get(id) || 0) + 1);
  }
  return {
    modelResourceIds: ids,
    modelResourceCount: ids.length,
    modelBindingCount: bindings.length,
    maxBindingsForOneResource: Math.max(0, ...perResource.values())
  };
};

const decorated = records.map((row, sourceIndex) => ({ row, sourceIndex, m: metrics(row) }));
const single = decorated.filter(x => x.m.modelResourceCount === 1);
const minSingleBindings = Math.min(...single.map(x => x.m.modelBindingCount));
const maxResources = Math.max(...decorated.map(x => x.m.modelResourceCount));
const maxBindings = Math.max(...decorated.map(x => x.m.modelBindingCount));
const maxRepeated = Math.max(...decorated.map(x => x.m.maxBindingsForOneResource));

const roleSelections = [
  ['SIMPLE_SINGLE_RESOURCE_MIN_BINDINGS', single.find(x => x.m.modelBindingCount === minSingleBindings)],
  ['MAX_DISTINCT_MODEL_RESOURCES', decorated.find(x => x.m.modelResourceCount === maxResources)],
  ['MAX_TOTAL_MODEL_BINDINGS', decorated.find(x => x.m.modelBindingCount === maxBindings)],
  ['MAX_BINDINGS_PER_RESOURCE', decorated.find(x => x.m.maxBindingsForOneResource === maxRepeated)]
];
for (const [role, selected] of roleSelections) if (!selected) throw new Error(`Unable to select fixture role ${role}`);

const bySkin = new Map();
for (const [role, selected] of roleSelections) {
  const id = Number(selected.row.skinId);
  const entry = bySkin.get(id) || { selected, roles: [] };
  entry.roles.push(role);
  bySkin.set(id, entry);
}

const fixtures = [...bySkin.values()]
  .sort((a, b) => a.selected.sourceIndex - b.selected.sourceIndex)
  .map(({ selected, roles }) => ({
    skinId: Number(selected.row.skinId),
    heroId: Number(selected.row.heroId),
    sourceOrder: Number(selected.row.sourceOrder),
    sourceIndex: selected.sourceIndex,
    roles,
    static: { sourceImagePath: selected.row.static?.sourceImagePath ?? null },
    spine: { sourceSpinePath: selected.row.spine?.sourceSpinePath ?? null },
    modelBindings: selected.row.modelBindings ?? [],
    modelResourceIds: selected.m.modelResourceIds,
    metrics: {
      modelResourceCount: selected.m.modelResourceCount,
      modelBindingCount: selected.m.modelBindingCount,
      maxBindingsForOneResource: selected.m.maxBindingsForOneResource
    }
  }));

const result = {
  version: 1,
  stage: 'skin-page-3',
  substage: '3-2',
  status: 'GENERATED',
  purpose: 'Deterministic representative fixtures for proving static, Spine and model asset resolution before bulk extraction.',
  source: INVENTORY,
  selectionMetrics: {
    minBindingsAmongSingleResourceSkins: minSingleBindings,
    maxModelResourceIdsPerSkin: maxResources,
    maxModelBindingsPerSkin: maxBindings,
    maxBindingsPerModelResource: maxRepeated,
    roleCount: roleSelections.length,
    uniqueFixtureSkinCount: fixtures.length
  },
  roleSelections: Object.fromEntries(roleSelections.map(([role, x]) => [role, Number(x.row.skinId)])),
  fixtures
};

fs.mkdirSync('data/fixtures', { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
