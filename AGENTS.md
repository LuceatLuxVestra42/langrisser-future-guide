# Project Working Rules

This repository contains the production website for the Langrisser future guide project.

## Work entry and authority

Before changing the repository, establish the current baseline and authority chain.

1. Confirm the current branch/ref, HEAD, and existing diff or changed paths.
2. Read the current Status Source-selected authority.
3. Read `PROJECT_STATUS.md` only as a read-only projection of that authority.
4. Read the current Project Check contract to understand changed-path owner/validator routing.
5. Read the actual owning domain source, contract, checkpoint, manifest, validator, and frozen/generated consumer needed for the task.

Repository authority takes precedence over conversational plans, old checkpoints, historical outputs, and accepted implementation predecessors when they conflict.

An accepted predecessor from planning or a previous work unit may define the implementation starting point, but it is not automatically a repository authoritative source. Reuse it without reopening completed design work unless the current repository authority contradicts it.

Do not use retired Project Doctor runtime, D-stage artifacts, generated registries, or legacy orchestration as the normal predecessor or work-entry point. Historical Doctor material may explain completed migration history, but it must not be reactivated merely to rediscover the current authority chain.

## Scope, ownership, and completion

Before implementation, define the smallest work unit that can complete the requested purpose. Record, when relevant:

- purpose;
- in-scope changed paths or artifacts;
- explicit non-scope;
- owning layer;
- completion condition;
- actual blockers;
- non-blocking review items.

Prefer one purpose and one clear completion condition per work unit. Separate structural research, semantic validation, implementation, bulk application, regression validation, asset/localization work, hosted QA, and browser/UI QA when they have different owners or completion gates.

When the current owner has satisfied its completion condition and the remaining work belongs to another layer, stop extending the current investigation. Record an owner handoff with the completed result, direct evidence, remaining BLOCKER/REVIEW items, the next owner, and the next starting point.

## Completed upstream and semantic boundaries

Do not reopen `FINAL_FROZEN`, `PASS`, `PASS_ACCEPTED`, `COMPLETE`, or otherwise closed upstream work unless one of these conditions is present:

- the authoritative source snapshot changed;
- canonical population or identity changed;
- a relation/schema contract changed;
- authoritative relation or consumer parity is actually broken;
- a hard owning validator fails for the current source;
- direct evidence contradicts the frozen result.

Presentation, localization, asset delivery, frontend, hosting, or browser/UI problems do not by themselves reopen canonical identity, population, relation, JOIN, or game-rule semantics.

Production frontend code must consume approved frozen/generated consumers. Do not add raw ConfigData runtime fallbacks, historical-output silent fallbacks, frontend-owned semantic JOINs, name JOINs, ID arithmetic, filename-similarity mapping, screen-order mapping, or arbitrary relation patches.

## Project Status and Project Check

`PROJECT_STATUS.md` is a read-only projection. It is not a semantic source and must not be used to recompute canonical meaning.

Use Project Check in two distinct phases:

- **Before implementation:** inspect the Project Check contract and its orchestration boundary.
- **After implementation:** run or inspect the changed-path plan for the actual changed paths.

Project Check is limited to:

```text
changed path
→ explicit owner
→ independent validator
→ PASS / REVIEW / BLOCKER
```

It must not perform owner propagation, broad change-class fan-out, filename-similarity inference, name JOIN, ID arithmetic, raw-source semantic reinterpretation, semantic recomputation, or canonical relation recomputation.

If a changed path has no explicit owner rule, keep it as `MANUAL_REVIEW`; do not guess an owner. If an owning validator fails, pass that failure through as a blocker rather than reinterpreting it. If validation leaves unintended tracked repository mutation, fail closed.

## Data and evidence handling

Do not guess mappings between game IDs, filenames, characters, skills, equipment, soldiers, or other game data when the relationship is uncertain.

For completed domains, prefer current authoritative frozen/generated consumers and owning validation/checkpoint artifacts. Use ConfigData Lookup as a read-only locator/index layer. Inspect raw ConfigData only for the records or fields actually needed to resolve a new or genuinely unresolved semantic question.

Explicit fields and verified ID/JOIN relationships take precedence over numeric patterns, filenames, sort order, screen order, or name similarity.

When reference sources disagree, report and classify the discrepancy instead of silently choosing one value. External sites, Google Sheets, Google Drive, and other source repositories are useful for release, localization, asset provenance, presentation, and cross-validation, but they do not automatically replace project canonical authority.

