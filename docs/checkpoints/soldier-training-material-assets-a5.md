# Soldier Training Material Assets A5 — Repository Admission

상태: `PASS / COMPLETE / READY_FOR_A6_WEBP_DELIVERY`

## 목적

A4에서 24/24 verified 및 Asset Intake RESOLVED 된 원본 PNG bytes를 변경 없이 repository-owned source asset으로 admission한다. semantic relation, WebP, resolver, frontend는 이 단계에서 변경하지 않는다.

## authoritative predecessor

- `data/evidence/soldier-training-material-assets-a4-bulk.v1.json` — blob `a365af67ed8c6b9df4707662be0c8dcc33e1d36a`
- A4 verified source assets: **24/24**

## repository contract

- source root: `public/images/soldier-training-materials`
- naming: `{itemId}.png`
- source bytes: A4 SHA-256와 **exact parity**
- canonical mapping: `itemId -> A4 sourceFullPath/Drive file ID -> repositoryPath`

## 결과

`target=24 / repository PNG=24 / source hash parity=24 / PNG=24 / 172x172=24 / RGBA8=24 / missing=0 / extras=0 / errors=0`

## artifacts

- `data/manifests/soldier-training-material-assets-a5.v1.json`
- `data/validation/soldier-training-material-assets-a5.v1.json`
- `public/images/soldier-training-materials/{itemId}.png` (24 files)
- `scripts/admit-soldier-training-material-assets-a5.py`
- `.github/workflows/soldier-training-material-assets-a5.yml`

## boundaries

- semantic/ConfigData 재계산 없음
- A4 itemId/FULL_PATH/Drive file ID/hash 관계 변경 없음
- name JOIN / ID arithmetic / fuzzy / visual matching 없음
- PNG bytes 재인코딩 없음
- WebP 생성 없음
- resolver/frontend 변경 없음

## 다음 시작점

A6 WebP delivery. A5 repository-owned PNG 24개를 authoritative source로 사용해 lossless WebP를 생성하고 PNG decode parity 및 24/24 delivery manifest를 검증한다.

## 다시 열리는 조건

- A4 predecessor blob 또는 24 source hash 변경
- repository PNG SHA-256가 A4 hash와 불일치
- itemId -> repositoryPath 1:1 parity 파손
