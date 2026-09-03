import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const P = {
  consumer: 'data/presentation/soldier-training-localization-frozen.v1.json',
  checkpoint: 'data/validation/soldier-training-localization-presentation.v1.json',
  b: 'data/presentation/soldier-training-material-name-kr.v1.json',
  c: 'data/presentation/soldier-training-tech-name-kr.v1.json',
  d: 'data/presentation/soldier-training-tech-common-passive-template-kr.v1.json',
  material: 'data/generated/soldier-training-material-iteminfo.v1.json',
  stat: 'data/generated/soldier-training-tech-common-stat-effect-extraction.v1.json',
  passive: 'data/generated/soldier-training-tech-common-passive-effect-extraction.v1.json',
};
const text = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(text(p));
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = (v) => [...v].map(Number).sort((a, b) => a - b);
const okText = (v) => typeof v === 'string' && v.trim().length > 0;
const blobSha = (s) => crypto.createHash('sha1')
  .update(Buffer.from(`blob ${Buffer.byteLength(s, 'utf8')}\0`, 'utf8'))
  .update(s, 'utf8').digest('hex');

function index(rows, key) {
  const map = new Map(), dup = [];
  for (const row of rows) {
    const id = Number(row?.[key]);
    if (!Number.isInteger(id)) continue;
    if (map.has(id)) dup.push(id); else map.set(id, row);
  }
  return { map, dup: ids(dup) };
}
function placeholders(s, wrapped = false) {
  const out = [], re = wrapped
    ? /<color=#DC143C>\{(P\d+)\}<\/color>/g
    : /\{(P\d+)\}/g;
  let m; while ((m = re.exec(s ?? ''))) out.push(m[1]);
  return out;
}
function numericLeak(s) {
  return /\d/.test(String(s ?? '')
    .replace(/<color=#DC143C>\{P\d+\}<\/color>/g, '')
    .replace(/<[^>]*>/g, ''));
}
function forbidden(value) {
  const bad = new Set(['levelValueRows','values','valueSequenceCatalog','parameterSequenceCatalog','templateRichTextRaw','effects']);
  const found = [];
  const walk = (v, p = '') => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const q = p ? `${p}.${k}` : k;
      if (bad.has(k)) found.push(q);
      walk(x, q);
    }
  };
  walk(value);
  return found;
}
function load() {
  const raw = Object.fromEntries(Object.entries(P)
    .filter(([k]) => k !== 'checkpoint')
    .map(([k, p]) => [k, text(p)]));
  return {
    consumer: JSON.parse(raw.consumer), checkpoint: json(P.checkpoint),
    b: JSON.parse(raw.b), c: JSON.parse(raw.c), d: JSON.parse(raw.d),
    material: JSON.parse(raw.material), stat: JSON.parse(raw.stat), passive: JSON.parse(raw.passive),
    raw,
  };
}

