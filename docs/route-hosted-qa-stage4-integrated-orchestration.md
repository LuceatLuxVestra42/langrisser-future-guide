# Route/Hosted QA Stage 4 — Integrated Orchestration

QA-4 does not add a new semantic or presentation contract. It integrates the already frozen Route/Hosted QA gates into one ordered runtime proof while preserving each owning layer.

## Ordered execution

1. QA-0 through QA-4 deterministic contract validation
2. QA-1 strict Hosted Gate until 3 consecutive PASS results
3. QA-2 Chromium Browser/UI predecessor proof
4. QA-3 Chromium navigation/history/console proof
5. One machine-readable QA-4 summary

## Strict invocation

```bash
node scripts/run-project-doctor-route-hosted-qa-stage4.mjs \
  --expected-sha <deployed-source-sha> \
  --output route-hosted-qa-stage4-summary.json
```

The candidate must already be built and deployed to the configured GitHub Pages base, and Chromium must be installed before the runtime command is invoked. The QA-4 GitHub Actions workflow performs those prerequisites in order.

## Failure ownership

- deterministic/preflight failure: `PREFLIGHT_FAIL`
- QA-1/deployment failure: `DEPLOYMENT_HOSTING_FAIL`
- QA-2 or QA-3 interaction failure: `BROWSER_UI_FAIL`

None of these failures may reopen canonical or ConfigData semantics without independent semantic evidence.

## Result policy

- QA-2 `unexpected > 0`: blocking Browser/UI failure
- QA-2 `flaky > 0`: non-blocking REVIEW recorded in the integrated summary
- QA-3 `unexpected > 0`: blocking Browser/UI failure
- QA-3 `flaky > 0`: blocking Browser/UI failure

## Frozen proof

- proof head: `70826ba8ed9371d1dddf7379706e2e5ec653f740`
- workflow run: `33233254559`
- artifact: `9709155755`
- artifact digest: `sha256:eab05aa800dc02a668e7f7e065c4cd610bb756fbbf3ee9f83bdafaf18317c291`
- Hosted: 3/3 consecutive PASS
- QA-2: expected 5, unexpected 0, flaky 0
- QA-3: expected 4, unexpected 0, flaky 0
- integrated REVIEW: 0

The Stage 4 checkpoint is `data/generated/project-doctor-route-hosted-qa-stage4-checkpoint.v1.json`.
