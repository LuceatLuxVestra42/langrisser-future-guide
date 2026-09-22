# Hero SP Bootstrap Migration Experiment

Status: PASS_SP_ASSET_INTAKE_MIGRATION_INDEPENDENCE / COMPLETE

Purpose: prove that the tested Hero SP asset contract can be consumed by fresh Git repositories that do not checkout, mount, or query the source repository and do not contain Asset Intake runtime tooling.

## Boundary

Producer side may use this repository to build one frozen bootstrap tarball. Consumer jobs receive only that tarball plus its SHA256 sidecar.

Consumer materialization must use:
- the frozen bootstrap package,
- preinstalled Python 3.11 and .NET SDK 8.0.425 hosts,
- official game installer data from mhmnzupdate.zlongame.com.

Consumer materialization must not use:
- tools/asset-intake,
- the source repository checkout/history/remote,
- existing generated SP WebP files,
- an existing production manifest,
- GitHub/PyPI/package registries after the bootstrap artifact has been received,
- name joins, ID arithmetic, filename-similarity relation creation, or silent fallback.

The five architecture representatives are Hero IDs 6, 13, 29, 37, and 56.

PASS boundary: PASS_SP_BOOTSTRAP_ARCHITECTURE.


## Completed results

- Representative architecture: `PASS_SP_BOOTSTRAP_ARCHITECTURE`
- Current frozen SP25 population: `PASS_SP_ASSET_INTAKE_MIGRATION_INDEPENDENCE`
- Durable evidence: `result.architecture.v1.json`, `result.sp25-migration-independence.v1.json`
- Resume checkpoint: `tools/asset-intake/checkpoints/hero-sp-bootstrap-migration-independence-pass-20260922.md`

The destination-side runtime dependency is the frozen bootstrap package, not Asset Intake. Python 3.11 and .NET SDK 8.0.425 remain host prerequisites; Python wheels and the pinned Spine runtime source are carried inside the bootstrap package.
