# Project Working Rules

This repository contains the production website for the Langrisser future guide project.

## Safety and scope

- Treat source/reference materials outside this repository as read-only unless the user explicitly asks to modify them.
- Do not modify, move, rename, or delete files in external Google Drive folders or other source repositories without explicit user approval.
- Do not perform large-scale deletions, renames, migrations, or structural rewrites in this repository without first explaining the intended changes and receiving user approval.
- Prefer small, reversible changes. Preserve existing working behavior unless a requested change requires otherwise.
- Never commit credentials, access tokens, private keys, passwords, or other secrets.

## Data handling

- Do not guess mappings between game IDs, filenames, characters, skills, equipment, soldiers, or other game data when the relationship is uncertain.
- When reference sources disagree, report the discrepancy instead of silently choosing one value.
- Keep original/source assets separate from final website assets. Copy and transform source material rather than overwriting the original whenever possible.
- Preserve useful original identifiers (such as internal English names or IDs) when creating normalized website data, when available.

## External references

External websites, wikis, repositories, and Drive folders supplied for this project are reference sources. Use them for comparison and verification; their presence does not authorize bulk collection, modification, deletion, or redistribution.

When using external reference data:

1. Prefer the source appropriate to the task (for example, current Chinese-server information for latest CN data and Korean references for established Korean terminology).
2. Cross-check uncertain mappings when practical.
3. If a mapping or interpretation cannot be verified, mark it as uncertain and ask the user rather than inventing a value.

## Git workflow

- Use normal, non-destructive Git history by default.
- Do not force-push or rewrite published history unless the user explicitly requests it and understands the consequences.
- Keep commits focused and leave the repository in a working state after changes.