function evaluate(x) {
  const e = [];
  const br = Array.isArray(x.b.records) ? x.b.records : [];
  const cr = Array.isArray(x.c.records) ? x.c.records : [];
  const dr = Array.isArray(x.d.records) ? x.d.records : [];
  const mr = Array.isArray(x.material.items) ? x.material.items : [];
  const pr = Array.isArray(x.passive.records) ? x.passive.records : [];
  const bi = index(br, 'itemId'), mi = index(mr, 'itemId'), ci = index(cr, 'techId'),
    di = index(dr, 'techId'), pi = index(pr, 'techId');

  const materialIds = ids(bi.map.keys()), materialAuthorityIds = ids(mi.map.keys());
  const statRaw = (x.stat.valueSequenceCatalog ?? []).flatMap((s) => s.techIds ?? []);
  const statIds = ids(new Set(statRaw)), passiveIds = ids(pi.map.keys());
  const visibleIds = ids(new Set([...statIds, ...passiveIds]));
  const techIds = ids(ci.map.keys()), dIds = ids(di.map.keys());

  const materialNameMismatch = materialIds.filter((id) => bi.map.get(id)?.nameCn !== mi.map.get(id)?.name);
  const kindMismatch = techIds.filter((id) => ci.map.get(id)?.kind !==
    (statIds.includes(id) ? 'COMMON_STAT' : passiveIds.includes(id) ? 'COMMON_PASSIVE' : null));
  const dNameMismatch = dIds.filter((id) => di.map.get(id)?.displayNameKr !== ci.map.get(id)?.displayNameKr);
  const dStatusMismatch = dIds.filter((id) => di.map.get(id)?.stageCNameStatus !== ci.map.get(id)?.status);
  const seqMismatch = dIds.filter((id) => di.map.get(id)?.parameterSequenceId !== pi.map.get(id)?.parameterSequenceId);
  const placeholderMismatch = dIds.filter((id) => {
    const expected = placeholders(pi.map.get(id)?.templateRichTextRaw, true);
    const row = di.map.get(id);
    return !same(expected, row?.placeholderOrder ?? []) ||
      !same(expected, placeholders(row?.templateRichTextKr, true)) ||
      !same(expected, placeholders(row?.templateRichTextKr, false));
  });
  const numericLeaks = dIds.filter((id) => numericLeak(di.map.get(id)?.templateRichTextKr));
  const blanks = br.filter((r) => !okText(r.displayNameKr)).length +
    cr.filter((r) => !okText(r.displayNameKr)).length +
    dr.filter((r) => !okText(r.templateRichTextKr)).length;
  const dup = bi.dup.length + mi.dup.length + ci.dup.length + di.dup.length + pi.dup.length;

  const sources = [
    ['b', x.consumer.presentationSources?.materialNames],
    ['c', x.consumer.presentationSources?.techNames],
    ['d', x.consumer.presentationSources?.passiveTemplates],
    ['material', x.consumer.semanticAuthorities?.materials],
    ['stat', x.consumer.semanticAuthorities?.commonStat],
    ['passive', x.consumer.semanticAuthorities?.commonPassive],
  ];
  const blobMismatch = sources.filter(([k, s]) => !x.raw?.[k] || s?.gitBlobSha !== blobSha(x.raw[k])).map(([k]) => k);

  const bConfirmed = br.filter((r) => r.status === 'project-display-confirmed').length;
  const cConfirmed = cr.filter((r) => r.status === 'project-display-confirmed').length;
  const cProvisional = cr.filter((r) => r.status === 'provisional-display').length;
  const seqCount = new Set(pr.map((r) => r.parameterSequenceId)).size;
  const forbiddenKeys = forbidden(x.consumer);

  if (x.b.schemaId !== 'soldier-training-material-name-kr-presentation/v1' || x.b.status !== 'PASS' || x.b.completion !== 'COMPLETE') e.push('B_NOT_ADMITTED');
  if (x.c.schemaId !== 'soldier-training-tech-name-kr-presentation/v1' || x.c.status !== 'PASS' || x.c.completion !== 'COMPLETE') e.push('C_NOT_ADMITTED');
  if (x.d.schemaId !== 'soldier-training-tech-common-passive-template-kr-presentation/v1' || x.d.status !== 'PASS' || x.d.completion !== 'COMPLETE') e.push('D_NOT_ADMITTED');
  if (x.material.schemaId !== 'soldier-training-material-iteminfo/v1' || x.material.status !== 'PASS') e.push('MATERIAL_AUTHORITY_NOT_PASS');
  if (x.stat.status !== 'PASS' || x.stat.completion !== 'COMPLETE' || x.stat.freezeState !== 'TRAINING_TECH_COMMON_STAT_EFFECT_EXTRACTION_FROZEN') e.push('STAT_AUTHORITY_NOT_FROZEN');
  if (x.passive.status !== 'PASS' || x.passive.completion !== 'COMPLETE' || x.passive.freezeState !== 'TRAINING_TECH_COMMON_PASSIVE_EFFECT_EXTRACTION_FROZEN') e.push('PASSIVE_AUTHORITY_NOT_FROZEN');

  if (dup) e.push('DUPLICATE_ID');
  if (!same(materialIds, materialAuthorityIds)) e.push('MATERIAL_ID_SET_MISMATCH');
  if (materialNameMismatch.length) e.push(`MATERIAL_CN_NAME_MISMATCH:${materialNameMismatch.join(',')}`);
  if (statRaw.length !== statIds.length) e.push('STAT_MEMBERSHIP_DUPLICATE');
  if (statIds.some((id) => pi.map.has(id))) e.push('STAT_PASSIVE_OVERLAP');
  if (statIds.length !== 84 || passiveIds.length !== 46 || visibleIds.length !== 130) e.push('TECH_AUTHORITY_POPULATION_MISMATCH');
  if (!same(techIds, visibleIds)) e.push('TECH_ID_SET_MISMATCH');
  if (kindMismatch.length) e.push(`TECH_KIND_MISMATCH:${kindMismatch.join(',')}`);
  if (!same(dIds, passiveIds)) e.push('D_ID_SET_MISMATCH');
  if (dNameMismatch.length) e.push(`D_NAME_MISMATCH:${dNameMismatch.join(',')}`);
  if (dStatusMismatch.length) e.push(`D_STATUS_MISMATCH:${dStatusMismatch.join(',')}`);
  if (seqMismatch.length) e.push(`D_SEQUENCE_MISMATCH:${seqMismatch.join(',')}`);
  if (placeholderMismatch.length) e.push(`D_PLACEHOLDER_MISMATCH:${placeholderMismatch.join(',')}`);
  if (numericLeaks.length) e.push(`D_NUMERIC_LITERAL_LEAK:${numericLeaks.join(',')}`);
  if (blanks) e.push('BLANK_PRESENTATION_VALUE');
  if (blobMismatch.length) e.push(`PINNED_BLOB_MISMATCH:${blobMismatch.join(',')}`);
  if (br.length !== 24 || bConfirmed !== 24) e.push('B_COVERAGE_MISMATCH');
  if (cr.length !== 130 || cConfirmed !== 85 || cProvisional !== 45) e.push('C_COVERAGE_MISMATCH');
  if (dr.length !== 46 || seqCount !== 14) e.push('D_COVERAGE_MISMATCH');
  if (forbiddenKeys.length) e.push(`CONSUMER_SEMANTIC_PAYLOAD:${forbiddenKeys.join(',')}`);

  const coverage = {
    materialRecordCount:24, materialProjectDisplayConfirmedCount:24, techRecordCount:130,
    commonStatTechCount:84, commonPassiveTechCount:46, techProjectDisplayConfirmedCount:85,
    techProvisionalDisplayCount:45, passiveTemplateRecordCount:46, passiveParameterSequenceCount:14,
    blankPresentationValueCount:0, duplicateIdCount:0,
  };
  const population = { materialItemIds:materialIds, commonStatTechIds:statIds, commonPassiveTechIds:passiveIds, visibleTechIds:visibleIds };
  if (x.consumer.schemaId !== 'soldier-training-localization-frozen-presentation/v1' ||
      x.consumer.status !== 'PASS' || x.consumer.completion !== 'COMPLETE' ||
      x.consumer.freezeState !== 'SOLDIER_TRAINING_LOCALIZATION_PRESENTATION_FROZEN') e.push('CONSUMER_CONTRACT_MISMATCH');
  if (!same(x.consumer.coverage, coverage)) e.push('CONSUMER_COVERAGE_MISMATCH');
  if (!same(x.consumer.population, population)) e.push('CONSUMER_POPULATION_MISMATCH');
  const p = x.consumer.admissionPolicy ?? {};
  if (p.presentationOnly !== true || p.componentSelectionByPinnedBlobIdentity !== true ||
      p.exactNumericIdEqualityOnly !== true || p.nameJoin !== false || p.idArithmetic !== false ||
      p.screenOrderBinding !== false || p.sourceOrderBinding !== false || p.semanticRecomputation !== false ||
      p.semanticLevelValuesCopied !== false || p.presentationPayloadMode !== 'PINNED_COMPONENT_REFERENCES') e.push('CONSUMER_POLICY_MISMATCH');

  const summary = {
    materialRecordCount:br.length, materialAuthorityRecordCount:mr.length,
    materialProjectDisplayConfirmedCount:bConfirmed, materialIdSetMatch:same(materialIds, materialAuthorityIds),
    materialSourceNameMismatchCount:materialNameMismatch.length, techRecordCount:cr.length,
    commonStatTechCount:statIds.length, commonPassiveTechCount:passiveIds.length, visibleTechCount:visibleIds.length,
    techIdSetMatch:same(techIds, visibleIds), techKindMismatchCount:kindMismatch.length,
    techProjectDisplayConfirmedCount:cConfirmed, techProvisionalDisplayCount:cProvisional,
    passiveTemplateRecordCount:dr.length, passiveTemplateIdSetMatch:same(dIds, passiveIds),
    passiveDisplayNameMismatchCount:dNameMismatch.length, passiveNameStatusMismatchCount:dStatusMismatch.length,
    passiveParameterSequenceMismatchCount:seqMismatch.length, passiveParameterSequenceCount:seqCount,
    placeholderParityFailureCount:placeholderMismatch.length, numericLiteralLeakCount:numericLeaks.length,
    blankPresentationValueCount:blanks, duplicateIdCount:dup, pinnedSourceBlobMismatchCount:blobMismatch.length,
    consumerForbiddenSemanticPayloadKeyCount:forbiddenKeys.length,
  };
  if (!same(x.checkpoint?.expected, summary)) e.push('CHECKPOINT_EXPECTED_MISMATCH');
  if (!same(x.checkpoint?.population, population)) e.push('CHECKPOINT_POPULATION_MISMATCH');
  if (x.checkpoint?.consumer?.path !== P.consumer || x.checkpoint?.consumer?.gitBlobSha !== blobSha(x.raw.consumer) ||
      x.checkpoint?.consumer?.requiredFreezeState !== 'SOLDIER_TRAINING_LOCALIZATION_PRESENTATION_FROZEN') e.push('CHECKPOINT_CONSUMER_IDENTITY_MISMATCH');
  const m = x.checkpoint?.method ?? {};
  if (x.checkpoint?.schemaId !== 'soldier-training-localization-presentation-validation/v1' ||
      x.checkpoint?.stage !== 'E' || x.checkpoint?.status !== 'PASS' || x.checkpoint?.completion !== 'COMPLETE' ||
      m.materialJoinKey !== 'itemId' || m.techJoinKey !== 'techId' || m.exactNumericIdEqualityOnly !== true ||
      m.nameJoin !== false || m.idArithmetic !== false || m.semanticRecomputation !== false || m.semanticValueCopy !== false ||
      x.checkpoint?.nextOwner !== 'soldier-frontend') e.push('CHECKPOINT_CONTRACT_MISMATCH');

  return { status:e.length ? 'FAIL' : 'PASS', summary, errors:e };
}

