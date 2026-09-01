# Soldier Training Material Assets A7 — Soldier UI Integration

상태: `PASS / PREDEPLOY_COMPLETE`

## 현재 상태

- Preflight: **PASS**
- Build: **PASS**
- Deployment/Hosted: **BLOCKED_AWAITING_AUTHORITATIVE_PAGES_DEPLOY**
- Browser/UI: **BLOCKED_UNTIL_HOSTED_PASS**

Build PASS를 Hosted PASS로 간주하지 않는다. 현재 작업 브랜치는 authoritative GitHub Pages 배포 commit이 아니므로 Hosted/Browser gate는 의도적으로 열어 두지 않는다.

## authoritative predecessor

- `data/manifests/soldier-training-material-assets-a6-webp.v1.json`
- expected/current blob: `69af732325de4ddcb0c2ca3bedc5eac9da8edee0` / `69af732325de4ddcb0c2ca3bedc5eac9da8edee0`
- A6: `PASS / COMPLETE`
- A6 WebP: **24/24 lossless decoded-pixel + alpha parity**

## A7 consumer

- helper: `src/lib/soldier-training-material-assets.ts`
- component: `src/components/soldier-detail-modal.tsx`
- identity: `itemId` direct map
- asset: `public/images/soldier-training-materials-webp/{itemId}.webp`
- UI: 비-SP 용병 상세의 `레벨별 소모재료 → 총 소모재료` 카드에 아이콘 표시
- 기존 수량/레벨 계산은 변경하지 않음

## Preflight 결과

`target=24 / unique itemId=24 / WebP path=24 / repository hash parity=24 / 172x172=24 / pixel parity=24 / alpha parity=24 / errors=0`

## boundaries

- semantic/ConfigData 재계산 없음
- raw ConfigData runtime fallback 없음
- name JOIN / ID arithmetic / fuzzy / visual matching 없음
- A5 PNG / A6 WebP 변경 없음
- SP 전직 재료 표현 변경 없음
- Hosted/Browser 실패가 발생해도 semantic upstream을 자동 재개하지 않음

## 실제 BLOCKER

`AUTHORITATIVE_GITHUB_PAGES_DEPLOYMENT_NOT_YET_AT_A7_COMMIT`

## 다음 시작점

A7.3 Deployment/Hosted Gate against authoritative GitHub Pages commit, then A7.4 Browser/UI Gate.

## 다시 열리는 조건

- A6 manifest blob 또는 24 WebP hash 변경
- itemId -> WebP path 1:1 parity 파손
- frontend가 frozen A6 helper를 우회해 다른 asset identity를 생성
- Hosted에서 base-path/direct-entry/static asset failure 발견 시 presentation/hosting 계층만 재개
