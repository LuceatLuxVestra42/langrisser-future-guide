import fs from 'node:fs';
import path from 'node:path';
import { buildProjectStatus } from './project-status-view.mjs';

export const DEFAULT_PROJECT_STATUS_WRITER_CONTRACT = 'tools/project-status/contracts/writer.v1.json';

const stableJson = value => `${JSON.stringify(value, null, 2)}\n`;
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));

function repositoryPath(repoRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid Project Status writer path: ${relativePath ?? 'missing'}`);
  }
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, relativePath);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Project Status writer path escapes repository: ${relativePath}`);
  }
  return absolute;
}

export function loadProjectStatusWriterContract({
  repoRoot = process.cwd(),
  contractPath = DEFAULT_PROJECT_STATUS_WRITER_CONTRACT,
} = {}) {
  const contract = readJson(repositoryPath(repoRoot, contractPath));
  if (contract?.schemaId !== 'project-status-writer/v1') {
    throw new Error(`Unsupported Project Status writer schema: ${contract?.schemaId ?? 'missing'}`);
  }
  if (!['CUTOVER_DEFERRED', 'ACTIVE'].includes(contract.state)) {
    throw new Error(`Unsupported Project Status writer state: ${contract.state ?? 'missing'}`);
  }
  if (contract.canonicalTargets?.json !== 'data/generated/project-status.v1.json'
    || contract.canonicalTargets?.markdown !== 'PROJECT_STATUS.md') {
    throw new Error('Project Status writer canonical targets changed unexpectedly.');
  }
  if (contract.policy?.sourceAuthority !== 'NEW_R1_STATUS_SOURCE'
    || contract.policy?.canonicalTargetWriteOnly !== true
    || contract.policy?.legacyProjectDoctorRuntimeDependency !== false
    || contract.policy?.legacyD1RuntimeDependency !== false
    || contract.policy?.legacyD5RuntimeDependency !== false
    || contract.policy?.statusSourceMutationAllowed !== false
    || contract.policy?.rawConfigDataReadAllowed !== false
    || contract.policy?.semanticRecomputationAllowed !== false
    || contract.policy?.canonicalJoinRecomputationAllowed !== false) {
    throw new Error('Project Status writer safety policy is not satisfied.');
  }
  return contract;
}

export function expectedProjectStatusOutputs({ repoRoot = process.cwd(), contract, build } = {}) {
  const writerContract = contract ?? loadProjectStatusWriterContract({ repoRoot });
  const buildFn = build ?? buildProjectStatus;
  const result = buildFn({ repoRoot });
  const projected = result?.projectStatus;
  if (projected?.schemaId !== 'project-status/v1' || projected?.readOnly !== true) {
    throw new Error('Project Status writer refuses unsupported R2 projection.');
  }
  if (projected.rawConfigDataReadCount !== 0
    || projected.semanticRecomputationCount !== 0
    || projected.canonicalJoinRecomputationCount !== 0) {
    throw new Error('Project Status writer refuses unsafe R2 projection.');
  }
  return {
    result,
    targets: [
      { path: writerContract.canonicalTargets.json, content: stableJson(projected) },
      { path: writerContract.canonicalTargets.markdown, content: result.markdown },
    ],
  };
}

export function writeProjectStatus(options = {}, runtime = {}) {
  const repoRoot = runtime.repoRoot ?? process.cwd();
  const contract = runtime.contract ?? loadProjectStatusWriterContract({
    repoRoot,
    contractPath: runtime.contractPath ?? DEFAULT_PROJECT_STATUS_WRITER_CONTRACT,
  });
  if (options.apply === true && contract.state !== 'ACTIVE') {
    throw new Error(`Project Status writer apply is disabled: ${contract.state}`);
  }
  if (options.requireActive === true && contract.state !== 'ACTIVE') {
    throw new Error(`Project Status writer is not active: ${contract.state}`);
  }

  const expected = expectedProjectStatusOutputs({ repoRoot, contract, build: runtime.build });
  const readText = runtime.readText ?? (relativePath => {
    const absolute = repositoryPath(repoRoot, relativePath);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  });
  const writeText = runtime.writeText ?? ((relativePath, content) => {
    const absolute = repositoryPath(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  });

  const changes = expected.targets.filter(target => readText(target.path) !== target.content);
  const summary = {
    version: 1,
    schemaId: 'project-status-writer-result/v1',
    status: options.apply ? 'PASS_PROJECT_STATUS_WRITER_APPLY' : 'PASS_PROJECT_STATUS_WRITER_CHECK',
    completion: 'COMPLETE',
    mode: options.apply ? 'APPLY' : 'CHECK',
    writerState: contract.state,
    writePerformed: false,
    changedTargetCount: changes.length,
    changedTargets: changes.map(target => target.path),
    canonicalTargets: expected.targets.map(target => target.path),
    boundaries: {
      projectStatusWriteCount: 0,
      statusSourceMutationCount: 0,
      legacyProjectDoctorRuntimeDependencyCount: 0,
      legacyD1RuntimeDependencyCount: 0,
      legacyD5RuntimeDependencyCount: 0,
      legacyGeneratedStatusReadCount: 0,
      rawConfigDataReadCount: 0,
      semanticRecomputationCount: 0,
      canonicalJoinRecomputationCount: 0,
      domainValidatorExecutionCount: 0
    }
  };

  if (options.apply !== true) return summary;
  for (const target of changes) writeText(target.path, target.content);
  summary.writePerformed = changes.length > 0;
  summary.boundaries.projectStatusWriteCount = changes.length;
  return summary;
}
