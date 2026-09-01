# Skin Stage 3-3 batched restart

status: IN_PROGRESS
scope: Skin static artwork extraction/export only
non-scope: Soldier, Hero↔Skin semantics, sourceOrder, acquisition semantics, frontend carousel implementation
current authority: current main Skin Stage 3-2 completion
historical evidence: work/skin-stage3-3-bulk-plan is reference-only and must not be promoted wholesale

## Execution policy

Do not validate/materialize all 540 Skins as one unit.

1. Freeze representative extraction rule from current Stage 3-2 evidence.
2. Run a small representative batch first.
3. Expand into deterministic bounded batches.
4. Validate each batch independently and checkpoint PASS/FAIL.
5. Aggregate only already-PASS batch manifests for final 540 coverage.
6. A failed batch blocks only that batch; previously PASS batches remain frozen.
7. No Hero↔Skin semantic recomputation, name JOIN, ID arithmetic, or filename-similarity fallback.

## Initial batch sizing

- Batch 0: representative proof only (Skin 102, 1901, 3701)
- Production batches: target 30 Skin records per batch, ordered by frozen Skin source order / canonical Skin ID as already materialized by the owning source.
- Expected production batch count for 540 records: 18

The exact production partition must be generated from the current authoritative Skin Stage 3-2/Stage 2 frozen consumer rather than handwritten IDs.

## Completion condition

- representative batch PASS
- every production batch PASS independently
- aggregate accepted Skin count = 540
- missing = 0
- duplicate Skin IDs = 0
- hash/path collision = 0
- aggregate is built only from PASS batch outputs

## Current blocker

Batch producer/validator needs to be adapted from the historical Stage 3-3 implementation to the current main Stage 3-2 authority without importing historical completion artifacts.

## Next start

Inspect the historical Stage 3-3 producer/validator interfaces and current Stage 3-2 output schema, then implement Batch 0 only.