Treat source/reference materials outside this repository as read-only unless the user explicitly asks to modify them. Do not modify, move, rename, or delete files in external Google Drive folders or other source repositories without explicit user approval.

Keep original/source assets separate from final website assets. Copy and transform source material rather than overwriting the original whenever possible. Preserve useful original identifiers such as internal English names or IDs when creating normalized website data, when available.

## Retrieval and context discipline

Keep repository retrieval narrow so long-running work does not accumulate unnecessary context. Use the smallest evidence surface that can reliably answer the current question.

Default retrieval order:

1. reuse already-established evidence when the relevant authority, source/SHA, failure signature, and question have not materially changed;
2. search or locate the relevant owner, artifact, path, symbol, record, or failure before broad retrieval;
3. fetch only the relevant file, range, record, patch, step, or equivalent targeted evidence;
4. expand to directly related evidence one level at a time only when the current evidence is insufficient;
5. use full-tree, full-diff, full-log, large-blob, or similarly broad retrieval only when narrower evidence cannot establish the result.

Use the first 1–3 primary files or artifacts as a soft initial investigation budget when practical. This is not a hard limit.

For pull requests and repository changes:

- inspect changed paths or filenames before requesting a full diff;
- prefer relevant per-file patches or targeted ranges when sufficient;
- do not fetch the full PR diff by default;
- use a full diff when whole-scope or cross-file review actually requires it.

For CI and Actions:

- start from workflow, job, and step status rather than full raw logs;
- inspect the failed step or relevant error range first;
- do not fetch full Actions logs by default;
- normally reuse successful PASS results without reading their full raw logs;
- reuse an already-established failure signature instead of repeatedly retrieving the same failing output;
- expand to broader logs only when targeted evidence cannot identify the failure.

Do not repeatedly enumerate the full repository tree. Search known paths or relevant directories first and expand only when the required evidence remains unresolved.

If a result is truncated, narrow the query, path, identifier, or requested range instead of repeating the same oversized retrieval.

Reuse previously established evidence by default. Refetch or revalidate when relevant authority, source/SHA, contract, changed scope, failure signature, or the question being answered has materially changed.

These are default efficiency rules, not absolute prohibitions. Broader retrieval is appropriate when targeted evidence cannot establish the result, including whole-scope comparison, final diff review, unknown-cause debugging, security-sensitive inspection, or genuine cross-file analysis.

## Failure ownership and validation gates

Classify failures by the layer that owns them. Do not cascade one failure into unrelated layers.

Typical ownership boundaries include:

- stale dependency → affected downstream consumer/projection;
- schema/manifest mismatch → producer or manifest owner;
- semantic/relation parity failure → semantic or relation owner;
- validator drift → validator/tooling maintenance;
- Project Check routing failure → Project Check owner;
- localization failure → localization/presentation owner;
- asset resolution failure → asset/resolver/manifest owner;
- build/type/route failure → frontend/build owner;
- deployment/hosted failure → hosting/deployment/route owner;
- interaction/responsive failure → browser/UI owner.

### Diagnostic probe result classification

Temporary or ad-hoc diagnostic probes are evidence-gathering tools, not owning validators. Keep their result semantics separate from Project Check's external `PASS / REVIEW / BLOCKER` contract.

- If a diagnostic probe executes correctly and the queried candidate, key, relation, file, symbol, or record is absent, treat that as a valid negative observation. The probe may record an internal status such as `EXPECTED_MISS`, but it should not fail the workflow solely because the observation is negative unless presence was itself the explicit completion condition.
- A probe execution failure, unavailable required tool/source, malformed input, or inability to collect the intended evidence is not an `EXPECTED_MISS`. Classify the actual tooling/evidence failure separately. If the missing capability is required for the current completion condition, it is a `BLOCKER`; otherwise keep it as non-blocking `REVIEW`.
- Cleanup-only failures that occur after the required diagnostic evidence or artifact was successfully produced do not invalidate that evidence. Record them as tooling/cleanup `REVIEW` unless they prevent a required repository state or required deliverable.
- An owning validator hard failure remains a `BLOCKER`. Never downgrade an owning validator failure merely because a temporary diagnostic probe would have treated the same observation as non-blocking.
- When a diagnostic internal status must be projected through Project Check, preserve the existing contract: use `PASS` when the probe completed and its negative observation satisfies the diagnostic purpose, `REVIEW` for non-blocking tooling/cleanup uncertainty, `BLOCKER` only for failures that prevent the required completion condition, and `MANUAL_REVIEW` when no explicit owner rule exists.

