# Soldier Training Material Assets A6 — WebP Delivery

상태: `PASS / COMPLETE / READY_FOR_A7_SOLDIER_UI_INTEGRATION`

## 목적

A5에서 repository-owned source asset으로 admission한 PNG 24개만 authoritative source로 사용해 lossless WebP delivery asset을 생성하고, decoded RGBA pixel parity를 24/24 검증한다. semantic relation, resolver, frontend는 이 단계에서 변경하지 않는다.

## authoritative predecessor

- `data/manifests/soldier-training-material-assets-a5.v1.json` — blob `a50f35c6f46aae5b2dfd243df70092706ba87093`
- `data/validation/soldier-training-material-assets-a5.v1.json` — `PASS / COMPLETE / READY_FOR_A6_WEBP_DELIVERY`
- source root: `public/images/soldier-training-materials`

## delivery contract

- output root: `public/images/soldier-training-materials-webp`
- naming: `{itemId}.webp`
- encoder: Pillow `11.3.0`
- WebP: `lossless=True / quality=100 / method=6 / exact=True`
- acceptance: PNG/WebP decoded `RGBA` bytes exact parity + alpha parity

## 결과

`target=24 / source PNG=24 / WebP=24 / 172x172=24 / decoded pixel parity=24 / alpha parity=24 / missing=0 / extras=0 / errors=0`

PNG total bytes: `704068`
WebP total bytes: `488278`
bytes saved: `215790`

## artifacts

- `data/manifests/soldier-training-material-assets-a6-webp.v1.json`
- `data/validation/soldier-training-material-assets-a6.v1.json`
- `public/images/soldier-training-materials-webp/{itemId}.webp` (24 files)
- `scripts/deliver-soldier-training-material-assets-a6.py`
- `.github/workflows/soldier-training-material-assets-a6.yml`

## boundaries

- semantic/ConfigData 재계산 없음
- A5 PNG 24개 변경 없음
- itemId/source relation 변경 없음
- name JOIN / ID arithmetic / fuzzy / visual matching 없음
- resolver/frontend 변경 없음

## 다음 시작점

A7 Soldier UI integration. A6 manifest와 ID 기반 WebP path를 presentation consumer에 연결하고 Preflight -> Build -> Hosted/Deployment -> Browser/UI 순서로 검증한다.

## 다시 열리는 조건

- A5 manifest blob 또는 source PNG SHA-256 변경
- WebP decoded RGBA pixel parity 파손
- 24개 ID/path 1:1 delivery parity 파손
