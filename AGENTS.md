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