function selfTest() {
  const base = load(), tests = [];
  const t = (name, mutate, code) => {
    const x = clone(base); mutate(x); const r = evaluate(x);
    tests.push({ name, passed:r.status === 'FAIL' && r.errors.some((e) => e.startsWith(code)) });
  };
  tests.push({ name:'current-source-pass', passed:evaluate(base).status === 'PASS' });
  t('missing-material-fails-closed', x => x.b.records.shift(), 'MATERIAL_ID_SET_MISMATCH');
  t('tech-kind-drift-fails-closed', x => x.c.records.find(r => r.kind === 'COMMON_STAT').kind='COMMON_PASSIVE', 'TECH_KIND_MISMATCH');
  t('d-name-drift-fails-closed', x => x.d.records[0].displayNameKr+='x', 'D_NAME_MISMATCH');
  t('placeholder-drift-fails-closed', x => x.d.records.find(r => r.placeholderOrder.length===2).placeholderOrder=['P1','P0'], 'D_PLACEHOLDER_MISMATCH');
  t('semantic-payload-copy-fails-closed', x => x.consumer.levelValueRows=[[1]], 'CONSUMER_SEMANTIC_PAYLOAD');
  const failed = tests.filter(x => !x.passed);
  console.log(JSON.stringify({ status:failed.length?'FAIL':'PASS', tests }, null, 2));
  if (failed.length) process.exit(1);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const result = evaluate(load());
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exit(1);
}
