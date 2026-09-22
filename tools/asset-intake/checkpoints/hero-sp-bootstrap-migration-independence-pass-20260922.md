# Hero SP bootstrap migration independence PASS — 2026-09-22

## Status

```text
PASS_SP_BOOTSTRAP_ARCHITECTURE
PASS_SP_ASSET_INTAKE_MIGRATION_INDEPENDENCE
CURRENT_FROZEN_SP_25_POPULATION = COMPLETE
```

This checkpoint is a resume pointer and downstream Asset Intake migration result. It is not a canonical Hero semantic source.

## Authority and scope

- access mode: remote-only
- main base used by this branch: `933b36014b661a612d0b898c41072bfc61f9a149`
- source branch: `test/asset-portability-cleanroom-20260922`
- canonical Hero/relation semantics were not reopened
- accepted source census: `0823dbd04c06cdce8fcb12a584c2b563ab803fb0`
- accepted production SP manifest status: `PASS_SP_25_ARTWORK_MATERIALIZED`
- scope: current frozen 25-Hero SP artwork population
- non-scope: future SP additions, skin assets, soldier assets, base Hero artwork, other asset domains

## Architecture test

Successful run:

```text
workflow run = 35673128439
execution head = a37c39a60fd1c3362b5d7bddc9bdd48c75c03b77
final = PASS_SP_BOOTSTRAP_ARCHITECTURE
```

Frozen package:

```text
hero-sp-bootstrap-v1.tar
SHA256 = b1c601d74fdf34bf12a61aceed49ec7611567c8dad0c1868350c5e932300e100
payloadDigest = sha256:7419b9e570e0ba37b3e25edf766df9028bd76dfd62a38c0f449edb05084763ca
files = 61
records = 5
```

Two separate GitHub-hosted runners each created a fresh local Git repository with no remote and no checkout of the source repository. Consumers received only the frozen bootstrap artifact after host Python/.NET setup.

During materialization:

- Asset Intake runtime was absent.
- source repository checkout/history was absent.
- existing SP WebP input was absent.
- existing production manifest input was absent.
- Python dependencies came only from the vendored wheelhouse.
- Spine C# runtime source came only from the vendored pinned source tree.
- GitHub runtime access was blocked.
- PyPI runtime access was blocked.
- only the official installer source host was allowed for asset acquisition.

Representative Hero IDs `[6, 13, 29, 37, 56]` reproduced the frozen WebP SHA256 values in both independent runs.

Negative controls also passed:

```text
missing contract
→ FAIL_MISSING_ASSET_CONTRACT

tampered bundle SHA256
→ FAIL_SOURCE_HASH_MISMATCH
```

## Current frozen SP25 domain test

Successful run:

```text
workflow run = 35673502676
execution head = 2e9985aa3eaed94510e5083a61c2a401a697b41d
final = PASS_SP_ASSET_INTAKE_MIGRATION_INDEPENDENCE
```

Frozen package:

```text
hero-sp-bootstrap-v1.tar
SHA256 = bd7a87f31ec6fe37f38075c12d4fc58df051439906963b45ee3a87133bcef217
payloadDigest = sha256:d64eba7c693be7ac699da29c4b47df64f4760b7f3d2d65acc046b3af715926d7
records = 25
```

Population:

```text
[1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 25, 26, 27, 29, 33, 37, 40, 53, 55, 56, 60, 67, 89]
```

Both independent destination repositories regenerated all 25 assets from the official installer under the same network boundary.

Deterministic comparison:

```text
manifest SHA256 A
=
manifest SHA256 B
=
123fb3920ad56645ec2ac3500cfe8be839275012690758b5d7c0105dc127f438

all 25 WebP SHA256 values A
=
all 25 WebP SHA256 values B
=
the frozen production expectations
```

The minimal frontend consumer also passed using only:

```text
HeroID
→ generated manifest
→ generated WebP
```

It did not consume CharImageID, sourceSpinePath, or the bootstrap contract directly.

## Migration boundary

For the current frozen SP25 population:

```text
SOURCE REPOSITORY
Asset Intake
  = discovery / investigation / validation / maintenance producer

          ↓ produces

Frozen bootstrap package
  = migration dependency

          ↓ destination boundary

NEW REPOSITORY
materializer
  ↓
generated manifest + generated WebP
  ↓
frontend
```

Therefore Asset Intake runtime is not required in the destination repository for current frozen SP25 production materialization.

Python 3.11 and .NET SDK 8.0.425 remain host prerequisites. The package itself carries the Python wheelhouse and pinned Spine runtime source.

## Evidence artifacts

Architecture final proof:

```text
artifact 10671244514
digest sha256:b374343502dba4e70ead4ba6e72d5d60a55016c912e8c3d2adec7bfabf99c4eb
```

SP25 final proof:

```text
artifact 10672241216
digest sha256:8780065fb5cfc07731477bc3d554ca4dfcffc65f9be4d1c7ee8ffa88de2e9866
```

Durable repository results:

```text
tools/asset-intake/experiments/hero-sp-bootstrap-migration/result.architecture.v1.json
tools/asset-intake/experiments/hero-sp-bootstrap-migration/result.sp25-migration-independence.v1.json
tools/asset-intake/experiments/hero-sp-bootstrap-migration/hero-sp-25-contract.v1.json
```

## Reopen conditions

Do not reopen the completed architecture result merely for additional confidence.

Reopen the relevant result only if one of these materially changes:

- explicit HeroID/CharImageID/SP source relation contract
- official installer provenance contract
- extractor semantics
- renderer/runtime contract
- deterministic output contract
- bootstrap package format/integrity contract
- one of the frozen SP25 output parity checks fails

A future SP Hero addition is a population delta. Validate the new record through the same contract rather than re-running semantic discovery for the already frozen 25.
