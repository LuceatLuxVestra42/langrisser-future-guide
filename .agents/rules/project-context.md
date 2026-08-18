# Project Context and Working Rules

## Project purpose

This repository is the production website for a Langrisser Mobile future-information guide. The current goal is to replace the old Google Sites presentation layer with a clearer web interface while continuing to use Google Sheets / Google Drive as major information and source-material stores.

The long-term project may expand from future-server information into a broader reference site covering characters, equipment, soldiers, events, SP systems, bonds, casting patterns, skins, and related game information.

## Repository roles

- `LuceatLuxVestra42/langrisser-future-guide`: production website source code and final web-ready assets.
- `LuceatLuxVestra42/Data`: original images, high-resolution source material, work-in-progress assets, comparison material, screenshots, and other production/reference resources.
- Google Sheets / Google Drive: game information, working data, historical sheet material, and reference resources.

Do not treat the production repository as an archive for every source asset. Keep only assets that are actually needed by the website, preferably optimized for web delivery.

## Development principles

- Preserve working behavior unless the requested task requires a change.
- Prefer small, testable, reversible changes over broad rewrites.
- Build and validate smaller pages or features before expanding the same pattern across the site.
- Check both desktop and mobile behavior when a UI change can affect responsive layout.
- Prioritize clarity and easy navigation over decorative complexity.
- Do not add services, databases, frameworks, or dependencies without a concrete need.

## Safety rules

- Treat external source materials and the `Data` repository as read-only unless the user explicitly requests a modification.
- Never delete, move, rename, overwrite, or reorganize external Google Drive materials without explicit approval.
- Before large-scale deletion, renaming, migration, or structural rewriting in this repository, explain the intended change and obtain user approval.
- Never commit passwords, tokens, API keys, private keys, credentials, or other secrets.
- Do not force-push or rewrite published Git history unless explicitly requested.

## Data and asset rules

- Do not guess uncertain mappings between characters, game IDs, internal English names, filenames, skills, equipment, soldiers, or other entities.
- When sources disagree, report the discrepancy rather than silently choosing a value.
- Preserve useful original identifiers when available so future automation and cross-source matching remain possible.
- Keep source/original assets separate from final web assets. Prefer copying and transforming source files rather than overwriting originals.
- For web images, optimize for the smallest practical file size that preserves visually meaningful quality at the actual display size rather than maximizing source-resolution quality.

## Decision handling

Treat project decisions as one of these states when relevant:

- Confirmed: established project rule or implemented decision.
- Provisional: current direction that may change after implementation/testing.
- Undecided: not sufficiently reviewed or approved.

Do not silently promote provisional or undecided ideas into confirmed requirements.
