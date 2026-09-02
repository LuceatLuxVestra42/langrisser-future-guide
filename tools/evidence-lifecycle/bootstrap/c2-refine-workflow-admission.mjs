import fs from 'node:fs';

const generatorPath = 'tools/evidence-lifecycle/cli/c2-reference-graph.mjs';
const contractPath = 'tools/evidence-lifecycle/contracts/c2-reference-graph.v1.json';

let source = fs.readFileSync(generatorPath, 'utf8');

const oldContextBlock = `  const workflowPaths = new Set(tree.map(entry => entry.path).filter(p => /^\\.github\\/workflows\\/[^/]+\\.ya?ml$/.test(p)));
  const productionConsumerPaths = new Set(tree.map(entry => entry.path).filter(p => /^(?:src|app|pages)\\//.test(p)));
  const manifestPaths = new Set(admittedRecords.filter(record => record.scopeAdmissionRole === 'MANIFEST').map(record => record.path));
  const retentionDeclarationPaths = new Set(admittedRecords.filter(record => record.scopeAdmissionRole === 'RETENTION_DECLARATION').map(record => record.path));
`;

const newContextBlock = `  const trackedWorkflowPaths = new Set(tree.map(entry => entry.path).filter(p => /^\\.github\\/workflows\\/[^/]+\\.ya?ml$/.test(p)));
  const productionConsumerPaths = new Set(tree.map(entry => entry.path).filter(p => /^(?:src|app|pages)\\//.test(p)));
  const manifestPaths = new Set(admittedRecords.filter(record => record.scopeAdmissionRole === 'MANIFEST').map(record => record.path));
  const retentionDeclarationPaths = new Set(admittedRecords.filter(record => record.scopeAdmissionRole === 'RETENTION_DECLARATION').map(record => record.path));
  const explicitActiveWorkflowPaths = new Set();
  const addExplicitActiveWorkflow = value => {
    const candidate = normalize(value);
    if (trackedWorkflowPaths.has(candidate)) explicitActiveWorkflowPaths.add(candidate);
  };

  const statusSourceLifecyclePath = 'tools/status-source/contracts/lifecycle.v1.json';
  if (treeMap.has(statusSourceLifecyclePath)) {
    const lifecycle = readJsonAt(baseline, statusSourceLifecyclePath);
    const transport = lifecycle?.policy?.transport ?? {};
    if (transport.productionWriterActivation === 'ACTIVE') addExplicitActiveWorkflow(transport.productionWriterWorkflow);
    if (transport.legacyWriterActive === true) addExplicitActiveWorkflow(transport.legacyWriterWorkflow);
    for (const pipeline of lifecycle?.pipelines ?? []) addExplicitActiveWorkflow(pipeline?.completionWorkflow);
  }

  for (const declarationPath of retentionDeclarationPaths) {
    try {
      const declaration = readJsonAt(baseline, declarationPath);
      if (declaration?.state === 'APPROVED_FOR_HANDOFF') addExplicitActiveWorkflow(declaration.requestedByWorkflow);
    } catch {
      // C2 critical JSON handling below will fail closed if this source is operationally relevant.
    }
  }
`;

if (!source.includes(oldContextBlock)) throw new Error('Expected workflow context block not found.');
source = source.replace(oldContextBlock, newContextBlock);

source = source.replace(
  `    workflowPaths,\n    productionConsumerPaths,`,
  `    trackedWorkflowPaths,\n    explicitActiveWorkflowPaths,\n    productionConsumerPaths,`,
);
source = source.replace(
  `  if (context.workflowPaths.has(sourcePath)) classes.push('ACTIVE_WORKFLOW');`,
  `  if (context.explicitActiveWorkflowPaths.has(sourcePath)) classes.push('ACTIVE_WORKFLOW');`,
);
source = source.replace(
  `      activeWorkflowCount: context.workflowPaths.size,`,
  `      trackedWorkflowCount: context.trackedWorkflowPaths.size,\n      activeWorkflowCount: context.explicitActiveWorkflowPaths.size,`,
);
source = source.replace(
  `    activeWorkflowBlobs: [...context.workflowPaths].sort().map(p => [p, context.treeMap.get(p)?.blobSha ?? null]),`,
  `    activeWorkflowBlobs: [...context.explicitActiveWorkflowPaths].sort().map(p => [p, context.treeMap.get(p)?.blobSha ?? null]),`,
);

for (const forbidden of ['context.workflowPaths', 'workflowPaths,']) {
  if (source.includes(forbidden)) throw new Error(`Stale workflow admission token remains: ${forbidden}`);
}

fs.writeFileSync(generatorPath, source);

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
contract.protectingSourcePolicy.activeWorkflow = 'A workflow protects exact admitted-node references only when current authority explicitly admits that workflow as active. C2 currently derives this from the frozen Status Source lifecycle transport/pipeline fields and retained APPROVED_FOR_HANDOFF producer declarations. Mere tracked workflow existence is not active-workflow authority.';
contract.protectingSourcePolicy.trackedWorkflowExistenceProtects = false;
contract.protectingSourcePolicy.activeWorkflowAdmissionSources = [
  'tools/status-source/contracts/lifecycle.v1.json policy.transport when activation/active flags permit',
  'tools/status-source/contracts/lifecycle.v1.json pipelines[].completionWorkflow',
  'C1 RETENTION_DECLARATION nodes with state=APPROVED_FOR_HANDOFF and requestedByWorkflow',
];
contract.informationalPolicy.unadmittedTrackedWorkflowMentionProtects = false;
contract.freshness.refreshWhen = [
  ...contract.freshness.refreshWhen,
  'Explicit current-workflow admission fields in Status Source lifecycle/declarations change.',
];
fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2) + '\n');

console.log('C2 workflow admission refined to explicit current-authority sources.');