#### Diagnostic probe result schema

When a temporary or ad-hoc diagnostic probe emits a machine-readable result, use a two-level schema so internal diagnostic detail never expands or replaces Project Check's external status contract.

```json
{
  "internalStatus": "PASS | EXPECTED_MISS | TOOLING_UNAVAILABLE | CLEANUP_RACE | PROBE_IMPLEMENTATION_ERROR",
  "projectCheckStatus": "PASS | REVIEW | BLOCKER | MANUAL_REVIEW",
  "owner": "tooling-or-explicit-probe-owner",
  "stage": "probe-or-discovery-stage",
  "reason": "STABLE_MACHINE_READABLE_REASON",
  "completionRequired": true,
  "evidence": {
    "artifact": "optional-artifact-or-path",
    "summary": "short factual observation"
  },
  "nextAction": "continue | alternate_evidence | retry_probe | cleanup_handoff | stop | manual_review"
}
```

Rules for this schema:

- `internalStatus` describes what happened inside the diagnostic probe. It does not by itself decide whether the owning task stops.
- `projectCheckStatus` is the only status projected into orchestration. It must remain one of the existing Project Check outcomes plus `MANUAL_REVIEW` for unmatched ownership.
- `completionRequired` states whether this evidence path is required for the current work unit's completion condition. The same tooling failure may therefore project to `BLOCKER` when required and `REVIEW` when optional.
- `reason` should be a stable machine-readable code such as `TARGET_NOT_PRESENT`, `REQUIRED_TOOL_UNAVAILABLE`, `PROBE_SCRIPT_ERROR`, or `POST_RESULT_CLEANUP_CONFLICT`; do not encode semantic conclusions into the reason field.
- `evidence` must record only evidence actually produced by the probe. Do not synthesize missing relations or meanings in this result object.
- `nextAction` is advisory routing for the current owner. It must not perform owner propagation or semantic recomputation.

Default projection guidance:

| Internal diagnostic result | Default Project Check projection | Default next action |
| --- | --- | --- |
| `PASS` | `PASS` | `continue` |
| `EXPECTED_MISS` | `PASS` when the negative observation completes the probe purpose; otherwise `REVIEW` | `alternate_evidence` or `continue` |
| `TOOLING_UNAVAILABLE` | `BLOCKER` if required, otherwise `REVIEW` | `stop` or `alternate_evidence` |
| `CLEANUP_RACE` | `REVIEW` unless required repository state was not achieved | `cleanup_handoff` |
| `PROBE_IMPLEMENTATION_ERROR` | `BLOCKER` if the probe is required and no reusable evidence exists; otherwise `REVIEW` | `retry_probe` or `alternate_evidence` |

Do not use this schema to soften invariant checks. If the workflow is an owning validator whose explicit contract requires an object, relation, parity condition, or repository state to exist, its hard failure remains a `BLOCKER` rather than an `EXPECTED_MISS`.

#### Diagnostic capability preflight

Before starting a diagnostic path that depends on repository, workflow, log, artifact, external-source, runtime-analysis, or similar capabilities, perform one narrow capability preflight for the capabilities that are actually required by that work unit.

- Check capability availability before interpreting any lookup or probe result. A failed capability check is a tooling/evidence condition, never evidence that the queried semantic target is absent.
- Do not add repository code that probes ChatGPT connectors, session state, or other caller-specific integrations. Those capabilities are outside repository ownership unless an explicit repository contract says otherwise.
- Reuse a successful preflight for the same work unit while the relevant session, authority, source, and capability set have not materially changed. Do not repeatedly re-probe healthy capabilities before every lookup.
- Keep the preflight minimal. Check only the capabilities required for the current path, such as repository read, workflow/job/log read, artifact access, source hydration, or runtime-analysis tool execution.
- If a required capability is unavailable, emit `internalStatus: TOOLING_UNAVAILABLE`, `reason: REQUIRED_TOOL_UNAVAILABLE`, and project it to `BLOCKER`. If the capability is optional because an authoritative alternate evidence path exists, project it to `REVIEW` and continue through that alternate path.
- A successful capability preflight does not imply the diagnostic target exists. Target absence after a successful probe remains `EXPECTED_MISS` when allowed by the probe contract.
- A capability becoming unavailable after evidence was already produced does not invalidate that evidence by itself. Preserve the produced evidence and classify the later tooling failure separately.

