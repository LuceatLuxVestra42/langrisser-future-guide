import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PATHS, buildStage5ScopeFreeze } from '../core/hygiene-stage5-scope-freeze-v1.mjs';

const REPO_ROOT = process.cwd();
const readJson = async repositoryPath => JSON.parse(await readFile(path.join(REPO_ROOT, repositoryPath), 'utf8'));
const readText = async repositoryPath => readFile(path.join(REPO_ROOT, repositoryPath), 'utf8');

try {
  const contract = await readJson(PATHS.contract);
  const stage4Summary = await readJson(PATHS.stage4Summary);
  const committedScope = await readJson(PATHS.scope);
  const committedCandidateReview = await readJson(PATHS.candidateReview);
  const committedSummary = await readJson(PATHS.summary);
  const committedCheckpoint = await readText(PATHS.checkpoint);
  const fresh = await buildStage5ScopeFreeze({ write: false });

  assert.deepEqual(committedScope, fresh.scope, 'committed destructive scope must be deterministic');
  assert.deepEqual(committedCandidateReview, fresh.candidateReview, 'committed candidate review must be deterministic');
  assert.deepEqual(committedSummary, fresh.summary, 'committed Stage 5-0 summary must be deterministic');
  assert.equal(committedCheckpoint, fresh.checkpoint, 'committed Stage 5-0 checkpoint must be deterministic');

  assert.equal(stage4Summary.status, 'PASS_WITH_REVIEW');
  assert.equal(stage4Summary.completion, 'COMPLETE');
  assert.equal(stage4Summary.freezeState, 'ASSET_HYGIENE_STAGE4_PRODUCTION_ADMISSION_FROZEN');
  assert.equal(stage4Summary.hardErrorCount, 0);
  assert.equal(stage4Summary.blockers.length, 0);

  assert.equal(committedSummary.status, contract.finalState.status);
  assert.equal(committedSummary.completion, contract.finalState.completion);
  assert.equal(committedSummary.freezeState, contract.finalState.freezeState);
  assert.equal(committedSummary.coverage.recordCount, contract.population.expectedRecordCount);
  assert.equal(committedSummary.coverage.assignedCount, contract.population.expectedRecordCount);
  assert.equal(committedSummary.coverage.unassignedCount, 0);
  assert.equal(committedSummary.coverage.unreferencedReviewCandidateCount, contract.population.expectedUnreferencedCount);
  assert.equal(committedSummary.coverage.deleteEligibleCount, 0);
  assert.equal(committedSummary.coverage.deleteApprovedCount, 0);
  assert.equal(committedSummary.hardErrorCount, 0);
  assert.equal(committedSummary.blockers.length, 0);

  assert.equal(committedCandidateReview.exactDuplicateGroupCount, contract.population.expectedExactDuplicateGroupCount);
  assert.equal(committedCandidateReview.deleteEligibleCount, 0);
  assert.equal(committedCandidateReview.deleteApprovedCount, 0);
  for (const group of committedCandidateReview.exactDuplicateGroups) {
    assert.equal(group.semanticIdentityProven, false);
    assert.equal(group.roleEquivalenceProven, false);
    assert.equal(group.ownerEquivalenceProven, false);
    assert.equal(group.deleteEligible, false);
    assert.equal(group.deleteApproved, false);
    assert.equal(group.nextAction, 'MANUAL_SEMANTIC_ROLE_OWNER_REVIEW');
  }

  for (const record of committedScope.records) {
    assert.equal(record.deleteEligible, false);
    assert.equal(record.deleteApproved, false);
    if (record.traits.activeProduction || record.traits.currentFrontendReference) {
      assert.equal(record.state, 'PROTECTED_CURRENT_USE');
    }
    if (record.state === 'REVIEW_CANDIDATE_UNREFERENCED') {
      assert.equal(record.primaryClass, 'UNREFERENCED');
      assert.equal(record.referenceCount, 0);
    }
  }

  for (const count of Object.values(committedSummary.forbiddenOperationCounts)) assert.equal(count, 0);

  process.stdout.write(`${JSON.stringify({
    status: 'PASS_ASSET_HYGIENE_STAGE5_DESTRUCTIVE_SCOPE_FREEZE',
    completion: committedSummary.completion,
    freezeState: committedSummary.freezeState,
    coverage: committedSummary.coverage,
    exactDuplicateReview: committedSummary.exactDuplicateReview,
    unreferencedByRoot: committedSummary.unreferencedByRoot,
    reviews: committedSummary.reviews,
    blockerCount: committedSummary.blockers.length,
  }, null, 2)}\n`);
} catch (error) {
  console.error(`[asset-hygiene-stage5-scope-validate] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 2;
}
