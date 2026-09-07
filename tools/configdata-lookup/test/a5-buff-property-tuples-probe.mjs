import { readSourceRecordByLocator } from '../lib/bounded-source-record.mjs';

const source = 'data/configdata/ConfigDataBuffInfo.json';
const sourceSha256 = 'ce84692846e4306dc15270ad959d9a258b5e599df5aaef352bc35992f5095225';
const containerPath = '$';
const targets = [
  ['70009', 32406],
  ['70069', 32466],
  ['70088', 32485],
  ['70089', 32486],
  ['70099', 32496],
  ['70109', 32506],
];

const records = [];
for (const [id, recordIndex] of targets) {
  const result = await readSourceRecordByLocator({
    locator: { source, sourceSha256, containerPath, recordIndex },
    expectedId: id,
    primaryKey: 'ID',
  });
  const tuples = [];
  for (let n = 1; n <= 16; n += 1) {
    const propertyIdKey = `Property${n}_ID`;
    const propertyValueKey = `Property${n}_Value`;
    if (!(propertyIdKey in result.record) && !(propertyValueKey in result.record)) continue;
    const propertyId = result.record[propertyIdKey];
    const propertyValue = result.record[propertyValueKey];
    const idNonzero = propertyId !== 0 && propertyId !== '0' && propertyId != null && propertyId !== '';
    const valueNonzero = propertyValue !== 0 && propertyValue !== '0' && propertyValue != null && propertyValue !== '';
    if (!idNonzero && !valueNonzero) continue;
    tuples.push({ slot: n, propertyId, propertyValue });
  }
  records.push({ id, recordIndex, tuples });
}

console.log(JSON.stringify({
  status: 'PASS',
  checkpoint: 'A5_BUFF_PROPERTY_TUPLES_PROBE',
  source,
  sourceSha256,
  containerPath,
  records,
  boundaries: {
    exactLocatorCount: targets.length,
    propertySlotsChecked: 'Property1..Property16 only when fields exist',
    nonzeroFilter: true,
    semanticInterpretation: false,
    nameJoin: false,
    idArithmetic: false,
  },
}, null, 2));
