# Hero SP Asset Portability Clean-room Experiment

## Purpose

This directory prepares a clean-room portability test for the already proven Hero SP artwork asset flow. It is a downstream Asset Intake experiment only. It does not change Hero canonical identity, ConfigData semantics, Status Source, Project Status, or production frontend behavior.

## Scope

- Five representative Hero fixtures: 6, 13, 29, 37, 56.
- Explicit HeroID -> CharImageID -> official installer package/bundle -> exact prefab evidence.
- Exact renderer source is copied into the clean-room bundle; runtime execution must not read this repository or its Git history.
- Existing public/images/heroes/sp WebP files and the current production manifest are forbidden as inputs.
- name JOIN, ID arithmetic, filename-similarity relation creation, and historical-output fallback are forbidden.

## Setup

From the repository checkout:

    python tools/asset-intake/experiments/hero-sp-portability/prepare_cleanroom.py

This creates /tmp/langrisser-asset-portability-sp from an explicit allowlist and rejects a target located inside any Git checkout.

Install the exact Python dependency set recorded from the successful historical render job:

    python -m pip install -r /tmp/langrisser-asset-portability-sp/requirements.lock.txt

The execution environment also requires Python 3.11 and dotnet SDK 8.0.425.

Readiness check:

    cd /tmp/langrisser-asset-portability-sp
    python run_cleanroom.py

Execute:

    python run_cleanroom.py --execute

## PASS boundary

PASS_CLEANROOM_SP_PORTABILITY requires all five cases to be reacquired from official installer 1.1.113, resolved by explicit fixture IDs, rendered with Spine 3.3.05 idle_Normal@0, materialized to WebP, and matched against previously proven width/height/geometry/output SHA256 evidence.

A successful setup alone is not the portability PASS. Setup completion is PASS_CLEANROOM_PREPARED; the actual experiment remains open until run_cleanroom.py --execute succeeds in the isolated workspace.

## Authority boundary

fixture.v1.json is a portability-test fixture derived from accepted prior evidence. It is not a current canonical semantic source and must not be promoted into one by this experiment.