A preflight result may be recorded using the diagnostic schema. For example:

```json
{
  "internalStatus": "PASS",
  "projectCheckStatus": "PASS",
  "owner": "tooling-or-explicit-probe-owner",
  "stage": "preflight",
  "reason": "REQUIRED_CAPABILITIES_AVAILABLE",
  "completionRequired": true,
  "evidence": {
    "summary": "required diagnostic capabilities are available"
  },
  "nextAction": "continue"
}
```

Do not create a new shared preflight framework, workflow, or dependency solely to satisfy this rule. Add durable automation only when a recurring repository-owned capability has an explicit owner and a demonstrated regression or contract need.

#### Narrow orchestration fail-fast

Do not infer stop/continue behavior from raw workflow, job, or process conclusions alone. Orchestration must consume the owning validator result or the diagnostic result projected through the existing Project Check contract.

- Stop the current work unit on `BLOCKER` when the blocker belongs to the current owner and prevents the explicit completion condition.
- Stop or hand off on `TOOLING_UNAVAILABLE` only when the unavailable capability is required and no authoritative alternate evidence path can satisfy the completion condition.
- Continue on `PASS`.
- Continue the current owner on `REVIEW` when the issue is explicitly non-blocking; record the review item without reopening completed upstream semantics.
- `EXPECTED_MISS` is not a stop signal by itself. Follow its projected `PASS` or `REVIEW` result and use `nextAction` to continue or select alternate evidence.
- `CLEANUP_RACE` is not a stop signal after required evidence was successfully produced unless the cleanup failure prevents a required repository state or deliverable.
- `PROBE_IMPLEMENTATION_ERROR` stops only when that probe is required for completion and no reusable or authoritative alternate evidence exists. Otherwise preserve existing evidence and continue through retry or alternate evidence.
- `MANUAL_REVIEW` means ownership or routing is unresolved. Do not guess an owner or silently continue as if the path were validated.
- A red GitHub Actions conclusion, nonzero diagnostic exit code, or failed cleanup step is not sufficient by itself to classify the owning work unit as `BLOCKER`.
- An owning validator hard failure remains fail-closed and must not be downgraded by these diagnostic routing rules.

Do not add broad owner propagation or result reinterpretation to implement this policy. The orchestration boundary remains `changed path → explicit owner → independent validator → PASS / REVIEW / BLOCKER`, with `MANUAL_REVIEW` for unmatched ownership.

For frontend-related work, distinguish the gates:

```text
Preflight
→ Build
→ Deployment / Hosted
→ Browser / UI
```

A PASS at one gate does not imply the next gate passes. Do not run every gate mechanically for every change; use only the gates required by the actual changed scope and user impact.

A CI failure is not automatically a regression. Check whether the current diff changed the failing area, whether the same failure exists on the exact base/main, and whether the failing check is required for the current completion condition. Classify unrelated baseline failures as existing drift rather than reopening completed domains.

## Git workflow and baseline hygiene

Use normal, non-destructive Git history by default. Do not force-push or rewrite published history unless the user explicitly requests it and understands the consequences.

Before creating an implementation branch:

1. establish the intended baseline HEAD;
2. confirm there is no unrelated existing diff or work to carry forward;
3. create the branch from that exact baseline;
4. verify the new branch starts at the same HEAD.

Prefer small, reversible changes. Keep commits focused and leave the repository in a working state after changes. Do not perform large-scale deletions, renames, migrations, or structural rewrites without first explaining the intended changes and receiving user approval.

Never commit credentials, access tokens, private keys, passwords, or other secrets.

## Checkpoints and resume behavior

Close a work unit with a checkpoint when the result will be resumed or handed off. Include, as relevant:

- authoritative predecessor/source;
- baseline branch and commit/SHA;
- completed scope;
- changed paths;
- owning validator/result;
- blockers;
- non-blocking review or existing drift;
- next owner;
- next starting point;
- conditions that would reopen the completed work.

On resume, confirm current authority and continue from the last incomplete owning layer. Do not restart earlier completed investigation merely because time passed, a new chat started, or a non-blocking review remains open.
