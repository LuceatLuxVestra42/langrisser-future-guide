import fs from 'node:fs';

const generatorPath = 'tools/evidence-lifecycle/cli/c2-reference-graph.mjs';
const contractPath = 'tools/evidence-lifecycle/contracts/c2-reference-graph.v1.json';

let source = fs.readFileSync(generatorPath, 'utf8');

const oldLocator = `  if (exact.has(terminal)) return true;\n  if (terminal !== 'path') return false;\n  const ancestors = tokens.slice(0, -1).join('.');\n  return /(predecessor|provenance|source|input|manifest|artifact|validation|checkpoint|contract|supplemental|consumer|authority|producer|output|generated)/.test(ancestors);`;
const newLocator = `  if (exact.has(terminal)) return true;\n  if (/(?:source|artifact|manifest|predecessor|input|validation|checkpoint|contract|consumer|authority|output|generated)[a-z0-9_-]*paths?$/.test(terminal)) return true;\n  if (terminal !== 'path') return false;\n  const ancestors = tokens.slice(0, -1).join('.');\n  return /(predecessor|provenance|source|input|manifest|artifact|validation|checkpoint|contract|supplemental|consumer|authority|producer|output|generated)/.test(ancestors);`;
if (!source.includes(oldLocator)) throw new Error('Expected structured locator block not found.');
source = source.replace(oldLocator, newLocator);

const validatorProtect = `  if (has('REGISTERED_PROJECT_CHECK_VALIDATOR_ENTRYPOINT')) {\n    return { edgeType: 'VALIDATOR_INPUT_REF', retentionClass: 'PROTECTING', sourceClasses: classes };\n  }`;
const validatorRefined = `  if (sourcePath === 'tools/project-check/test/project-check-self-test.mjs') {\n    return { edgeType: 'VALIDATOR_ROUTING_FIXTURE', retentionClass: 'INFORMATIONAL', sourceClasses: classes };\n  }\n  if (has('REGISTERED_PROJECT_CHECK_VALIDATOR_ENTRYPOINT')) {\n    return { edgeType: 'VALIDATOR_INPUT_REF', retentionClass: 'PROTECTING', sourceClasses: classes };\n  }`;
if (!source.includes(validatorProtect)) throw new Error('Expected validator protection block not found.');
source = source.replace(validatorProtect, validatorRefined);

fs.writeFileSync(generatorPath, source);

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
if (!contract.edgeSchema.informationalEdgeTypes.includes('VALIDATOR_ROUTING_FIXTURE')) {
  contract.edgeSchema.informationalEdgeTypes.push('VALIDATOR_ROUTING_FIXTURE');
}
contract.protectingSourcePolicy.registeredValidatorEntrypoint = 'Registered validator entrypoints protect exact admitted-node paths only when the mention represents validator input/dependency use. A path used solely as a routing/example fixture does not become retention-protecting.';
contract.protectingSourcePolicy.validatorRoutingFixtureException = {
  sourcePath: 'tools/project-check/test/project-check-self-test.mjs',
  retentionClass: 'INFORMATIONAL',
  edgeType: 'VALIDATOR_ROUTING_FIXTURE',
  basis: 'The frozen baseline self-test passes these literal paths to expectOwners/routeProjectCheckPaths to test routing; it does not require the referenced artifact contents as validator inputs.'
};
contract.protectingSourcePolicy.semanticPathLocatorRule = 'Structured protection recognizes explicit path/path(s) keys and semantic *SourcePath/*ManifestPath/*ValidationPath/*CheckpointPath/*ContractPath/*PredecessorPath/*InputPath/*ArtifactPath/*ConsumerPath/*AuthorityPath/*OutputPath/*GeneratedPath-style keys, including prefixed keys such as a5ManifestPath beneath predecessor objects.';
contract.informationalPolicy.routingFixtureMentionProtects = false;
fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2) + '\n');

console.log('C2 validator-fixture and semantic-path locator policy refined.');
