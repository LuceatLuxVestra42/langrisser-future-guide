# Hero List Stage 4 checkpoint

- status: `PASS_WITH_REVIEW`
- completion: `COMPLETE`
- predecessor: Hero List Stage 3 `PASS_WITH_REVIEW / COMPLETE`
- frozen Hero: `267 / 267`
- Stage 6 admitted detail routes: `267 / 267`

## Completed

- file-existence-only Hero card artwork resolver
  - expected path: `public/images/heroes/cards/{heroId}.png`
  - browser path only when the file actually exists: `/images/heroes/cards/{heroId}.png`
  - Unity `sourceArtworkPath` is retained only as a source locator and is never converted into a browser URL by inference
- artwork manifest `data/generated/hero-card-artwork-stage4.v1.json`
  - resolved: `0 / 267`
  - pending asset input: `267 / 267`
  - malformed: `0`
  - Stage 6 missing: `0`
  - hard error: `0`
- Hero list cards now navigate to `/heroes/{heroId}`
- invalid/noncanonical Hero IDs use not-found handling
- detail route shell exists for all 267 frozen Heroes
- detail-route admission uses the frozen Stage 6 manifest only; full Stage 6 shards are not loaded at runtime in Stage 4
- base-path-safe artwork URL handling for GitHub Pages

## Validation

### Production

- Stage 4 preflight: PASS
- production CI run: `33060181892`
- production build: PASS
- generated `/heroes/$heroId` route: PASS
- TypeScript: PASS

### Hosted QA

- Static Pages Preview run: `33060482272` PASS
- QA source commit: `11654b379faccad7781c2727da83c861128a8433`
- gh-pages deploy commit: `bf99bb3de9cea53aad819d326e4ce1a7047d0890`
- existing Equipment detail static pages preserved: `373`
- Hero detail static pages generated: `267`
- representative routes: `/heroes/1` (매튜), `/heroes/6` (레온)
- repository base: `/langrisser-future-guide/`

## Production boundary

- raw ConfigData read: no
- Hero semantic Stage 4/5 fallback: no
- relationship reconstruction: no
- name/ID heuristic relation: no
- Unity artwork locator → browser URL inference: no
- runtime full Stage 6 shard read: no

## Review notes

Actual Hero artwork files are not currently present in the repository or the connected Drive source. Therefore artwork coverage is intentionally `0 / 267`; this is not treated as a fabricated failure or filled with guessed paths. The resolver contract is complete, and real files can be added later without changing the routing/data contract.

Interactive browser/responsive visual review remains non-blocking presentation review.

## Deferred

- actual Hero card artwork import / coverage increase
- full Hero detail blocks from individual frozen Stage 6 shards
- confirmed Korean faction/origin presentation labels
- release chronology/display ordering
- fusion-power badge metadata
- SSR solo-limited presentation metadata
- interactive browser/responsive visual QA

## Next start

Stage 5 can expand the 267-Hero route shell using per-Hero Stage 6 shard reads only. Actual artwork can be imported independently under the frozen Stage 4 resolver contract.
